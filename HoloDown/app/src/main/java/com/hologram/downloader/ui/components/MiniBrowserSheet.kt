package com.hologram.downloader.ui.components

import android.annotation.SuppressLint
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.hologram.downloader.scrapers.base.BaseExtractor
import com.hologram.downloader.ui.theme.*

@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MiniBrowserSheet(
    url: String,
    onDismiss: () -> Unit,
    onMediaCaptured: (String) -> Unit
) {
    var currentUrl by remember { mutableStateOf(url) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = DarkSlateGlass,
        dragHandle = null,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
        ) {
            // Top Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSlateElevated)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "SAFETY-VALVE BROWSER",
                        color = ElectricIndigoLight,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.sp
                    )
                    Text(
                        text = currentUrl,
                        color = TextMuted,
                        fontSize = 11.sp,
                        maxLines = 1
                    )
                }

                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = TextPrimary
                    )
                }
            }

            // WebView
            Box(modifier = Modifier.weight(1f)) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { context ->
                        WebView(context).apply {
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.userAgentString = BaseExtractor.DEFAULT_UA

                            webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(
                                    view: WebView?,
                                    request: WebResourceRequest?
                                ): Boolean {
                                    val navUrl = request?.url?.toString() ?: return false
                                    currentUrl = navUrl
                                    if (BaseExtractor.isStreamableVideoUrl(navUrl)) {
                                        onMediaCaptured(navUrl)
                                        onDismiss()
                                        return true
                                    }
                                    return false
                                }

                                override fun shouldInterceptRequest(
                                    view: WebView?,
                                    request: WebResourceRequest?
                                ): android.webkit.WebResourceResponse? {
                                    val reqUrl = request?.url?.toString()
                                    if (!reqUrl.isNullOrBlank() && BaseExtractor.isStreamableVideoUrl(reqUrl) && !reqUrl.contains("google.com")) {
                                        view?.post {
                                            onMediaCaptured(reqUrl)
                                            onDismiss()
                                        }
                                    }
                                    return super.shouldInterceptRequest(view, request)
                                }
                            }

                            loadUrl(url)
                            webViewRef = this
                        }
                    }
                )

                // Floating Manual Capture Button
                Button(
                    onClick = {
                        webViewRef?.evaluateJavascript(
                            "(function() { " +
                            "  var v = document.querySelector('video source, video, a[href*=\".mp4\"], a[href*=\".mkv\"]'); " +
                            "  return v ? (v.src || v.href) : window.location.href; " +
                            "})()"
                        ) { result ->
                            val clean = result?.trim('"', '\'') ?: ""
                            if (clean.isNotBlank() && clean.startsWith("http")) {
                                onMediaCaptured(clean)
                                onDismiss()
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricIndigo),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(16.dp)
                        .fillMaxWidth(0.9f)
                        .height(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ElectricBolt,
                        contentDescription = null,
                        tint = VegaYellow,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "⚡ CAPTURE STREAM FROM PAGE",
                        color = TextPrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
