import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { addonBuilder } from 'stremio-addon-sdk';

const app = express();
const PORT = process.env.PORT || 7000;

// ---------- Middleware ----------
app.use(cors({ origin: '*' }));
app.use(express.json());

// ---------- Health ----------
app.get('/', (_req, res) => {
  res.json({ ok: true, name: 'stremio-youtube-backend', time: new Date().toISOString() });
});

// ---------- Helpers ----------
function toB64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}
function fromB64Url(b64) {
  const fixed = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '=');
  return Buffer.from(fixed, 'base64').toString('utf8');
}
function encodeCfg(cfgObj) {
  return toB64Url(JSON.stringify(cfgObj));
}
function decodeCfg(token) {
  try { return JSON.parse(fromB64Url(token)); }
  catch { return null; }
}

async function resolveChannelId(input) {
  const raw = String(input || '').trim();

  // UC… provided
  if (/^UC[0-9A-Za-z_-]{20,}$/.test(raw)) return raw;

  // /channel/UC… in URL
  const direct = raw.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]{20,})/i);
  if (direct) return direct[1];

  // Try handles or vanity URLs by scraping the page
  let url;
  if (raw.startsWith('@')) url = `https://www.youtube.com/${raw}`;
  else if (/youtube\.com\//i.test(raw)) url = raw;
  else url = `https://www.youtube.com/@${raw}`;

  try {
    const html = await axios.get(url, { timeout: 8000 }).then(r => r.data);
    const m = html.match(/"channelId":"(UC[0-9A-Za-z_-]{20,})"/);
    if (m) return m[1];
  } catch { /* noop */ }

  return null;
}

async function fetchChannelRSS(channelId) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const xml = await axios.get(feedUrl, { timeout: 10000 }).then(r => r.data);
  const parsed = await parseStringPromise(xml);
  return parsed;
}

// Robust YouTube channel search (no API key)
async function searchChannels(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`; // channels only
  const html = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'PREF=hl=en'
    }
  }).then(r => r.data);

  // Try both shapes for ytInitialData
  let m = html.match(/ytInitialData"\s*:\s*(\{.+?\})\s*[,<]/s);
  if (!m) m = html.match(/var\s+ytInitialData\s*=\s*(\{.+?\})\s*;/s);
  if (!m) return [];

  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }

  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const results = [];

  for (const sec of sections) {
    const items = sec?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const ch = item?.channelRenderer;
      if (!ch) continue;
      const channelId = ch?.channelId;
      const title = ch?.title?.simpleText || ch?.title?.runs?.[0]?.text;
      const thumb = ch?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url;
      const subs = ch?.subscriberCountText?.simpleText || (ch?.subscriberCountText?.runs || []).map(r => r.text).join('') || '';
      const desc = (ch?.descriptionSnippet?.runs || []).map(r => r.text).join('') || '';
      if (channelId && title) {
        results.push({ channelId, title, thumbnail: thumb, subscribers: subs, description: desc });
      }
    }
  }
  return results;
}

// ---------- RSS API (for your frontend Configurator) ----------

// Suggestions for freeform text (name/host/handle/etc.)
app.get('/suggest', async (req, res) => {
  const q = String(req.query.query || '').trim();
  if (!q) return res.status(400).json({ error: 'missing query' });
  try {
    const hits = await searchChannels(q);
    res.json({ query: q, suggestions: hits.slice(0, 8) });
  } catch {
    res.status(502).json({ error: 'search_failed' });
  }
});

// Resolve URL/@handle/UCid or fall back to suggestions
app.get('/resolve', async (req, res) => {
  const input = String(req.query.input || '');
  if (!input) return res.status(400).json({ error: 'missing input' });

  const channelId = await resolveChannelId(input);
  if (channelId) {
    try {
      const feed = await fetchChannelRSS(channelId);
      const title = feed?.feed?.title?.[0] || `Channel ${channelId.slice(0,8)}…`;
      const firstThumb = feed?.feed?.entry?.[0]?.['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url;
      return res.json({ channelId, title, thumbnail: firstThumb });
    } catch {
      return res.json({ channelId, title: `Channel ${channelId.slice(0,8)}…` });
    }
  }

  // Fall back: search and return suggestions
  try {
    const hits = await searchChannels(input);
    if (hits.length) {
      return res.status(404).json({ error: 'ambiguous', suggestions: hits.slice(0, 8) });
    }
  } catch {}

  return res.status(404).json({ error: 'channel not found' });
});

// Feed: latest videos via RSS
app.get('/feed', async (req, res) => {
  const channelId = String(req.query.channelId || '');
  if (!/^UC[0-9A-Za-z_-]{20,}$/.test(channelId)) {
    return res.status(400).json({ error: 'invalid channelId' });
  }
  try {
    const feed = await fetchChannelRSS(channelId);
    const entries = feed?.feed?.entry || [];
    const videos = entries.map(e => ({
      id: e['yt:videoId']?.[0],
      title: e.title?.[0],
      published: e.published?.[0],
      link: e.link?.[0]?.$.href,
      thumbnail: e['media:group']?.[0]?.['media:thumbnail']?.[0]?.$.url
    }));
    res.json({ channelId, videos });
  } catch {
    res.status(502).json({ error: 'rss_fetch_failed' });
  }
});

// ---------- Config → Install URLs ----------
function publicBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  return `${proto}://${host}`;
}

