import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const app = express();
const PORT = process.env.PORT || 7000;

// ---------- Middleware ----------
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use((req, _res, next) => {
  if (req.path.startsWith('/cfg/')) return next();

  if (/^\/(catalog|meta|stream)\//.test(req.path)) {
    const token = extractCfgFromReq(req);
    if (token) {
      // Always rewrite to a clean path version; drop old query entirely.
      const newUrl = `/cfg/${token}${req.path}`;
      console.log('[LEGACY → PATH]', req.url, '→', newUrl);
      req.url = newUrl;
    }
  }
  next();
});


// ---------- Health ----------
app.get('/', (_req, res) => {
  res.json({ ok: true, name: 'stremio-youtube-backend', time: new Date().toISOString() });
});

// ---------- Helpers ----------
function extractCfgFromReq(req) {
  // 1) direct ?cfg=
  if (req.query && req.query.cfg) return String(req.query.cfg);

  // 2) addon / addonUrl contain the manifest URL
  const raw = String(req.query?.addon || req.query?.addonUrl || '');
  if (!raw) return '';

  let urlStr = raw;
  try { urlStr = decodeURIComponent(raw); } catch {}

  // path-based: .../cfg/<TOKEN>/manifest.json
  const mPath = urlStr.match(/\/cfg\/([^/]+)\/manifest\.json/i);
  if (mPath && mPath[1]) return mPath[1];

  // query-based: .../manifest.json?cfg=<TOKEN>
  const mQuery = urlStr.match(/[?&]cfg=([^&#]+)/i);
  if (mQuery && mQuery[1]) return mQuery[1];

  return '';
}
function toB64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(b64) {
  const fixed = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '=');
  return Buffer.from(fixed, 'base64').toString('utf8');
}
function encodeCfg(cfgObj) { return toB64Url(JSON.stringify(cfgObj)); }
function decodeCfg(token) { try { return JSON.parse(fromB64Url(token)); } catch { return null; } }

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
    const html = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'PREF=hl=en'
      }
    }).then(r => r.data);
    const m = html.match(/"channelId":"(UC[0-9A-Za-z_-]{20,})"/);
    if (m) return m[1];
  } catch {}
  return null;
}

async function fetchChannelRSS(channelId) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const xml = await axios.get(feedUrl, { timeout: 12000 }).then(r => r.data);
  return parseStringPromise(xml);
}

async function searchChannels(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`;
  const html = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'PREF=hl=en'
    }
  }).then(r => r.data);

  let m = html.match(/ytInitialData"\s*:\s*(\{.+?\})\s*[,<]/s) || html.match(/var\s+ytInitialData\s*=\s*(\{.+?\})\s*;/s);
  if (!m) return [];

  let data; try { data = JSON.parse(m[1]); } catch { return []; }

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

// Channel profile (title + avatar)
const profileCache = new Map(); // UCid -> { title, avatar }
async function fetchChannelProfile(channelId) {
  if (!channelId) return null;
  if (profileCache.has(channelId)) return profileCache.get(channelId);

  try {
    const url = `https://www.youtube.com/channel/${channelId}`;
    const html = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'PREF=hl=en'
      }
    }).then(r => r.data);

    const ogImg = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1];
    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];

    let avatar = ogImg || null;
    if (!avatar) {
      let m = html.match(/ytInitialData"\s*:\s*(\{.+?\})\s*[,<]/s) || html.match(/var\s+ytInitialData\s*=\s*(\{.+?\})\s*;/s);
      if (m) {
        try {
          const data = JSON.parse(m[1]);
          const thumbs = data?.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails;
          avatar = thumbs?.slice(-1)?.[0]?.url || null;
        } catch {}
      }
    }
    const out = { title: ogTitle || `Channel ${channelId.slice(0,8)}…`, avatar };
    profileCache.set(channelId, out);
    return out;
  } catch { return null; }
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
// ---------- Channel ID cache & resolver ----------
const idCache = new Map();

