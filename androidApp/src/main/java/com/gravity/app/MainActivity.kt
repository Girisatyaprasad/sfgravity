package com.gravity.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {

  private lateinit var webView: WebView
  private lateinit var bridge: GravityBridge
  private val api = ApiService()

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.statusBarColor = Color.BLACK
    window.navigationBarColor = Color.BLACK

    webView = WebView(this).apply {
      setBackgroundColor(Color.BLACK)
    }
    setContentView(webView)

    bridge = GravityBridge(this, webView, api)

    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      allowFileAccess = true
      allowContentAccess = true
      mediaPlaybackRequiresUserGesture = false
      mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
      cacheMode = WebSettings.LOAD_DEFAULT
      userAgentString = userAgentString + " SaveFromGravityAndroid/2.0"
    }

    webView.addJavascriptInterface(bridge, "GravityNative")

    webView.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url.toString()
        if (url.startsWith("http://") || url.startsWith("https://")) {
          val videoUrl = bridge.extractUrlFromText(url)
          if (videoUrl != null) {
            bridge.deliverShareToWeb(videoUrl)
            return true
          }
        }
        return false
      }

      override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        bridge.pendingShareUrl?.let { shared ->
          bridge.deliverShareToWeb(shared)
        }
      }
    }

    webView.webChromeClient = WebChromeClient()

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (webView.canGoBack()) webView.goBack()
          else finish()
        }
      }
    )

    handleIntent(intent)
    webView.loadUrl("file:///android_asset/www/index.html")
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent?) {
    if (intent == null) return

    when (intent.action) {
      Intent.ACTION_SEND -> {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        bridge.extractUrlFromText(text)?.let { url ->
          bridge.pendingShareUrl = url
          if (::webView.isInitialized) {
            bridge.deliverShareToWeb(url)
          }
        }
      }
      Intent.ACTION_VIEW -> {
        bridge.extractUrlFromText(intent.dataString)?.let { url ->
          bridge.pendingShareUrl = url
          if (::webView.isInitialized) {
            bridge.deliverShareToWeb(url)
          }
        }
      }
    }
  }
}