// backend/index.js
app.post('/create-config', (req, res) => {
  const body = req.body || {};
  const cfg = {
    channels: Array.isArray(body.channels) ? body.channels.slice(0, 100) : [],
    lowQuota: body.lowQuota !== undefined ? !!body.lowQuota : true
  };

  const token = encodeCfg(cfg);
  const base  = publicBaseUrl(req);

  // Path-based manifest so the token survives all addon calls
  const manifest = `${base}/cfg/${token}/manifest.json`;

  // ✅ Correct installer links
  const webStremio   = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifest)}`;
  const desktopDeep  = `stremio://${manifest}`;

  res.json({
    token,
    manifest_url: manifest,
    web_stremio_install: webStremio,
    desktop_stremio_install: desktopDeep
  });
});



// ---------- Stremio Addon (multi-tenant via cfg token) ----------
const idCache = new Map();

async function ensureChannelId(raw) {
  if (idCache.has(raw)) return idCache.get(raw);
  const id = await resolveChannelId(raw);
  if (id) idCache.set(raw, id);
  return id || null;
}

function buildAddon({ channels = [], lowQuota = true }) {
  const manifest = {
    id: 'org.cary.youtube.universe',
    version: '1.0.0',
    name: `YouTube Universe${lowQuota ? ' • Low-quota' : ''}`,
    description: `User-configured YouTube catalog${lowQuota ? ' • Low-quota mode (RSS)' : ''}`,
    catalogs: [
      { type: 'series', id: 'youtube-user', name: 'YouTube Channels', extra: [{ name: 'search', isRequired: false }] }
    ],
    resources: ['catalog', 'meta', 'stream'],
    types: ['series', 'movie'],
    idPrefixes: ['ytc:', 'ytv:']
  };

  const builder = new addonBuilder(manifest);

  // Catalog
  builder.defineCatalogHandler(async ({ type, id }) => {
    if (type !== 'series' || id !== 'youtube-user') return { metas: [] };

    const metas = await Promise.all(channels.map(async (raw) => {
      const channelId = await ensureChannelId(raw);      // UC… or null
      const safeKey   = channelId || toB64Url(raw);      // <-- no slashes!
      const name      = raw.startsWith('@') ? raw : (channelId ? `Channel ${channelId.slice(0,8)}…` : raw);
      return {
        id: `ytc:${safeKey}`,
        type: 'series',
        name,
        poster: 'https://i.imgur.com/PsWn3oM.png',
        posterShape: 'square'
      };
    }));

    return { metas };
  });

  // Meta
  builder.defineMetaHandler(async ({ id }) => {
    if (!id.startsWith('ytc:')) return { meta: {} };

    let key = id.slice(4);             // UC… or b64url(raw)
    if (!/^UC/.test(key)) {
      try { key = fromB64Url(key); } catch {}
    }
    const channelId = /^UC/.test(key) ? key : await ensureChannelId(key);

    let videos = [];
    if (lowQuota && channelId) {
      try {
        const feed = await fetchChannelRSS(channelId);
        const entries = feed?.feed?.entry || [];
        videos = entries.map(e => ({
          id: `ytv:${e['yt:videoId']?.[0]}`,
          type: 'movie',
          name: e.title?.[0] || 'Video',
          releaseInfo: e.published?.[0]?.slice(0,10),
          poster: e['media:group']?.[0]?.['media:thumbnail']?.[0]?.$.url,
          background: e['media:group']?.[0]?.['media:thumbnail']?.[0]?.$.url
        }));
      } catch { /* ignore */ }
    }

    return {
      meta: {
        id,
        type: 'series',
        name: `Channel ${channelId || key}`,
        poster: 'https://i.imgur.com/PsWn3oM.png',
        videos
      }
    };
  });

  // Stream stays the same
  builder.defineStreamHandler(async ({ id }) => {
    if (!id.startsWith('ytv:')) return { streams: [] };
    const videoId = id.slice(4);
    return { streams: [{ title: 'Watch on YouTube', url: `https://www.youtube.com/watch?v=${videoId}` }] };
  });

  return builder.getInterface();
}


// Manifest
// One router to rule them all: delegate everything under /cfg/:token to Stremio SDK
app.use('/cfg/:token', (req, res) => {
  const token = String(req.params.token || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const addon = buildAddon(cfg);

  try {
    addon.serveHTTP(req, res);  // SDK takes over from here
  } catch (e) {
    console.error('serveHTTP error:', e && (e.stack || e.message || e));
    res.status(500).json({
      error: 'handler_error',
      detail: e && (e.stack || e.message || String(e))
    });
  }
});

app.get('/manifest.json', (req, res) => {
  const token = String(req.query.cfg || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) {
    console.warn('manifest: invalid cfg', token.slice(0, 24));
    return res.status(400).json({ error: 'invalid cfg' });
  }
  const addon = buildAddon(cfg);
  // Be explicit: some proxies misbehave with res.json + compression
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(JSON.stringify(addon.manifest));
});
app.get('/_cfg_debug', (req, res) => {
  const token = String(req.query.cfg || '');
  const cfg = token ? decodeCfg(token) : null;
  res.json({ ok: !!cfg, cfg, tokenPreview: token.slice(0, 24) });
});


// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});
