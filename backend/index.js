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
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(b64) {
  const fixed = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '=');
  return Buffer.from(fixed, 'base64').toString('utf8');
}
function encodeCfg(cfgObj) {
  return toB64Url(JSON.stringify(cfgObj));
}
function decodeCfg(token) {
  try { return JSON.parse(fromB64Url(token)); } catch { return null; }
}

async function resolveChannelId(input) {
  const raw = String(input || '').trim();
  if (/^UC[0-9A-Za-z_-]{20,}$/.test(raw)) return raw;

  const direct = raw.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]{20,})/i);
  if (direct) return direct[1];

  let url;
  if (raw.startsWith('@')) url = `https://www.youtube.com/${raw}`;
  else if (/youtube\.com\//i.test(raw)) url = raw;
  else url = `https://www.youtube.com/@${raw}`;

  try {
    const html = await axios.get(url, { timeout: 8000 }).then(r => r.data);
    const m = html.match(/"channelId":"(UC[0-9A-Za-z_-]{20,})"/);
    if (m) return m[1];
  } catch { /* ignore */ }

  return null;
}

async function fetchChannelRSS(channelId) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const xml = await axios.get(feedUrl, { timeout: 10000 }).then(r => r.data);
  const parsed = await parseStringPromise(xml);
  return parsed;
}

async function searchChannels(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`;
  const html = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'PREF=hl=en'
    }
  }).then(r => r.data);

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
      const channelId = ch.channelId;
      const title = ch.title?.simpleText || ch.title?.runs?.[0]?.text;
      const thumb = ch.thumbnail?.thumbnails?.slice(-1)?.[0]?.url;
      const subs = ch.subscriberCountText?.simpleText || (ch.subscriberCountText?.runs || []).map(r => r.text).join('') || '';
      const desc = (ch.descriptionSnippet?.runs || []).map(r => r.text).join('') || '';
      if (channelId && title) results.push({ channelId, title, thumbnail: thumb, subscribers: subs, description: desc });
    }
  }
  return results;
}

// ---------- Frontend helper API ----------
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

app.get('/resolve', async (req, res) => {
  const input = String(req.query.input || '');
  if (!input) return res.status(400).json({ error: 'missing input' });

  const channelId = await resolveChannelId(input);
  if (channelId) {
    try {
      const feed = await fetchChannelRSS(channelId);
      const title = feed?.feed?.title?.[0] || `Channel ${channelId.slice(0, 8)}…`;
      const firstThumb = feed?.feed?.entry?.[0]?.['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url;
      return res.json({ channelId, title, thumbnail: firstThumb });
    } catch {
      return res.json({ channelId, title: `Channel ${channelId.slice(0, 8)}…` });
    }
  }

  try {
    const hits = await searchChannels(input);
    if (hits.length) return res.status(404).json({ error: 'ambiguous', suggestions: hits.slice(0, 8) });
  } catch {}

  return res.status(404).json({ error: 'channel not found' });
});

app.get('/feed', async (req, res) => {
  const channelId = String(req.query.channelId || '');
  if (!/^UC[0-9A-Za-z_-]{20,}$/.test(channelId)) return res.status(400).json({ error: 'invalid channelId' });

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
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

app.post('/create-config', (req, res) => {
  const body = req.body || {};
  const cfg = {
    channels: Array.isArray(body.channels) ? body.channels.slice(0, 100) : [],
    lowQuota: body.lowQuota !== undefined ? !!body.lowQuota : true
  };

  const token = encodeCfg(cfg);
  const base = publicBaseUrl(req);

  const manifest = `${base}/cfg/${token}/manifest.json`;
  const webStremio = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifest)}`;
  const desktopDeep = `stremio://${manifest}`;

  res.json({ token, manifest_url: manifest, web_stremio_install: webStremio, desktop_stremio_install: desktopDeep });
});

// ---------- Stremio Addon (logic we also reuse below) ----------
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
    catalogs: [{ type: 'series', id: 'youtube-user', name: 'YouTube Channels', extra: [{ name: 'search', isRequired: false }] }],
    resources: ['catalog', 'meta', 'stream'],
    types: ['series', 'movie'],
    idPrefixes: ['ytc:', 'ytv:']
  };
  return new addonBuilder(manifest).getInterface();
}

