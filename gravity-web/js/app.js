(function () {
  'use strict';

  var chatInner = document.getElementById('chat-inner');
  var composer = document.getElementById('composer');
  var input = document.getElementById('url-input');
  var sendBtn = document.getElementById('send-btn');
  var welcome = document.getElementById('welcome');
  var busy = false;

  var STATUS = {
    thinking: 'Thinking',
    fetching: 'Fetching metadata',
    downloading: 'Downloading',
    muxing: 'Processing video'
  };

  var DESKTOP_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  var FETCH_OPTS = JSON.stringify({
    userAgent: DESKTOP_UA,
    maxBytes: 5242880,
    cookieIsolation: true
  });
  var MAX_DURATION_SEC = 180;

  var engine = {
    platformKey: 'generic',
    countryCode: 'US',
    languageKey: 'en-US',
    copy: {}
  };

  var YT_VIDEO_LABELS = {
    137: '1080p', 248: '1080p', 136: '720p', 247: '720p',
    135: '480p', 244: '480p', 134: '360p', 133: '240p', 160: '144p'
  };

  function syncEngineFromGravity(ctx) {
    if (!ctx) return;
    engine.platformKey = ctx.platformKey || engine.platformKey;
    engine.countryCode = ctx.countryCode || engine.countryCode;
    engine.languageKey = ctx.languageKey || engine.languageKey;
    engine.copy = ctx.copy || engine.copy;
  }

  function readEngineFromWindow() {
    syncEngineFromGravity(window.__GRAVITY__);
  }

  document.addEventListener('gravity:ready', function (e) {
    syncEngineFromGravity(e.detail || window.__GRAVITY__);
  }, { once: true });

  if (window.__GRAVITY__) readEngineFromWindow();

  function isNativeApp() {
    return !!(window.GravityNative && window.GravityNative.isApp && window.GravityNative.isApp());
  }

  function getApiBase() {
    if (isNativeApp()) return '';
    if (window.GRAVITY_API) return window.GRAVITY_API.replace(/\/$/, '');
    var meta = document.querySelector('meta[name="gravity-api"]');
    if (meta && meta.content) return meta.content.replace(/\/$/, '');
    if (location.protocol === 'file:') return 'http://localhost:3001';
    if (location.port === '3001') return '';
    return '';
  }

  function durationErrorMsg() {
    return (engine.copy && engine.copy['error.duration_exceeded']) ||
      'Video too long (max 3 min)';
  }

  function detectPlatformFromUrl(url) {
    var lower = (url || '').toLowerCase();
    if (/youtube\.com|youtu\.be/.test(lower)) return 'youtube';
    if (/instagram\.com/.test(lower)) return 'instagram';
    if (/facebook\.com|fb\.watch/.test(lower)) return 'facebook';
    return engine.platformKey !== 'generic' ? engine.platformKey : 'generic';
  }

  function ingestPage(url) {
    if (isNativeApp() && window.GravityNative.fetchPage) {
      var body = window.GravityNative.fetchPage(url, FETCH_OPTS);
      if (!body || body.indexOf('ERROR:') === 0) {
        throw new Error(body ? body.slice(6) : 'Page fetch failed');
      }
      return body;
    }
    return fetchPageWeb(url);
  }

  function fetchPageWeb(url) {
    var apiBase = getApiBase();
    var endpoint = apiBase + '/api/fetch-page?url=' + encodeURIComponent(url);
    return fetch(endpoint).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          throw new Error(err.error || ('Page fetch HTTP ' + res.status));
        });
      }
      return res.text();
    });
  }

  function extractBalancedJson(text, startIdx) {
    var i = startIdx;
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (; i < text.length; i++) {
      var ch = text.charAt(i);
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
    return str
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"');
  }

  function ensureHttps(raw) {
    if (!raw) return '';
    var u = decodeEscapes(raw.trim());
    if (u.indexOf('//') === 0) u = 'https:' + u;
    if (u.indexOf('http://') === 0) u = 'https://' + u.slice(7);
    return u;
  }

  function uniqUrls(list) {
    var seen = {};
    var out = [];
    list.forEach(function (u) {
      var n = ensureHttps(u);
      if (n && !seen[n]) { seen[n] = true; out.push(n); }
    });
    return out;
  }

  function metaContent(html, prop) {
    var re = new RegExp('<meta[^>]+property="' + prop + '"[^>]+content="([^"]+)"', 'i');
    var m = html.match(re);
    if (m) return decodeEscapes(m[1]);
    re = new RegExp('<meta[^>]+content="([^"]+)"[^>]+property="' + prop + '"', 'i');
    m = html.match(re);
    return m ? decodeEscapes(m[1]) : '';
  }

  function titleFromHtml(html) {
    var og = metaContent(html, 'og:title');
    if (og) return og;
    var m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim() : 'Video';
  }

  function parseInstagram(html, url) {
    var title = titleFromHtml(html);
    var urls = [];
    var re;

    re = /"video_url"\s*:\s*"([^"]+)"/g;
    var m;
    while ((m = re.exec(html)) !== null) urls.push(m[1]);

    re = /"playback_url"\s*:\s*"([^"]+)"/g;
    while ((m = re.exec(html)) !== null) urls.push(m[1]);

    re = /"video_versions"\s*:\s*(\[[\s\S]*?\])/g;
    while ((m = re.exec(html)) !== null) {
      try {
        var versions = JSON.parse(m[1]);
        versions.forEach(function (v) {
          if (v && v.url) urls.push(v.url);
        });
      } catch (_e) { /* skip */ }
    }

    var ogVideo = metaContent(html, 'og:video') || metaContent(html, 'og:video:url');
    if (ogVideo) urls.push(ogVideo);

    urls = uniqUrls(urls).filter(function (u) { return /\.mp4/i.test(u); });
    if (!urls.length) throw new Error('No Instagram stream found');

    var qualities = urls.map(function (u, i) {
      return {
        label: i === 0 ? 'Best quality' : ('Quality ' + (i + 1)),
        downloadUrl: u
      };
    });

    return {
      title: title,
      platform: 'instagram',
      durationSeconds: null,
      qualities: qualities
    };
  }

  function formatHasDirectUrl(f) {
    return f && f.url && !f.signatureCipher && !f.cipher;
  }

  function parseYouTube(html) {
    var marker = 'ytInitialPlayerResponse';
    var idx = html.indexOf(marker);
    if (idx === -1) throw new Error('YouTube player data not found');

    var brace = html.indexOf('{', idx);
    var jsonText = extractBalancedJson(html, brace);
    if (!jsonText) throw new Error('YouTube JSON parse failed');

    var data = JSON.parse(jsonText);
    var details = data.videoDetails || {};
    var streaming = data.streamingData || {};
    var title = details.title || titleFromHtml(html);
    var durationSeconds = parseInt(details.lengthSeconds, 10);

    if (details.isLive || details.isLiveContent) {
      throw new Error('Live streams not supported');
    }

    var qualities = [];
    var progressive = streaming.formats || [];
    progressive.forEach(function (f) {
      if (!formatHasDirectUrl(f)) return;
      var h = f.height || 0;
      var label = h ? (h + 'p') : 'Progressive';
      qualities.push({ label: label, downloadUrl: ensureHttps(f.url), _h: h });
    });

    var adaptive = streaming.adaptiveFormats || [];
    var videos = [];
    var audios = [];

    adaptive.forEach(function (f) {
      if (!formatHasDirectUrl(f)) return;
      var mime = (f.mimeType || '').toLowerCase();
      if (mime.indexOf('video/') === 0) {
        videos.push(f);
      } else if (mime.indexOf('audio/') === 0) {
        audios.push(f);
      }
    });

    videos.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
    audios.sort(function (a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });

    if (videos.length && audios.length) {
      videos.slice(0, 3).forEach(function (v) {
        var itag = v.itag;
        var label = YT_VIDEO_LABELS[itag] || ((v.height || 'HD') + 'p');
        qualities.push({
          label: label,
          isMuxRequired: true,
          videoUrl: ensureHttps(v.url),
          audioUrl: ensureHttps(audios[0].url),
          _h: v.height || 0
        });
      });
    }

    qualities.sort(function (a, b) { return (b._h || 0) - (a._h || 0); });
    qualities = qualities.map(function (q) {
      var copy = {
        label: q.label,
        downloadUrl: q.downloadUrl,
        isMuxRequired: q.isMuxRequired,
        videoUrl: q.videoUrl,
        audioUrl: q.audioUrl
      };
      if (copy.isMuxRequired) delete copy.downloadUrl;
      if (!copy.isMuxRequired) {
        delete copy.isMuxRequired;
        delete copy.videoUrl;
        delete copy.audioUrl;
      }
      return copy;
    });

    if (!qualities.length) throw new Error('No YouTube streams found (encrypted URLs skipped)');

    return {
      title: title,
      platform: 'youtube',
      durationSeconds: isNaN(durationSeconds) ? null : durationSeconds,
      qualities: dedupeQualities(qualities)
    };
  }

  function parseFacebook(html) {
    var title = titleFromHtml(html);
    var urls = [];
    var re;
    var m;

    re = /"browser_native_hd_url"\s*:\s*"([^"]+)"/g;
    while ((m = re.exec(html)) !== null) urls.push(m[1]);

    re = /"browser_native_sd_url"\s*:\s*"([^"]+)"/g;
    while ((m = re.exec(html)) !== null) urls.push(m[1]);

    re = /"playable_url"\s*:\s*"([^"]+)"/g;
    while ((m = re.exec(html)) !== null) urls.push(m[1]);

    re = /"playable_url_quality_hd"\s*:\s*"([^"]+)"/g;
    while ((m = re.exec(html)) !== null) urls.push(m[1]);

    var ogVideo = metaContent(html, 'og:video');
    if (ogVideo) urls.push(ogVideo);

    urls = uniqUrls(urls).filter(function (u) { return /^https:\/\//i.test(u); });
    if (!urls.length) throw new Error('No Facebook stream found');

    var qualities = [];
    if (urls[0]) qualities.push({ label: 'HD', downloadUrl: urls[0] });
    if (urls[1]) qualities.push({ label: 'SD', downloadUrl: urls[1] });

    return {
      title: title,
      platform: 'facebook',
      durationSeconds: null,
      qualities: dedupeQualities(qualities)
    };
  }

  function dedupeQualities(list) {
    var seen = {};
    var out = [];
    list.forEach(function (q) {
      var key = q.downloadUrl || (q.videoUrl + '|' + q.audioUrl);
      if (seen[key]) return;
      seen[key] = true;
      out.push(q);
    });
    return out;
  }

  function parsePage(html, platform) {
    if (platform === 'youtube') return parseYouTube(html);
    if (platform === 'instagram') return parseInstagram(html, '');
    if (platform === 'facebook') return parseFacebook(html);
    throw new Error('Unsupported platform');
  }

  function enforceDurationGate(data) {
    var d = data.durationSeconds;
    if (d === null || d === undefined || isNaN(d)) return;
    if (d > MAX_DURATION_SEC) throw new Error(durationErrorMsg());
  }

  async function extractFromUrl(url) {
    readEngineFromWindow();
    var platform = detectPlatformFromUrl(url);
    var html = ingestPage(url);
    if (html && typeof html.then === 'function') html = await html;
    var data = parsePage(html, platform);
    enforceDurationGate(data);
    data._source = isNativeApp() ? 'native-parse' : 'web-parse';
    return data;
  }

  async function fetchProxied(sourceUrl) {
    if (isNativeApp()) {
      var b64 = window.GravityNative.proxyFetchBase64(sourceUrl);
      if (!b64 || b64.indexOf('ERROR:') === 0) {
        throw new Error(b64 ? b64.slice(6) : 'Download failed');
      }
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return {
        ok: true,
        arrayBuffer: function () { return bytes.buffer; },
        blob: function () { return new Blob([bytes]); }
      };
    }
    var res = await fetch(getApiBase() + '/api/proxy?url=' + encodeURIComponent(sourceUrl));
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error(err.error || ('Download failed (HTTP ' + res.status + ')'));
    }
    return res;
  }

  composer.addEventListener('submit', function (e) {
    e.preventDefault();
    var url = input.value.trim();
    if (!url || busy) return;
    fetchVideo(url);
  });

  function fetchVideo(url) {
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    if (welcome) welcome.remove();

    addUserMessage(url);
    var statusMsg = addStatusMessage(STATUS.thinking);

    fetchMetadata(url, statusMsg).finally(function () {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    });
  }

  function addUserMessage(text) {
    var msg = document.createElement('div');
    msg.className = 'msg msg-user';
    msg.innerHTML = '<motion.div class="bubble bubble-user">' + escapeHtml(text) + '</motion.div>';
    chatInner.appendChild(msg);
    scrollDown();
  }

  function addStatusMessage(label) {
    var msg = document.createElement('div');
    msg.className = 'msg msg-ai';
    msg.innerHTML =
      '<motion.div class="bubble bubble-ai">' +
        '<motion.div class="status">' +
          '<motion.div class="status-dots"><span></span><span></span><span></span></motion.div>' +
          '<span class="status-text">' + escapeHtml(label) + '…</span>' +
        '</motion.div>' +
      '</motion.div>';
    chatInner.appendChild(msg);
    scrollDown();
    return msg;
  }

  function setStatus(msgEl, label, type) {
    var status = msgEl.querySelector('.status');
    if (!status) return;
    status.className = 'status' + (type ? ' ' + type : '');
    var text = status.querySelector('.status-text');
    if (text) text.textContent = label + (type === 'error' ? '' : '…');
    var dots = status.querySelector('.status-dots');
    if (dots) dots.style.display = type === 'error' ? 'none' : 'flex';
    scrollDown();
  }

  function showError(msgEl, message) {
    msgEl.innerHTML =
      '<motion.div class="bubble bubble-ai">' +
        '<motion.div class="status error">' + escapeHtml(message) + '</motion.div>' +
      '</motion.div>';
    scrollDown();
  }

  function showResult(msgEl, data) {
    var qualities = data.qualities || [];
    var options = qualities.map(function (q, i) {
      return '<option value="' + i + '">' + escapeHtml(q.label) + '</option>';
    }).join('');

    msgEl.innerHTML =
      '<motion.div class="result-card">' +
        '<p class="result-platform">' + escapeHtml(data.platform || '') + '</p>' +
        '<p class="result-title">' + escapeHtml(data.title || 'Video') + '</p>' +
        '<motion.div class="result-actions">' +
          '<select class="quality-select" id="quality-' + data._id + '">' + options + '</select>' +
          '<button class="download-btn" id="dl-' + data._id + '">Download</button>' +
        '</motion.div>' +
        '<p class="result-progress" id="prog-' + data._id + '" hidden></p>' +
      '</motion.div>';

    var dlBtn = document.getElementById('dl-' + data._id);
    var select = document.getElementById('quality-' + data._id);
    var prog = document.getElementById('prog-' + data._id);

    dlBtn.addEventListener('click', function () {
      var q = qualities[parseInt(select.value, 10)];
      if (!q || dlBtn.disabled) return;
      setDownloadBusy(dlBtn, select, prog, true);
      runDownload(q, data.title, prog, dlBtn, select);
    });

    scrollDown();
  }

  async function fetchMetadata(url, statusMsg) {
    try {
      setStatus(statusMsg, STATUS.fetching);
      var data = await extractFromUrl(url);
      data._id = Date.now();
      showResult(statusMsg, data);
    } catch (err) {
      var msg = err && err.message ? err.message : 'Something went wrong';
      if (msg === 'Failed to fetch') msg = 'Server unavailable';
      showError(statusMsg, msg);
    }
  }

  function downloadFilename(title, quality) {
    var label = (quality && quality.label) ? '_' + quality.label.replace(/\s+/g, '') : '';
    return sanitizeFilename(title) + label + '.mp4';
  }

  function setDownloadBusy(dlBtn, selectEl, progEl, isBusy, label) {
    dlBtn.disabled = isBusy;
    selectEl.disabled = isBusy;
    if (isBusy) {
      dlBtn.textContent = label || 'Downloading…';
    } else {
      dlBtn.textContent = 'Download';
    }
    progEl.hidden = true;
    progEl.textContent = '';
  }

  function showDownloadError(progEl, dlBtn, selectEl, message) {
    progEl.hidden = false;
    progEl.textContent = message;
    setDownloadBusy(dlBtn, selectEl, progEl, false);
  }

  function showDownloadSaved(progEl, dlBtn, selectEl, quality) {
    setDownloadBusy(dlBtn, selectEl, progEl, false);
    progEl.hidden = false;
    progEl.textContent = quality && quality.label ? quality.label + ' saved' : 'Saved';
  }

  async function runDownload(quality, title, progEl, dlBtn, selectEl) {
    try {
      setDownloadBusy(dlBtn, selectEl, progEl, true, 'Downloading…');

      if (quality.isMuxRequired && quality.videoUrl && quality.audioUrl) {
        var videoRes = await fetchProxied(quality.videoUrl);
        var audioRes = await fetchProxied(quality.audioUrl);

        setDownloadBusy(dlBtn, selectEl, progEl, true, 'Processing…');
        var blob = await muxStreams(
          await videoRes.arrayBuffer(),
          await audioRes.arrayBuffer(),
          function (pct) {
            dlBtn.textContent = 'Processing ' + pct + '%';
          }
        );
        saveFile(blob, downloadFilename(title, quality));
      } else if (quality.downloadUrl) {
        var mediaRes = await fetchProxied(quality.downloadUrl);
        saveFile(await mediaRes.blob(), downloadFilename(title, quality));
      } else {
        throw new Error('No stream for this quality');
      }

      showDownloadSaved(progEl, dlBtn, selectEl, quality);
    } catch (err) {
      var msg = (err && err.message) || 'Download failed';
      if (msg === 'Failed to fetch') msg = 'Network error';
      showDownloadError(progEl, dlBtn, selectEl, msg);
    }
  }

  function sanitizeFilename(name) {
    return (name || 'gravity_video').replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
  }

  function saveFile(blob, filename) {
    if (isNativeApp() && window.GravityNative.saveVideoBase64) {
      blob.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        var chunk = 8192;
        var binary = '';
        for (var i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        var result = window.GravityNative.saveVideoBase64(btoa(binary), filename);
        if (result && result.indexOf('ERROR:') === 0) {
          console.error(result);
        }
      });
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  async function muxStreams(videoBuf, audioBuf, onProgress) {
    var FFmpegMod = await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.10');
    var UtilMod = await import('https://esm.sh/@ffmpeg/util@0.12.1');
    var ffmpeg = new FFmpegMod.FFmpeg();
    var base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    ffmpeg.on('progress', function (_ref) {
      var pct = Math.round(_ref.progress * 100);
      if (onProgress) onProgress(pct);
    });

    await ffmpeg.load({
      coreURL: await UtilMod.toBlobURL(base + '/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await UtilMod.toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm'),
    });

    await ffmpeg.writeFile('video.mp4', new Uint8Array(videoBuf));
    await ffmpeg.writeFile('audio.mp3', new Uint8Array(audioBuf));

    await ffmpeg.exec([
      '-i', 'video.mp4',
      '-i', 'audio.mp3',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      '-movflags', '+faststart',
      'output.mp4',
    ]);

    var out = await ffmpeg.readFile('output.mp4');
    var bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
    await ffmpeg.terminate();
    return new Blob([bytes], { type: 'video/mp4' });
  }

  function scrollDown() {
    var chat = document.getElementById('chat');
    chat.scrollTop = chat.scrollHeight;
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.GravityReceiveShare = function (url) {
    if (!url || busy) return;
    input.value = url;
    fetchVideo(url);
    if (window.GravityNative && window.GravityNative.clearPendingShare) {
      window.GravityNative.clearPendingShare();
    }
  };

  function initApp() {
    readEngineFromWindow();
    if (isNativeApp() && window.GravityNative.getPendingShare) {
      var pending = window.GravityNative.getPendingShare();
      if (pending) window.GravityReceiveShare(pending);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
