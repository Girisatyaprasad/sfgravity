const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_BYTES = 5 * 1024 * 1024;

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    res.status(400).json({ error: 'url required' });
    return;
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': DESKTOP_UA,
        Accept: 'text/html,application/json,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ error: e.message || 'fetch failed' });
  }
}
