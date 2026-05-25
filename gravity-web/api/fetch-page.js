import {
  collectSetCookies,
  youtubePageHeaders,
} from './youtube-session.js';

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

function applyCorpHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req, res) {
  applyCorpHeaders(res);

  const target = req.query.url;
  if (!target) {
    res.status(400).json({ error: 'url required' });
    return;
  }

  try {
    const upstream = await fetch(target, {
      headers: youtubePageHeaders(),
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Upstream HTTP ' + upstream.status });
      return;
    }

    const reader = upstream.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        res.status(413).json({ error: 'Page exceeds 5MB cap' });
        return;
      }
      chunks.push(value);
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const text = new TextDecoder('utf-8', { fatal: false }).decode(merged);

    const ytCookies = /youtube\.com|youtu\.be/i.test(target)
      ? collectSetCookies(upstream)
      : '';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (ytCookies) res.setHeader('X-Gravity-Yt-Cookies', ytCookies);
    res.status(200).send(text);
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'Upstream fetch timed out' : e.message || 'fetch failed',
    });
  }
}
