'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB_ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3001;

const GRAVITY_ROUTES = new Set([
  '/instagram-reel-downloader',
  '/instagram-video-downloader',
  '/youtube-shorts-downloader',
  '/youtube-video-downloader',
  '/facebook-video-downloader',
  '/fb-shorts-downloader',
  '/download',
  '/',
]);

const VIDEO_1080 =
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4';
const VIDEO_720 =
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';
const VIDEO_480 = 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4';
const AUDIO = 'https://filesamples.com/samples/audio/mp3/sample3.mp3';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

const FFMPEG_VENDOR = {
  core: [
    path.join(WEB_ROOT, 'vendor', 'ffmpeg', 'core'),
    path.join(WEB_ROOT, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm'),
  ],
  ffmpeg: [
    path.join(WEB_ROOT, 'vendor', 'ffmpeg', 'ffmpeg'),
    path.join(WEB_ROOT, 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm'),
  ],
  util: [
    path.join(WEB_ROOT, 'vendor', 'ffmpeg', 'util'),
    path.join(WEB_ROOT, 'node_modules', '@ffmpeg', 'util', 'dist', 'esm'),
  ],
};

function resolveFfmpegVendor(urlPath) {
  const match = urlPath.match(/^\/vendor\/ffmpeg\/(core|ffmpeg|util)\/(.+)$/);
  if (!match) return null;
  const pkg = match[1];
  const file = match[2];
  if (!FFMPEG_VENDOR[pkg] || file.includes('..')) return null;
  for (const base of FFMPEG_VENDOR[pkg]) {
    const filePath = path.join(base, file);
    if (filePath.startsWith(base) && fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function serveVendorFile(req, res, urlPath) {
  const filePath = resolveFfmpegVendor(urlPath);
  if (!filePath) return false;
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, securityHeaders(true));
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      ...securityHeaders(true),
      'Content-Type': MIME[ext] || 'application/octet-stream',
    });
    res.end(data);
  });
  return true;
}

function parseGeoFromQuery(url) {
  const match = url.match(/[?&]geo=([A-Za-z]{2})/);
  if (!match) return '';
  const code = match[1].toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function securityHeaders(isStaticAsset) {
  const headers = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };
  if (isStaticAsset) {
    headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
  }
  return headers;
}

function extractPayload(pageUrl) {
  let platform = 'other';
  if (/youtube\.com|youtu\.be/i.test(pageUrl)) platform = 'youtube';
  else if (/instagram\.com/i.test(pageUrl)) platform = 'instagram';
  else if (/facebook\.com|fb\.watch/i.test(pageUrl)) platform = 'facebook';

  if (platform === 'youtube') {
    return {
      title: 'Cinematic Sunset Short',
      platform,
      qualities: [
        { label: '1080p', isMuxRequired: true, videoUrl: VIDEO_1080, audioUrl: AUDIO },
        { label: '720p', downloadUrl: VIDEO_720 },
        { label: '480p', downloadUrl: VIDEO_480 },
      ],
    };
  }
  return {
    title: 'Imported Web Stream Clip',
    platform,
    qualities: [{ label: 'Best quality', downloadUrl: VIDEO_720 }],
  };
}

function serveStatic(req, res, urlPath) {
  let filePath;
  if (GRAVITY_ROUTES.has(urlPath)) {
    filePath = path.join(WEB_ROOT, 'index.html');
  } else {
    const resolved = urlPath === '/' ? '/index.html' : urlPath;
    filePath = path.join(WEB_ROOT, resolved);
  }

  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403, securityHeaders(false));
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const isStaticAsset = ext && ext !== '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (GRAVITY_ROUTES.has(urlPath)) {
        fs.readFile(path.join(WEB_ROOT, 'index.html'), (err2, indexData) => {
          if (err2) {
            res.writeHead(404, securityHeaders(false));
            res.end('Not found');
            return;
          }
          sendHtml(res, indexData, req.url);
        });
        return;
      }
      res.writeHead(404, securityHeaders(isStaticAsset));
      res.end('Not found');
      return;
    }

    if (ext === '.html' || GRAVITY_ROUTES.has(urlPath)) {
      sendHtml(res, data, req.url);
      return;
    }

    res.writeHead(200, {
      ...securityHeaders(true),
      'Content-Type': MIME[ext] || 'application/octet-stream',
    });
    res.end(data);
  });
}

function sendHtml(res, data, rawUrl) {
  const geo = parseGeoFromQuery(rawUrl);
  const headers = {
    ...securityHeaders(false),
    'Content-Type': 'text/html; charset=utf-8',
  };
  if (geo) {
    headers['Set-Cookie'] =
      'gravity_country=' + geo + '; Path=/; Max-Age=2592000; SameSite=Lax';
  }
  res.writeHead(200, headers);
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw));
  });
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const YT_CONSENT = 'CONSENT=YES+1';
const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

const youtubeSession = { cookies: '', referer: 'https://www.youtube.com/' };

