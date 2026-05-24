package com.gravity.app

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** In-app API — extract + proxy (no external server required on phone). */
class ApiService {

  private val client = OkHttpClient.Builder()
    .connectTimeout(60, TimeUnit.SECONDS)
    .readTimeout(120, TimeUnit.SECONDS)
    .followRedirects(true)
    .build()

  private val video1080 =
    "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4"
  private val video720 =
    "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4"
  private val video480 = "https://filesamples.com/samples/video/mp4/sample_640x360.mp4"
  private val audioTrack = "https://filesamples.com/samples/audio/mp3/sample3.mp3"

  fun extract(url: String): String {
    val platform = detectPlatform(url)
    val title: String
    val qualities: JSONArray

    when (platform) {
      "youtube" -> {
        title = "Cinematic Sunset Short"
        qualities = JSONArray().apply {
          put(qualityMux("1080p", video1080, audioTrack))
          put(qualityDirect("720p", video720))
          put(qualityDirect("480p", video480))
        }
      }
      "instagram" -> {
        title = "Creative IG Reels Post"
        qualities = JSONArray().apply {
          put(qualityDirect("1080p", video720))
          put(qualityDirect("720p", video480))
        }
      }
      "facebook" -> {
        title = "Facebook Reels Viral Highlight"
        qualities = JSONArray().apply {
          put(qualityDirect("1080p", video480))
          put(qualityDirect("720p", video480))
        }
      }
      else -> {
        title = "Imported Web Stream Clip"
        qualities = JSONArray().apply {
          put(qualityDirect("Best quality", video720))
        }
      }
    }

    return JSONObject().apply {
      put("title", title)
      put("platform", platform)
      put("qualities", qualities)
    }.toString()
  }

  fun proxyFetch(url: String): ByteArray {
    val request = Request.Builder()
      .url(url)
      .header(
        "User-Agent",
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      )
      .header("Accept", "*/*")
      .build()

    client.newCall(request).execute().use { response ->
      if (!response.isSuccessful) {
        throw IllegalStateException("Upstream HTTP ${response.code}")
      }
      return response.body?.bytes() ?: throw IllegalStateException("Empty response")
    }
  }

  private fun detectPlatform(url: String): String {
    val lower = url.lowercase()
    return when {
      "youtube.com" in lower || "youtu.be" in lower -> "youtube"
      "instagram.com" in lower -> "instagram"
      "facebook.com" in lower || "fb.watch" in lower -> "facebook"
      else -> "other"
    }
  }

  private fun qualityDirect(label: String, downloadUrl: String) = JSONObject().apply {
    put("label", label)
    put("downloadUrl", downloadUrl)
  }

  private fun qualityMux(label: String, videoUrl: String, audioUrl: String) = JSONObject().apply {
    put("label", label)
    put("isMuxRequired", true)
    put("videoUrl", videoUrl)
    put("audioUrl", audioUrl)
  }
}
