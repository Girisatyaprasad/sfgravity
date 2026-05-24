'use strict';

const http = require('http');
const https = require('https');
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
  '.json': 'application/json',
};

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

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

function fetchPageUpstream(target, res, cors) {
  const lib = target.startsWith('https') ? https : http;
  lib
    .get(
      target,
      {
        headers: {
          'User-Agent': DESKTOP_UA,
          Accept: 'text/html,application/json,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
      (proxyRes) => {
        const chunks = [];
        let total = 0;
        proxyRes.on('data', (c) => {
          total += c.length;
          if (total <= MAX_PAGE_BYTES) chunks.push(c);
        });
        proxyRes.on('end', () => {
          if (total > MAX_PAGE_BYTES) {
            res.writeHead(413, cors);
            res.end(JSON.stringify({ error: 'Page exceeds 5MB cap' }));
            return;
          }
          res.writeHead(proxyRes.statusCode || 200, {
            ...cors,
            'Content-Type': 'text/plain; charset=utf-8',
          });
          res.end(Buffer.concat(chunks).toString('utf-8'));
        });
      }
    )
    .on('error', (e) => {
      res.writeHead(502, cors);
      res.end(JSON.stringify({ error: e.message }));
    });
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
    fetchPageUpstream(target, res, cors);
    return;
  }

  if (req.url.startsWith('/api/proxy')) {
    const target = new URL(req.url, 'http://localhost').searchParams.get('url');
    if (!target) {
      res.writeHead(400, cors);
      res.end(JSON.stringify({ error: 'url required' }));
      return;
    }
    const lib = target.startsWith('https') ? https : http;
    lib
      .get(target, { headers: { 'User-Agent': 'SaveFromGravityPreview/2.0', Accept: '*/*' } }, (proxyRes) => {
        const chunks = [];
        proxyRes.on('data', (c) => chunks.push(c));
        proxyRes.on('end', () => {
          const buf = Buffer.concat(chunks);
          res.writeHead(proxyRes.statusCode || 200, {
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
          });
          res.end(buf);
        });
      })
      .on('error', (e) => {
        res.writeHead(502, cors);
        res.end(JSON.stringify({ error: e.message }));
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
  serveStatic(req, res, normalized);
});

server.listen(PORT, () => {
  console.log('SaveFromGravity (gravity-web) → http://localhost:' + PORT);
  console.log('Test geo: ?geo=US or ?geo=IN · APK: npm run apk:debug');
});
