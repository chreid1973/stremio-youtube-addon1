import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { addonBuilder } from 'stremio-addon-sdk';

const app = express();
const PORT = process.env.PORT || 7000;

// ---------- Middleware ----------
app.use(cors({ origin: '*' })); // tighten later if you want
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

  // Try handles or vanity URLs by scraping the page (robust enough for MVP)
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

// ---------- RSS API (for your frontend Configurator) ----------

// GET /resolve?input=<url|@handle|UCid>
// returns { channelId, title, thumbnail? }
app.get('/resolve', async (req, res) => {
  const input = String(req.query.input || '');
  if (!input) return res.status(400).json({ error: 'missing input' });

  const channelId = await resolveChannelId(input);
  if (!channelId) return res.status(404).json({ error: 'channel not found' });

  let title = `Channel ${channelId.slice(0,8)}…`;
  let thumbnail;

  try {
    const feed = await fetchChannelRSS(channelId);
    title = feed?.feed?.title?.[0] || title;

    // Try to construct a thumbnail from the first entry
    const firstThumb = feed?.feed?.entry?.[0]?.['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url;
    if (firstThumb) thumbnail = firstThumb;
  } catch { /* ignore */ }

  res.json({ channelId, title, thumbnail });
});

// GET /feed?channelId=UC...
// returns { channelId, videos: [{ id,title,published,link,thumbnail }] }
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
  } catch (err) {
    res.status(502).json({ error: 'rss_fetch_failed' });
  }
});

// ---------- Config → Install URLs ----------

function publicBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  return `${proto}://${host}`;
}

// POST /create-config  { channels: string[], lowQuota?: boolean }
// returns { token, manifest_url, web_stremio_install }
app.post('/create-config', (req, res) => {
  const body = req.body || {};
  const cfg = {
    channels: Array.isArray(body.channels) ? body.channels.slice(0, 100) : [],
    lowQuota: body.lowQuota !== undefined ? !!body.lowQuota : true // default RSS low-quota
  };
  const token = encodeCfg(cfg);
  const base = publicBaseUrl(req);
  const manifest = `${base}/manifest.json?cfg=${token}`;
  const webStremio = `https://web.strem.io/#/addons/catalog?addonUrl=${encodeURIComponent(manifest)}`;

  res.json({
    token,
    manifest_url: manifest,
    web_stremio_install: webStremio
  });
});

// ---------- Stremio Addon (multi-tenant via cfg token) ----------

const idCache = new Map(); // raw -> UC id

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

  // Catalog: list configured channels as "series"
  builder.defineCatalogHandler(async ({ type, id }) => {
    if (type !== 'series' || id !== 'youtube-user') return { metas: [] };

    const metas = await Promise.all(channels.map(async (raw) => {
      const channelId = await ensureChannelId(raw);
      const name = raw.startsWith('@') ? raw : (channelId ? `Channel ${channelId.slice(0,8)}…` : raw);
      return {
        id: `ytc:${channelId || raw}`,
        type: 'series',
        name,
        poster: 'https://i.imgur.com/PsWn3oM.png',
        posterShape: 'square'
      };
    }));

    return { metas };
  });

  // Meta: show channel videos via RSS
  builder.defineMetaHandler(async ({ id }) => {
    if (!id.startsWith('ytc:')) return { meta: {} };
    let key = id.slice(4);
    let channelId = /^UC/.test(key) ? key : await ensureChannelId(key);

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
      } catch { /* show empty list if RSS fails */ }
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

  // Stream: hand back YouTube watch URL
  builder.defineStreamHandler(async ({ id }) => {
    if (!id.startsWith('ytv:')) return { streams: [] };
    const videoId = id.slice(4);
    return { streams: [{ title: 'Watch on YouTube', url: `https://www.youtube.com/watch?v=${videoId}` }] };
  });

  return builder.getInterface();
}

// Manifest
app.get('/manifest.json', (req, res) => {
  const token = String(req.query.cfg || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });
  const addon = buildAddon(cfg);
  res.json(addon.manifest);
});

// Generic Stremio router
app.get('/:resource/:type/:id.json', async (req, res) => {
  const token = String(req.query.cfg || '');
  const cfg = token ? decodeCfg(token) : null;
  if (!cfg) return res.status(400).json({ error: 'invalid cfg' });

  const addon = buildAddon(cfg);
  const { resource, type, id } = req.params;

  try {
    if (resource === 'catalog') return res.json(await addon.get({ resource: 'catalog', type, id, extra: req.query }));
    if (resource === 'meta')    return res.json(await addon.get({ resource: 'meta', type, id, extra: req.query }));
    if (resource === 'stream')  return res.json(await addon.get({ resource: 'stream', type, id, extra: req.query }));
    res.status(404).json({ error: 'unknown resource' });
  } catch (e) {
    res.status(500).json({ error: 'handler_error', detail: String(e) });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});
