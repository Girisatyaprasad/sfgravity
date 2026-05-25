const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const YT_CONSENT = 'CONSENT=YES+1';

export function collectSetCookies(response) {
  if (!response || !response.headers) return '';
  if (typeof response.headers.getSetCookie === 'function') {
    const list = response.headers.getSetCookie();
    if (list && list.length) {
      return list.map((c) => c.split(';')[0]).join('; ');
    }
  }
  const single = response.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

export function mergeYoutubeCookies(extra) {
  const parts = [YT_CONSENT];
  if (extra) parts.push(extra);
  return parts.filter(Boolean).join('; ');
}

export function youtubePageHeaders() {
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Cookie: YT_CONSENT,
  };
}

export function normalizeYoutubeReferer(pageUrl) {
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

export function youtubeMediaHeaders(targetUrl, opts = {}) {
  const headers = {
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (/googlevideo\.com|youtube\.com|ytimg\.com/i.test(targetUrl || '')) {
    const referer = normalizeYoutubeReferer(opts.referer) || 'https://www.youtube.com/';
    headers.Referer = referer;
    headers.Origin = 'https://www.youtube.com';
    headers.Cookie = mergeYoutubeCookies(opts.cookies);
  }
  return headers;
}

export function friendlyProxyError(status, raw) {
  if (status === 403) {
    return 'YouTube blocked the download — paste the link again, then retry within a few seconds';
  }
  if (status === 404) return 'Stream link expired — fetch the video again';
  return raw || 'Download failed';
}
