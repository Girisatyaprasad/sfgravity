import { FFmpeg } from '/vendor/ffmpeg/ffmpeg/index.js';
import { toBlobURL } from '/vendor/ffmpeg/util/index.js';

const CORE_BASE = '/vendor/ffmpeg/core';
const MUX_TIMEOUT_MS = 120000;

export async function muxStreams(videoBuf, audioBuf, onProgress) {
  var ffmpeg = new FFmpeg();

  ffmpeg.on('progress', function (ref) {
    var pct = Math.round((ref.progress || 0) * 100);
    if (onProgress) onProgress(pct);
  });

  var timer = setTimeout(function () {}, MUX_TIMEOUT_MS);
  try {
    var work = (async function () {
      await ffmpeg.load({
        coreURL: await toBlobURL(CORE_BASE + '/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(CORE_BASE + '/ffmpeg-core.wasm', 'application/wasm'),
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
      return new Blob([bytes], { type: 'video/mp4' });
    })();

    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        reject(new Error('Video processing timed out'));
      }, MUX_TIMEOUT_MS);
    });

    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    try {
      await ffmpeg.terminate();
    } catch (_e) { /* ignore */ }
  }
}
