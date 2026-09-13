package com.hologram.downloader

import android.app.Application
import com.hologram.downloader.data.DomainSyncService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class HoloGramApp : Application() {
    private val appScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onCreate() {
        super.onCreate()
        appScope.launch {
            DomainSyncService.syncLatestDomainsFromGithub(
                context = applicationContext,
                onVegaUpdated = {},
                onMoviesModUpdated = {}
            )
        }
    }
}