async function ensureChannelId(raw) {
  if (!raw) return null;
  if (idCache.has(raw)) return idCache.get(raw);

  // Fast path: already a UC… YouTube channel ID
  if (/^UC[0-9A-Za-z_-]{20,}$/.test(raw)) {
    idCache.set(raw, raw);
    return raw;
  }

  const id = await resolveChannelId(raw);
  if (id) idCache.set(raw, id);
  return id || null;
}
// ---- noisy tracer for everything under /cfg/<token>/... ----
app.use('/cfg/:token', (req, _res, next) => {
  console.log('[CFG HIT]', req.method, req.originalUrl);
  next();
});

// ---------- Manifest (path-based, plain JSON) ----------
app.get('/cfg/:token/manifest.json', (req, res) => {
  try {
    const token = String(req.params.token || '');
    const cfg = token ? decodeCfg(token) : null;
    if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

    const manifest = {
      id: 'ca.3hp.youtube.universe', // was 'org.cary.youtube.universe'
version: '1.0.1',              // bump

      name: `YouTube Universe${cfg.lowQuota !== false ? ' • Low-quota' : ''}`,
      description: `User-configured YouTube catalog${cfg.lowQuota !== false ? ' • Low-quota mode (RSS)' : ''}`,
      catalogs: [
        { type: 'series', id: 'youtube-user', name: 'YouTube Channels', extra: [{ name: 'search', isRequired: false }] }
      ],
      resources: ['catalog', 'meta', 'stream'],
      types: ['series', 'movie'],
      idPrefixes: ['ytc:', 'ytv:']
    };

    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(JSON.stringify(manifest));
  } catch (e) {
    console.error('manifest route error:', e && (e.stack || e.message || e));
    res.status(500).json({ error: 'handler_error', detail: e && (e.stack || e.message || String(e)) });
  }
});

// ---------- Explicit resource routes ----------