// ---------- Manifest (path-based) ----------
app.get('/cfg/:token/manifest.json', (req, res) => {
  const token = String(req.params.token || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const addon = buildAddon(cfg);
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(JSON.stringify(addon.manifest));
});

// ---------- Explicit resource routes (no SDK HTTP delegation) ----------
// CATALOG
app.get('/cfg/:token/catalog/:type/:id.json', async (req, res) => {
  const token = String(req.params.token || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const { type, id } = req.params;
  if (type !== 'series' || id !== 'youtube-user') return res.json({ metas: [] });

  try {
    const metas = await Promise.all((cfg.channels || []).slice(0, 100).map(async (raw) => {
      try {
        const channelId = await ensureChannelId(raw);
        const safeKey = channelId || toB64Url(raw);

        // Try to get a friendly name & thumbnail from RSS
        let title = String(raw);
        let thumb = 'https://i.imgur.com/PsWn3oM.png';
        if (channelId) {
          try {
            const feed = await fetchChannelRSS(channelId);
            title = feed?.feed?.title?.[0] || title;
            const t = feed?.feed?.entry?.[0]?.['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url;
            if (t) thumb = t;
          } catch { /* ignore */ }
        }

        return { id: `ytc:${safeKey}`, type: 'series', name: title, poster: thumb, posterShape: 'square' };
      } catch (e) {
        console.error('catalog: skip raw=', raw, e);
        return null;
      }
    }));
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.json({ metas: metas.filter(Boolean) });
  } catch (e) {
    console.error('catalog error:', e);
    res.status(500).json({ error: 'handler_error', detail: String(e) });
  }
});

// META
app.get('/cfg/:token/meta/:type/:id.json', async (req, res) => {
  const token = String(req.params.token || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const { type } = req.params;
  const rawId = String(req.params.id || '');
  if (type !== 'series' || !rawId.startsWith('ytc:')) return res.json({ meta: {} });

  try {
    let key = rawId.slice(4); // UC… or b64url(raw)
    if (!/^UC/.test(key)) {
      try { key = fromB64Url(key); } catch {}
    }
    const channelId = /^UC/.test(key) ? key : await ensureChannelId(key);

    // Default name/poster
    let title = `Channel ${channelId || key}`;
    let thumb = 'https://i.imgur.com/PsWn3oM.png';

    let videos = [];
    if (cfg.lowQuota !== false && channelId) {
      try {
        const feed = await fetchChannelRSS(channelId);
        title = feed?.feed?.title?.[0] || title;
        const entries = feed?.feed?.entry || [];
        videos = entries.map(e => ({
          id: `ytv:${e['yt:videoId']?.[0]}`,
          type: 'movie',
          name: e.title?.[0] || 'Video',
          releaseInfo: e.published?.[0]?.slice(0, 10),
          poster: e['media:group']?.[0]?.['media:thumbnail']?.[0]?.$.url,
          background: e['media:group']?.[0]?.['media:thumbnail']?.[0]?.$.url
        })).filter(v => v.id);
        const t = entries?.[0]?.['media:group']?.[0]?.['media:thumbnail']?.[0]?.$.url;
        if (t) thumb = t;
      } catch (e) {
        console.error('meta: rss fetch failed for', channelId, e);
      }
    }

    res.set('Content-Type', 'application/json; charset=utf-8');
    res.json({ meta: { id: rawId, type: 'series', name: title, poster: thumb, videos } });
  } catch (e) {
    console.error('meta error:', e);
    res.status(500).json({ error: 'handler_error', detail: String(e) });
  }
});

// STREAM
app.get('/cfg/:token/stream/:type/:id.json', (req, res) => {
  const token = String(req.params.token || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const { type } = req.params;
  const id = String(req.params.id || '');
  if (type !== 'movie' || !id.startsWith('ytv:')) return res.json({ streams: [] });

  const videoId = id.slice(4);
  const streams = videoId ? [
    // Open in browser (lightweight, ToS-friendly)
    { name: 'YouTube', title: 'Open on YouTube', externalUrl: `https://www.youtube.com/watch?v=${videoId}` }
  ] : [];

  res.set('Content-Type', 'application/json; charset=utf-8');
  res.json({ streams });
});

// ---------- Optional debug ----------
app.get('/manifest.json', (req, res) => {
  const token = String(req.query.cfg || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });
  const addon = buildAddon(cfg);
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
