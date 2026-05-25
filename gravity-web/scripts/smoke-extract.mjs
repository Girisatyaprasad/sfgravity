const BASE = process.env.GRAVITY_BASE || 'https://sfgravity.vercel.app';
const MAX_DURATION = 180;
const DURATION_MSG =
  'This video is longer than 3 minutes and cannot be downloaded.';

const LIVE = {
  instagram: 'https://www.instagram.com/reel/C0xyz/',
  youtubeShorts: 'https://www.youtube.com/shorts/OpSs4uDEWjU',
  facebook: 'https://www.facebook.com/watch/?v=20531316728',
  youtubeLong: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

const FIXTURES = {
  instagram: `<html><meta property="og:title" content="Reel"/><meta property="og:video" content="https://cdn.example.com/v.mp4"/>"video_url":"https:\\/\\/cdn.example.com\\/a.mp4"</html>`,
  youtube: (() => {
    const player = {
      videoDetails: { title: 'Short', lengthSeconds: '45', isLive: false },
      streamingData: {
        adaptiveFormats: [
          { itag: 137, mimeType: 'video/mp4', height: 1080, url: 'https://rr1---sn.example.com/videoplayback?id=video' },
          { itag: 140, mimeType: 'audio/mp4', bitrate: 128000, url: 'https://rr1---sn.example.com/videoplayback?id=audio' },
        ],
        formats: [],
      },
    };
    return `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`;
  })(),
  facebook: `"browser_native_hd_url":"https:\\/\\/video.xx.fbcdn.net\\/hd.mp4","browser_native_sd_url":"https:\\/\\/video.xx.fbcdn.net\\/sd.mp4"`,
  youtubeLong: (() => {
    const player = {
      videoDetails: { title: 'Long', lengthSeconds: '213', isLive: false },
      streamingData: { adaptiveFormats: [{ itag: 137, mimeType: 'video/mp4', height: 720, url: 'https://v.example/v' }], formats: [] },
    };
    return `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`;
  })(),
};

function extractBalancedJson(text, startIdx) {
  let depth = 0, inStr = false, esc = false;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  return null;
}

function decodeEscapes(str) {
  if (!str) return str;
  return str.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\"/g, '"');
}

function ensureHttps(raw) {
  if (!raw) return '';
  let u = decodeEscapes(raw.trim());
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  return u;
}

function uniqUrls(list) {
  const seen = new Set();
  return list.map(ensureHttps).filter((u) => u && !seen.has(u) && seen.add(u));
}

function metaContent(html, prop) {
  let re = new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]+)"`, 'i');
  let m = html.match(re);
  if (m) return decodeEscapes(m[1]);
  re = new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${prop}"`, 'i');
  m = html.match(re);
  return m ? decodeEscapes(m[1]) : '';
}