// CATALOG: /cfg/<token>/catalog/series/youtube-user.json
app.get('/cfg/:token/catalog/:type/:id.json', async (req, res) => {
  const token = String(req.params.token || '');
  const cfg = token ? decodeCfg(token) : null;
  res.set('Content-Type', 'application/json; charset=utf-8');
res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
return res.json({ metas: metas.filter(Boolean) });
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const { type, id } = req.params;
  if (type !== 'series' || id !== 'youtube-user') return res.json({ metas: [] });

  try {
    const metas = await Promise.all((cfg.channels || []).slice(0, 100).map(async (raw) => {
      try {
        const channelId = await ensureChannelId(raw);
        const safeKey = channelId || toB64Url(raw);

        // friendly name + avatar
        let title = String(raw).startsWith('@') ? raw : `Channel ${channelId?.slice(0,8) ?? String(raw).slice(0,8)}…`;
        let poster = 'https://i.imgur.com/PsWn3oM.png';

        if (channelId) {
          const prof = await fetchChannelProfile(channelId);
          if (prof?.title)  title  = prof.title;
          if (prof?.avatar) poster = prof.avatar;

          // fallback to RSS thumb if avatar missing
          if (!prof?.avatar) {
            try {
              const feed = await fetchChannelRSS(channelId);
              poster = feed?.feed?.entry?.[0]?.['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url || poster;
            } catch {}
          }
        }

        return { id: `ytc:${safeKey}`, type: 'series', name: title, poster, posterShape: 'square' };
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
// ---------- LEGACY (?cfg=...) COMPATIBILITY ROUTES ----------
// Some Web Stremio builds still call these. We just proxy to the same logic.

// /catalog/:type/:id.json?cfg=<token>
app.get('/catalog/:type/:id.json', async (req, res) => {
  const token = extractCfgFromReq(req);
const cfg = decodeCfg(token);

  if (!cfg) return res.status(400).json({ metas: [] });

  const { type, id } = req.params;
  if (type !== 'series' || id !== 'youtube-user') return res.json({ metas: [] });

  try {
    const metas = await Promise.all((cfg.channels || []).slice(0, 100).map(async (raw) => {
      try {
        const channelId = await ensureChannelId(raw);
        const safeKey   = channelId || toB64Url(raw);

        let title  = String(raw).startsWith('@') ? raw : `Channel ${channelId?.slice(0,8) ?? String(raw).slice(0,8)}…`;
        let poster = 'https://i.imgur.com/PsWn3oM.png';

        if (channelId) {
          const prof = await fetchChannelProfile(channelId);
          if (prof?.title)  title  = prof.title;
          if (prof?.avatar) poster = prof.avatar;
          if (!prof?.avatar) {
            try {
              const feed = await fetchChannelRSS(channelId);
              poster = feed?.feed?.entry?.[0]?.['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url || poster;
            } catch {}
          }
        }

        return { id: `ytc:${safeKey}`, type: 'series', name: title, poster, posterShape: 'square' };
      } catch { return null; }
    }));

    res.set('Content-Type', 'application/json; charset=utf-8');
    res.json({ metas: metas.filter(Boolean) });
  } catch (e) {
    console.error('[LEGACY catalog] error:', e);
    res.status(500).json({ error: 'handler_error', detail: String(e) });
  }
});

// /meta/:type/:id.json?cfg=<token>
app.get('/meta/:type/:id.json', async (req, res) => {
  const token = extractCfgFromReq(req);
const cfg = decodeCfg(token);
  res.set('Content-Type', 'application/json; charset=utf-8');
res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
return res.json({ meta: { ... } });

  if (!cfg) return res.status(400).json({ meta: {} });

  let rawId = String(req.params.id || '');
  try { rawId = decodeURIComponent(rawId); } catch {}

  let key = rawId.startsWith('ytc:') ? rawId.slice(4) : rawId;
  if (!/^UC[0-9A-Za-z_-]{20,}$/.test(key)) { try { key = fromB64Url(key); } catch {} }
  const channelId = /^UC/.test(key) ? key : await ensureChannelId(key);

  let title  = `Channel ${channelId || key}`;
  let poster = 'https://i.imgur.com/PsWn3oM.png';
  let videos = [];

  if (channelId) {
    const prof = await fetchChannelProfile(channelId);
    if (prof?.title)  title  = prof.title;
    if (prof?.avatar) poster = prof.avatar;
  }

  if (cfg.lowQuota !== false && channelId) {
    try {
      const feed = await fetchChannelRSS(channelId);
      title = feed?.feed?.title?.[0] || title;
      const entries = feed?.feed?.entry || [];
      videos = entries.map(e => {
        const t = e['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url;
        return {
          id: `ytv:${e['yt:videoId']?.[0]}`,
          type: 'movie',
          name: e.title?.[0] || 'Video',
          releaseInfo: e.published?.[0]?.slice(0,10),
          poster: t,
          thumbnail: t,
          background: t
        };
      }).filter(v => v.id);
      if (poster === 'https://i.imgur.com/PsWn3oM.png' && entries[0]) {
        poster = entries[0]['media:group']?.[0]?.['media:thumbnail']?.[0]?.$.url || poster;
      }
    } catch (e) {
      console.error('[LEGACY meta] rss fail:', e && (e.message || e));
    }
  }

  res.set('Content-Type', 'application/json; charset=utf-8');
  res.json({
    meta: {
      id: rawId.startsWith('ytc:') ? rawId : `ytc:${channelId || key}`,
      type: 'series',
      name: title,
      poster,
      videos,
      links: channelId ? [{ name: 'Channel on YouTube', url: `https://www.youtube.com/channel/${channelId}` }] : []
    }
  });
});

// /stream/:type/:id.json?cfg=<token>
app.get('/stream/:type/:id.json', (req, res) => {
  const token = extractCfgFromReq(req);
const cfg = decodeCfg(token);
res.set('Content-Type', 'application/json; charset=utf-8');
res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
return res.json({ streams });
  if (!cfg) return res.status(400).json({ streams: [] });

  const id = String(req.params.id || '');
  if (!id.startsWith('ytv:')) return res.json({ streams: [] });

  const videoId = id.slice(4);
  const link = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.json({
    streams: [{
      name: 'YouTube',
      title: 'Open on YouTube',
      externalUrl: link,
      url: link,
      behaviorHints: { openExternal: true, notWebReady: true }
    }]
  });
});

// META: accept ytc:<UC|b64>, bare UC, or b64(raw). Type ignored.
app.get('/cfg/:token/meta/:_type/:id.json', async (req, res) => {
  const token = String(req.params.token || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  let rawId = String(req.params.id || '');
  try { rawId = decodeURIComponent(rawId); } catch {}

  // Normalize key
  let key = rawId.startsWith('ytc:') ? rawId.slice(4) : rawId;

  // Try to decode base64-url; if that fails, leave as-is
  if (!/^UC[0-9A-Za-z_-]{20,}$/.test(key)) {
    try { key = fromB64Url(key); } catch {}
  }

  let channelId = /^UC[0-9A-Za-z_-]{20,}$/.test(key) ? key : await ensureChannelId(key);

  console.log('[META]', { rawId, key, channelId, lowQuota: cfg.lowQuota });

  // Always return some meta (prevents "{}")
  let title  = `Channel ${channelId || key}`;
  let poster = 'https://i.imgur.com/PsWn3oM.png';
  let videos = [];

  if (channelId) {
    const prof = await fetchChannelProfile(channelId);
    if (prof?.title)  title  = prof.title;
    if (prof?.avatar) poster = prof.avatar;
  }

  if (cfg.lowQuota !== false && channelId) {
    try {
      const feed = await fetchChannelRSS(channelId);
      title = feed?.feed?.title?.[0] || title;
      const entries = feed?.feed?.entry || [];
      videos = entries.map(e => {
        const t = e['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url;
        return {
          id: `ytv:${e['yt:videoId']?.[0]}`,
          type: 'movie',
          name: e.title?.[0] || 'Video',
          releaseInfo: e.published?.[0]?.slice(0,10),
          poster: t,
          thumbnail: t,
          background: t
        };
      }).filter(v => v.id);
      if (poster === 'https://i.imgur.com/PsWn3oM.png' && entries[0]) {
        poster = entries[0]['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url || poster;
      }
      console.log('[META OK]', { videoCount: videos.length });
    } catch (e) {
      console.error('[META RSS FAIL]', channelId, e && (e.message || e));
    }
  }

  res.set('Content-Type', 'application/json; charset=utf-8');
  return res.json({
    meta: {
      id: rawId.startsWith('ytc:') ? rawId : `ytc:${channelId || key}`,
      type: 'series',
      name: title,
      poster,
      videos,
      links: channelId ? [{ name: 'Channel on YouTube', url: `https://www.youtube.com/channel/${channelId}` }] : []
    }
  });
});

// STREAM: /cfg/<token>/stream/<any-type>/ytv:<videoId>.json
app.get('/cfg/:token/stream/:type/:id.json', (req, res) => {
  const token = String(req.params.token || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const id = String(req.params.id || '');
  if (!id.startsWith('ytv:')) return res.json({ streams: [] });

  const videoId = id.slice(4);
  if (!videoId) return res.json({ streams: [] });

  const link = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const streams = [
    {
      name: 'YouTube',
      title: 'Open on YouTube',
      externalUrl: link,
      url: link, // extra compatibility
      behaviorHints: { openExternal: true, notWebReady: true }
    }
  ];

  res.set('Content-Type', 'application/json; charset=utf-8');
  res.json({ streams });
});

// ---------- Optional debug ----------
app.get('/manifest.json', (req, res) => {
  const token = String(req.query.cfg || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const manifest = {
    id: 'ca.3hp.youtube.universe', // was 'org.cary.youtube.universe'
version: '1.0.1',              // bump

    name: `YouTube Universe${cfg.lowQuota !== false ? ' • Low-quota' : ''}`,
    description: `User-configured YouTube catalog${cfg.lowQuota !== false ? ' • Low-quota mode (RSS)' : ''}`,
    catalogs: [{ type: 'series', id: 'youtube-user', name: 'YouTube Channels', extra: [{ name: 'search', isRequired: false }] }],
    resources: ['catalog', 'meta', 'stream'],
    types: ['series', 'movie'],
    idPrefixes: ['ytc:', 'ytv:']
  };

  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(JSON.stringify(manifest));
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
