package com.hologram.downloader.scrapers.extractors

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.*
import com.hologram.downloader.scrapers.base.BaseExtractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

class HeadlessWebViewSniffer(private val context: Context) {

    @SuppressLint("SetJavaScriptEnabled")
    suspend fun sniffMediaUrl(targetUrl: String, timeoutMs: Long = 12000L): String? = withTimeoutOrNull(timeoutMs) {
        withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { continuation ->
                var webView: WebView? = null
                var isResumed = false

                val cleanup = {
                    try {
                        webView?.stopLoading()
                        webView?.destroy()
                        webView = null
                    } catch (_: Exception) {}
                }

                continuation.invokeOnCancellation {
                    cleanup()
                }

                try {
                    webView = WebView(context.applicationContext).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.userAgentString = BaseExtractor.DEFAULT_UA
                        settings.loadsImagesAutomatically = false
                        settings.blockNetworkImage = true

                        webViewClient = object : WebViewClient() {
                            override fun shouldInterceptRequest(
                                view: WebView?,
                                request: WebResourceRequest?
                            ): WebResourceResponse? {
                                val url = request?.url?.toString() ?: return null
                                if (BaseExtractor.isStreamableVideoUrl(url) && !url.contains("google.com")) {
                                    if (!isResumed) {
                                        isResumed = true
                                        Handler(Looper.getMainLooper()).post {
                                            cleanup()
                                            if (continuation.isActive) continuation.resume(url)
                                        }
                                    }
                                }
                                return super.shouldInterceptRequest(view, request)
                            }

                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                request: WebResourceRequest?
                            ): Boolean {
                                val url = request?.url?.toString() ?: return false
                                if (BaseExtractor.isStreamableVideoUrl(url)) {
                                    if (!isResumed) {
                                        isResumed = true
                                        cleanup()
                                        if (continuation.isActive) continuation.resume(url)
                                    }
                                    return true
                                }
                                return false
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                // In case page finishes with video tag or download button
                                view?.evaluateJavascript(
                                    "(function() { " +
                                    "  var v = document.querySelector('video source, video, a[href*=\".mp4\"], a[href*=\".mkv\"]'); " +
                                    "  return v ? (v.src || v.href) : ''; " +
                                    "})()"
                                ) { result ->
                                    val clean = result?.trim('"', '\'') ?: ""
                                    if (clean.isNotBlank() && clean.startsWith("http") && !isResumed) {
                                        isResumed = true
                                        cleanup()
                                        if (continuation.isActive) continuation.resume(clean)
                                    }
                                }
                            }
                        }

                        loadUrl(targetUrl)
                    }
                } catch (e: Exception) {
                    cleanup()
                    if (continuation.isActive) continuation.resume(null)
                }
            }
        }
    }
}
