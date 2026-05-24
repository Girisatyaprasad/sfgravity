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

  /* Resolve API URL — config.js → meta tag → smart fallback */
  function isNativeApp() {
    return !!(window.GravityNative && window.GravityNative.isApp && window.GravityNative.isApp());
  }

  function getApiBase() {
    if (isNativeApp()) return '';
    if (window.GRAVITY_API) return window.GRAVITY_API.replace(/\/$/, '');
    var meta = document.querySelector('meta[name="gravity-api"]');
    if (meta && meta.content) return meta.content.replace(/\/$/, '');
    if (location.protocol === 'file:') return 'http://localhost:3000';
    if (location.port === '3001') return '';
    return '';
  }

  function nativeExtract(url) {
    var json = window.GravityNative.extract(url);
    var data = JSON.parse(json);
    if (data.error) throw new Error(data.error);
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
    var res = await fetch(proxyUrl(sourceUrl));
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error(err.error || ('Download failed (HTTP ' + res.status + ')'));
    }
    return res;
  }

  function proxyUrl(sourceUrl) {
    return getApiBase() + '/api/proxy?url=' + encodeURIComponent(sourceUrl);
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
    msg.innerHTML = '<div class="bubble bubble-user">' + escapeHtml(text) + '</div>';
    chatInner.appendChild(msg);
    scrollDown();
  }

  function addStatusMessage(label) {
    var msg = document.createElement('div');
    msg.className = 'msg msg-ai';
    msg.innerHTML =
      '<div class="bubble bubble-ai">' +
        '<div class="status">' +
          '<div class="status-dots"><span></span><span></span><span></span></div>' +
          '<span class="status-text">' + escapeHtml(label) + '…</span>' +
        '</div>' +
      '</div>';
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
      '<div class="bubble bubble-ai">' +
        '<div class="status error">' + escapeHtml(message) + '</div>' +
      '</div>';
    scrollDown();
  }

  function showResult(msgEl, data) {
    var qualities = data.qualities || [];
    var options = qualities.map(function (q, i) {
      return '<option value="' + i + '">' + escapeHtml(q.label) + '</option>';
    }).join('');

    msgEl.innerHTML =
      '<div class="result-card">' +
        '<p class="result-platform">' + escapeHtml(data.platform || '') + '</p>' +
        '<p class="result-title">' + escapeHtml(data.title || 'Video') + '</p>' +
        '<div class="result-actions">' +
          '<select class="quality-select" id="quality-' + data._id + '">' + options + '</select>' +
          '<button class="download-btn" id="dl-' + data._id + '">Download</button>' +
        '</div>' +
        '<p class="result-progress" id="prog-' + data._id + '" hidden></p>' +
      '</div>';

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

      var apiBase = getApiBase();
      var data;

      if (isNativeApp()) {
        data = nativeExtract(url);
      } else {
        var res = await fetch(apiBase + '/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url })
        });

        if (!res.ok) {
          var errBody = await res.json().catch(function () { return {}; });
          throw new Error(errBody.error || 'Could not resolve that link');
        }
        data = await res.json();
      }

      data._id = Date.now();
      showResult(statusMsg, data);
    } catch (err) {
      var msg = err && err.message ? err.message : 'Something went wrong';
      if (msg === 'Failed to fetch') {
        msg = 'Server unavailable';
      }
      showError(statusMsg, msg);
    }
  }

  function downloadFilename(title, quality) {
    var label = (quality && quality.label) ? '_' + quality.label.replace(/\s+/g, '') : '';
    return sanitizeFilename(title) + label + '.mp4';
  }

  function setDownloadBusy(dlBtn, selectEl, progEl, busy, label) {
    dlBtn.disabled = busy;
    selectEl.disabled = busy;
    if (busy) {
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

  /* Android share sheet + deep links */
  window.GravityReceiveShare = function (url) {
    if (!url || busy) return;
    input.value = url;
    fetchVideo(url);
    if (window.GravityNative && window.GravityNative.clearPendingShare) {
      window.GravityNative.clearPendingShare();
    }
  };

  function initApp() {
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
