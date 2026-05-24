package com.gravity.app

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** In-app page fetch + media proxy for SaveFromGravity WebView. */
class ApiService {

  private val client = OkHttpClient.Builder()
    .connectTimeout(60, TimeUnit.SECONDS)
    .readTimeout(120, TimeUnit.SECONDS)
    .followRedirects(true)
    .cookieJar(object : CookieJar {
      override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {}
      override fun loadForRequest(url: HttpUrl): List<Cookie> = emptyList()
    })
    .build()

  private val desktopUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

  private val maxPageBytes = 5 * 1024 * 1024

  fun fetchPage(url: String, optionsJson: String?): String {
    var ua = desktopUa
    var maxBytes = maxPageBytes
    if (!optionsJson.isNullOrBlank()) {
      try {
        val opts = JSONObject(optionsJson)
        if (opts.has("userAgent")) ua = opts.getString("userAgent")
        if (opts.has("maxBytes")) maxBytes = opts.getInt("maxBytes").coerceIn(1024, maxPageBytes)
      } catch (_: Exception) {
      }
    }

    val request = Request.Builder()
      .url(url)
      .header("User-Agent", ua)
      .header("Accept", "text/html,application/json,*/*")
      .header("Accept-Language", "en-US,en;q=0.9")
      .build()

    client.newCall(request).execute().use { response ->
      if (!response.isSuccessful) {
        throw IllegalStateException("Upstream HTTP ${response.code}")
      }
      val bytes = response.body?.bytes() ?: throw IllegalStateException("Empty response")
      if (bytes.size > maxBytes) {
        throw IllegalStateException("Page exceeds ${maxBytes / (1024 * 1024)}MB cap")
      }
      return String(bytes, Charsets.UTF_8)
    }
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
}