function collectSetCookies(response) {
  if (!response || !response.headers) return '';
  if (typeof response.headers.getSetCookie === 'function') {
    const list = response.headers.getSetCookie();
    if (list && list.length) return list.map((c) => c.split(';')[0]).join('; ');
  }
  const single = response.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

function mergeYoutubeCookies(extra) {
  const parts = [YT_CONSENT];
  if (extra) parts.push(extra);
  return parts.filter(Boolean).join('; ');
}

function normalizeYoutubeReferer(pageUrl) {
  if (!pageUrl) return 'https://www.youtube.com/';
  try {
    const u = new URL(pageUrl);
    const shorts = u.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts && shorts[1]) {
      return 'https://www.youtube.com/watch?v=' + shorts[1];
    }
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      if (id) return 'https://www.youtube.com/watch?v=' + id;
    }
    return u.href;
  } catch {
    return 'https://www.youtube.com/';
  }
}

function youtubeMediaHeaders(targetUrl, opts = {}) {
  const headers = {
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (/googlevideo\.com|youtube\.com|ytimg\.com/i.test(targetUrl || '')) {
    const referer = normalizeYoutubeReferer(
      opts.referer || youtubeSession.referer || 'https://www.youtube.com/'
    );
    headers.Referer = referer;
    headers.Origin = 'https://www.youtube.com';
    headers.Cookie = mergeYoutubeCookies(opts.cookies || youtubeSession.cookies);
  }
  return headers;
}

function friendlyProxyError(status, raw) {
  if (status === 403) {
    return 'YouTube blocked the download — paste the link again, then retry within a few seconds';
  }
  if (status === 404) return 'Stream link expired — fetch the video again';
  return raw || 'Download failed';
}

async function fetchPageUpstream(target, res, cors) {
  try {
    if (/youtube\.com|youtu\.be/i.test(target)) {
      youtubeSession.referer = target;
    }
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: YT_CONSENT,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      res.writeHead(upstream.status, cors);
      res.end(JSON.stringify({ error: 'Upstream HTTP ' + upstream.status }));
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_PAGE_BYTES) {
      res.writeHead(413, cors);
      res.end(JSON.stringify({ error: 'Page exceeds 5MB cap' }));
      return;
    }

    const ytCookies = /youtube\.com|youtu\.be/i.test(target)
      ? collectSetCookies(upstream)
      : '';
    if (ytCookies) youtubeSession.cookies = ytCookies;

    const headers = {
      ...cors,
      'Content-Type': 'text/plain; charset=utf-8',
    };
    if (ytCookies) headers['X-Gravity-Yt-Cookies'] = ytCookies;

    res.writeHead(200, headers);
    res.end(buf.toString('utf-8'));
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    res.writeHead(timedOut ? 504 : 502, cors);
    res.end(
      JSON.stringify({
        error: timedOut ? 'Upstream fetch timed out' : e.message || 'fetch failed',
      })
    );
  }
}

const MAX_PROXY_BYTES = 100 * 1024 * 1024;

async function proxyUpstream(target, res, cors, opts = {}) {
  try {
    const upstream = await fetch(target, {
      headers: youtubeMediaHeaders(target, opts),
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      res.writeHead(upstream.status, cors);
      res.end(
        JSON.stringify({
          error: friendlyProxyError(upstream.status, 'Upstream HTTP ' + upstream.status),
        })
      );
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_PROXY_BYTES) {
      res.writeHead(413, cors);
      res.end(JSON.stringify({ error: 'Media exceeds size cap' }));
      return;
    }

    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    });
    res.end(buf);
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    res.writeHead(timedOut ? 504 : 502, cors);
    res.end(
      JSON.stringify({
        error: timedOut ? 'Upstream fetch timed out' : e.message || 'proxy failed',
      })
    );
  }
}

async function handleApi(req, res) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.url.startsWith('/api/extract') && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      res.writeHead(200, cors);
      res.end(JSON.stringify(extractPayload(body.url || '')));
    } catch {
      res.writeHead(400, cors);
      res.end(JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  if (req.url.startsWith('/api/fetch-page')) {
    const target = new URL(req.url, 'http://localhost').searchParams.get('url');
    if (!target) {
      res.writeHead(400, cors);
      res.end(JSON.stringify({ error: 'url required' }));
      return;
    }
    await fetchPageUpstream(target, res, cors);
    return;
  }

  if (req.url.startsWith('/api/proxy')) {
    const parsed = new URL(req.url, 'http://localhost');
    const target = parsed.searchParams.get('url');
    if (!target) {
      res.writeHead(400, cors);
      res.end(JSON.stringify({ error: 'url required' }));
      return;
    }
    await proxyUpstream(target, res, cors, {
      referer: parsed.searchParams.get('referer') || youtubeSession.referer,
      cookies: parsed.searchParams.get('cookies') || youtubeSession.cookies,
    });
    return;
  }

  res.writeHead(404, cors);
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  const urlPath = req.url.split('?')[0].replace(/\/$/, '') || '/';
  const normalized = urlPath === '' ? '/' : urlPath;
  if (normalized.startsWith('/vendor/ffmpeg/') && serveVendorFile(req, res, normalized)) {
    return;
  }
  serveStatic(req, res, normalized);
});

server.listen(PORT, () => {
  console.log('SaveFromGravity (gravity-web) → http://localhost:' + PORT);
  console.log('Test geo: ?geo=US or ?geo=IN · APK: npm run apk:debug');
});