function parseInstagram(html) {
  const urls = [];
  for (const re of [/\"video_url\"\s*:\s*\"([^\"]+)\"/g, /\"playback_url\"\s*:\s*\"([^\"]+)\"/g]) {
    let m;
    while ((m = re.exec(html)) !== null) urls.push(m[1]);
  }
  const og = metaContent(html, 'og:video') || metaContent(html, 'og:video:url');
  if (og) urls.push(og);
  const mp4 = uniqUrls(urls).filter((u) => /\.mp4/i.test(u));
  if (!mp4.length) throw new Error('No Instagram stream');
  return {
    platform: 'instagram',
    durationSeconds: null,
    qualities: mp4.map((u, i) => ({ label: i === 0 ? 'Best quality' : `Q${i + 1}`, downloadUrl: u })),
  };
}

function formatHasDirectUrl(f) {
  return f && f.url && !f.signatureCipher && !f.cipher;
}

function parseYouTube(html) {
  const idx = html.indexOf('ytInitialPlayerResponse');
  if (idx === -1) throw new Error('No ytInitialPlayerResponse');
  const brace = html.indexOf('{', idx);
  const jsonText = extractBalancedJson(html, brace);
  if (!jsonText) throw new Error('YouTube JSON parse failed');
  const data = JSON.parse(jsonText);
  const details = data.videoDetails || {};
  const streaming = data.streamingData || {};
  const durationSeconds = parseInt(details.lengthSeconds, 10);
  const qualities = [];
  const adaptive = streaming.adaptiveFormats || [];
  const videos = [];
  const audios = [];
  adaptive.forEach((f) => {
    if (!formatHasDirectUrl(f)) return;
    const mime = (f.mimeType || '').toLowerCase();
    if (mime.startsWith('video/')) videos.push(f);
    else if (mime.startsWith('audio/')) audios.push(f);
  });
  videos.sort((a, b) => (b.height || 0) - (a.height || 0));
  audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  if (videos.length && audios.length) {
    qualities.push({
      label: 'mux',
      isMuxRequired: true,
      videoUrl: ensureHttps(videos[0].url),
      audioUrl: ensureHttps(audios[0].url),
    });
  }
  if (!qualities.length) throw new Error('No YouTube streams');
  return { platform: 'youtube', durationSeconds, qualities };
}

function parseFacebook(html) {
  const urls = [];
  for (const re of [
    /\"browser_native_hd_url\"\s*:\s*\"([^\"]+)\"/g,
    /\"browser_native_sd_url\"\s*:\s*\"([^\"]+)\"/g,
  ]) {
    let m;
    while ((m = re.exec(html)) !== null) urls.push(m[1]);
  }
  const clean = uniqUrls(urls).filter((u) => /^https:\/\//i.test(u));
  if (!clean.length) throw new Error('No Facebook stream');
  const qualities = [{ label: 'HD', downloadUrl: clean[0] }];
  if (clean[1]) qualities.push({ label: 'SD', downloadUrl: clean[1] });
  return { platform: 'facebook', durationSeconds: null, qualities };
}

function enforceDurationGate(data) {
  const d = data.durationSeconds;
  if (d == null || Number.isNaN(d)) return;
  if (d > MAX_DURATION) throw new Error(DURATION_MSG);
}

async function fetchPage(targetUrl) {
  const res = await fetch(
    `${BASE}/api/fetch-page?url=${encodeURIComponent(targetUrl)}`,
    { headers: { Accept: 'text/html' } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function liveIngestionOk(url, marker) {
  const html = await fetchPage(url);
  return html.length > 500 && html.includes(marker);
}

function validateInstagram(data) {
  return data.qualities.length > 0 && data.qualities.every((q) => q.downloadUrl?.startsWith('https://'));
}

function validateYouTube(data) {
  return data.qualities.some((q) => q.isMuxRequired && q.videoUrl && q.audioUrl);
}

function validateFacebook(data) {
  return data.qualities[0]?.label === 'HD' && !!data.qualities[0]?.downloadUrl;
}

async function main() {
  const home = await fetch(BASE);
  const productionOk = home.ok;

  let instagram = false;
  let youtube = false;
  let facebook = false;
  let durationGate = false;

  try {
    const igData = parseInstagram(FIXTURES.instagram);
    instagram = validateInstagram(igData) && (await liveIngestionOk(LIVE.instagram, 'instagram'));
  } catch { /* false */ }

  try {
    const ytData = parseYouTube(FIXTURES.youtube);
    youtube =
      validateYouTube(ytData) &&
      (await liveIngestionOk(LIVE.youtubeShorts, 'ytInitialPlayerResponse'));
  } catch { /* false */ }

  try {
    const fbData = parseFacebook(FIXTURES.facebook);
    facebook = validateFacebook(fbData) && (await liveIngestionOk(LIVE.facebook, 'facebook'));
  } catch { /* false */ }

  try {
    enforceDurationGate({ durationSeconds: 213, platform: 'youtube' });
  } catch (e) {
    durationGate = e.message === DURATION_MSG;
  }
  if (!durationGate) {
    try {
      const liveHtml = await fetchPage(LIVE.youtubeLong);
      const idx = liveHtml.indexOf('ytInitialPlayerResponse');
      const brace = liveHtml.indexOf('{', idx);
      const jsonText = extractBalancedJson(liveHtml, brace);
      const data = JSON.parse(jsonText);
      const sec = parseInt(data.videoDetails?.lengthSeconds, 10);
      if (sec > MAX_DURATION) {
        try {
          enforceDurationGate({ durationSeconds: sec, platform: 'youtube' });
        } catch (e2) {
          durationGate = e2.message === DURATION_MSG;
        }
      }
    } catch { /* false */ }
  }

  console.log(
    JSON.stringify({ productionOk, instagram, youtube, facebook, durationGate })
  );
}

main();
