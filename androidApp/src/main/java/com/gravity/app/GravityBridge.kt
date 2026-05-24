package com.gravity.app

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.io.File
import java.util.regex.Pattern

class GravityBridge(
  private val context: Context,
  private val webView: WebView,
  private val api: ApiService,
) {
  @Volatile
  var pendingShareUrl: String? = null

  private val urlPattern = Pattern.compile(
    "(https?://[^\\s<>\"']+)",
    Pattern.CASE_INSENSITIVE
  )

  fun extractUrlFromText(text: String?): String? {
    if (text.isNullOrBlank()) return null
    val trimmed = text.trim()
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed.split(Regex("\\s")).firstOrNull()
    }
    val matcher = urlPattern.matcher(text)
    return if (matcher.find()) matcher.group(1) else null
  }

  @JavascriptInterface
  fun isApp(): Boolean = true

  @JavascriptInterface
  fun getPendingShare(): String = pendingShareUrl ?: ""

  @JavascriptInterface
  fun clearPendingShare() {
    pendingShareUrl = null
  }

  @JavascriptInterface
  fun extract(url: String): String {
    return try {
      api.extract(url)
    } catch (e: Exception) {
      JSONObjectError("Failed to extract", e.message)
    }
  }

  @JavascriptInterface
  fun proxyFetchBase64(url: String): String {
    return try {
      val bytes = api.proxyFetch(url)
      Base64.encodeToString(bytes, Base64.NO_WRAP)
    } catch (e: Exception) {
      "ERROR:${e.message ?: "fetch failed"}"
    }
  }

  @JavascriptInterface
  fun saveVideoBase64(base64: String, filename: String): String {
    return try {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      saveToDownloads(filename.ifBlank { "gravity_video.mp4" }, bytes, "video/mp4")
      "OK"
    } catch (e: Exception) {
      "ERROR:${e.message ?: "save failed"}"
    }
  }

  fun deliverShareToWeb(url: String) {
    pendingShareUrl = url
    val escaped = org.json.JSONObject.quote(url)
    webView.post {
      webView.evaluateJavascript(
        "if (window.GravityReceiveShare) window.GravityReceiveShare($escaped);",
        null
      )
    }
  }

  private fun saveToDownloads(filename: String, bytes: ByteArray, mime: String): String {
    val safeName = filename.replace(Regex("[^a-zA-Z0-9._-]"), "_")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
        put(MediaStore.Downloads.MIME_TYPE, mime)
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val resolver = context.contentResolver
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("Cannot create download")

      resolver.openOutputStream(uri)?.use { it.write(bytes) }
        ?: throw IllegalStateException("Cannot write file")

      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return uri.toString()
    }

    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    if (!dir.exists()) dir.mkdirs()
    val file = File(dir, safeName)
    file.writeBytes(bytes)
    return file.absolutePath
  }

  private fun JSONObjectError(error: String, details: String?): String {
    return org.json.JSONObject().apply {
      put("error", error)
      if (details != null) put("details", details)
    }.toString()
  }
}
