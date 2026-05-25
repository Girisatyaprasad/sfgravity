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
  var PROXY_TIMEOUT_MS = 15000;

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
    if (window.GRAVITY_API) return String(window.GRAVITY_API).replace(/\/$/, '');
    var meta = document.querySelector('meta[name="gravity-api"]');
    if (meta && meta.content) return String(meta.content).replace(/\/$/, '');
    return '';
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var opts = options || {};
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(timeoutMs);
      return fetch(url, opts);
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
    opts.signal = ctrl.signal;
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  function durationErrorMsg() {
    return (engine.copy && engine.copy['error.duration_exceeded']) ||
      'Video too long (max 3 min)';
  }

  function streamProtectedErrorMsg() {
    readEngineFromWindow();
    return (engine.copy && engine.copy['error.stream_protected']) ||
      'Stream restricted by platform security. Please attempt download using lower resolution parameters.';
  }

  function inspectStreamFailure(err, httpStatus) {
    var status = httpStatus || (err && err.httpStatus) || 0;
    var code = err && err.code;
    var msg = (err && err.message) || String(err || '');
    if (code === 'STREAM_PROTECTED' || status === 403) return true;
    if (msg === 'Failed to fetch' || /failed to fetch/i.test(msg)) return true;
    if (/networkerror/i.test(msg)) return true;
    if (/cors/i.test(msg) || /preflight/i.test(msg)) return true;
    if (/upstream http 403/i.test(msg)) return true;
    if (/blocked the download/i.test(msg)) return true;
    if (/stream restricted|stream protected|network policy/i.test(msg)) return true;
    return false;
  }

  function markStreamProtectedError(err, httpStatus) {
    var e = err instanceof Error ? err : new Error(String(err || 'Stream protected'));
    e.httpStatus = httpStatus || e.httpStatus || 0;
    if (inspectStreamFailure(e, e.httpStatus)) e.code = 'STREAM_PROTECTED';
    return e;
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
    var endpoint = getApiBase() + '/api/fetch-page?url=' + encodeURIComponent(url);
    return fetchWithTimeout(endpoint, { credentials: 'same-origin' }, PROXY_TIMEOUT_MS).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          var msg = err.error || ('Page fetch HTTP ' + res.status);
          if (res.status === 504) msg = 'Page fetch timed out';
          throw new Error(msg);
        });
      }
      var ytCookies = res.headers.get('X-Gravity-Yt-Cookies');
      if (ytCookies) window.__GRAVITY_YT_COOKIES__ = ytCookies;
      window.__GRAVITY_PAGE_URL__ = url;
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
    data.pageUrl = url;
    return data;
  }

  function humanizeDownloadError(msg, status) {
    if (!msg) msg = 'Download failed';
    if (inspectStreamFailure({ message: msg }, status)) return streamProtectedErrorMsg();
    if (/upstream http 404/i.test(msg) || status === 404) {
      return 'Stream link expired — fetch the video again';
    }
    if (status === 504 || /timed out/i.test(msg)) return 'Download timed out';
    return msg;
  }

  async function fetchProxied(sourceUrl, pageUrl) {
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
    var endpoint = getApiBase() + '/api/proxy?url=' + encodeURIComponent(sourceUrl);
    var referer = pageUrl || window.__GRAVITY_PAGE_URL__ || '';
    var cookies = window.__GRAVITY_YT_COOKIES__ || '';
    if (referer) endpoint += '&referer=' + encodeURIComponent(referer);
    if (cookies) endpoint += '&cookies=' + encodeURIComponent(cookies);
    var res;
    try {
      res = await fetchWithTimeout(endpoint, { credentials: 'same-origin' }, PROXY_TIMEOUT_MS);
    } catch (netErr) {
      throw markStreamProtectedError(netErr, 0);
    }
    if (!res.ok) {
      var errBody = await res.json().catch(function () { return {}; });
      var fail = new Error(humanizeDownloadError(errBody.error, res.status));
      throw markStreamProtectedError(fail, res.status);
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
      var card = dlBtn.closest('.result-card');
      setDownloadBusy(dlBtn, select, prog, true);
      runDownload(q, data.title, prog, dlBtn, select, data.pageUrl, card).catch(function (err) {
        if (inspectStreamFailure(err, err && err.httpStatus)) {
          showDownloadStreamWarning(prog, dlBtn, select, card);
          return;
        }
        showDownloadError(prog, dlBtn, select, (err && err.message) || 'Download failed');
      });
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

  function resetDownloadControls(dlBtn, selectEl, progEl, cardEl) {
    dlBtn.disabled = false;
    selectEl.disabled = false;
    dlBtn.textContent = 'Download';
    dlBtn.classList.remove('download-btn--warn-state');
    if (cardEl) cardEl.classList.remove('result-card--stream-protected');
    if (progEl) {
      progEl.classList.remove('stream-warning-panel');
      progEl.removeAttribute('data-validation');
    }
  }

  function setDownloadBusy(dlBtn, selectEl, progEl, isBusy, label) {
    dlBtn.disabled = isBusy;
    selectEl.disabled = isBusy;
    if (isBusy) {
      var status = label || 'Downloading…';
      dlBtn.textContent = status;
      progEl.hidden = false;
      progEl.classList.remove('stream-warning-panel');
      progEl.setAttribute('data-status', 'progress');
      progEl.textContent = status;
    } else {
      dlBtn.textContent = 'Download';
    }
  }

  function showDownloadStreamWarning(progEl, dlBtn, selectEl, cardEl) {
    resetDownloadControls(dlBtn, selectEl, progEl, cardEl);
    if (cardEl) cardEl.classList.add('result-card--stream-protected');
    progEl.hidden = false;
    progEl.className = 'result-progress stream-warning-panel';
    progEl.setAttribute('data-status', 'warning');
    progEl.setAttribute('data-validation', 'stream_protected');
    progEl.setAttribute('role', 'status');
    progEl.textContent = streamProtectedErrorMsg();
    dlBtn.classList.add('download-btn--warn-state');
    if (input) input.focus();
    scrollDown();
  }

  function showDownloadError(progEl, dlBtn, selectEl, message) {
    resetDownloadControls(dlBtn, selectEl, progEl, dlBtn.closest('.result-card'));
    progEl.hidden = false;
    progEl.className = 'result-progress';
    progEl.setAttribute('data-status', 'error');
    progEl.setAttribute('data-validation', 'download_error');
    progEl.textContent = message;
  }

  function showDownloadSaved(progEl, dlBtn, selectEl, quality) {
    setDownloadBusy(dlBtn, selectEl, progEl, false);
    progEl.hidden = false;
    progEl.setAttribute('data-status', 'ok');
    progEl.textContent = quality && quality.label ? quality.label + ' saved' : 'Saved';
  }

  async function refreshQualityForDownload(quality, pageUrl) {
    if (!pageUrl || detectPlatformFromUrl(pageUrl) !== 'youtube') return quality;
    var html = ingestPage(pageUrl);
    if (html && typeof html.then === 'function') html = await html;
    var fresh = parsePage(html, 'youtube');
    var list = fresh.qualities || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].label === quality.label) return list[i];
    }
    return list[0] || quality;
  }

  async function runDownload(quality, title, progEl, dlBtn, selectEl, pageUrl, cardEl) {
    try {
      setDownloadBusy(dlBtn, selectEl, progEl, true, 'Downloading…');

      if (pageUrl && detectPlatformFromUrl(pageUrl) === 'youtube') {
        setDownloadBusy(dlBtn, selectEl, progEl, true, 'Refreshing stream…');
        quality = await refreshQualityForDownload(quality, pageUrl);
      }

      if (quality.isMuxRequired && quality.videoUrl && quality.audioUrl) {
        setDownloadBusy(dlBtn, selectEl, progEl, true, 'Downloading video…');
        var videoRes = await fetchProxied(quality.videoUrl, pageUrl);
        setDownloadBusy(dlBtn, selectEl, progEl, true, 'Downloading audio…');
        var audioRes = await fetchProxied(quality.audioUrl, pageUrl);

        setDownloadBusy(dlBtn, selectEl, progEl, true, 'Processing video…');
        var muxMod = await import('/js/mux-module.js');
        var blob = await muxMod.muxStreams(
          await videoRes.arrayBuffer(),
          await audioRes.arrayBuffer(),
          function (pct) {
            var label = 'Processing ' + pct + '%';
            dlBtn.textContent = label;
            progEl.textContent = label;
          }
        );
        setDownloadBusy(dlBtn, selectEl, progEl, true, 'Saving file…');
        await saveFile(blob, downloadFilename(title, quality));
      } else if (quality.downloadUrl) {
        var mediaRes = await fetchProxied(quality.downloadUrl, pageUrl);
        setDownloadBusy(dlBtn, selectEl, progEl, true, 'Saving file…');
        await saveFile(await mediaRes.blob(), downloadFilename(title, quality));
      } else {
        throw new Error('No stream for this quality');
      }

      showDownloadSaved(progEl, dlBtn, selectEl, quality);
      if (cardEl) cardEl.classList.remove('result-card--stream-protected');
    } catch (err) {
      var status = err && err.httpStatus;
      if (inspectStreamFailure(err, status)) {
        showDownloadStreamWarning(progEl, dlBtn, selectEl, cardEl);
        return;
      }
      var msg = humanizeDownloadError(err && err.message, status);
      if (/abort/i.test(msg)) msg = 'Download timed out';
      showDownloadError(progEl, dlBtn, selectEl, msg);
    }
  }

  function sanitizeFilename(name) {
    return (name || 'gravity_video').replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
  }

  async function saveFile(blob, filename) {
    if (isNativeApp() && window.GravityNative.saveVideoBase64) {
      var buf = await blob.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var chunk = 8192;
      var binary = '';
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      var result = window.GravityNative.saveVideoBase64(btoa(binary), filename);
      if (result && result.indexOf('ERROR:') === 0) {
        throw new Error(result.slice(6));
      }
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
