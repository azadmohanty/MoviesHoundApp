package com.hologram.downloader

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.hologram.downloader.data.DomainSyncService
import com.hologram.downloader.scrapers.ScraperEngine
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.ui.screens.DownloaderScreen
import com.hologram.downloader.ui.screens.HomeScreen
import com.hologram.downloader.ui.screens.MeScreen
import com.hologram.downloader.ui.theme.DarkSlateGlass
import com.hologram.downloader.ui.theme.DeepVoid
import com.hologram.downloader.ui.theme.ElectricIndigo
import com.hologram.downloader.ui.theme.HoloDownTheme
import com.hologram.downloader.ui.viewmodel.DownloaderViewModel
import com.hologram.downloader.ui.viewmodel.HomeViewModel
import com.hologram.downloader.ui.viewmodel.MeViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val scraperEngine = ScraperEngine()

        // Sync latest domains from GitHub with 90-min cache
        lifecycleScope.launch(Dispatchers.IO) {
            val domains = DomainSyncService.syncLatestDomainsFromGithub(applicationContext, force = false)
            scraperEngine.updateDomains(
                vegamovies = domains["vegamovies"],
                moviesmod = domains["moviesmod"]
            )
        }

        val homeViewModel = HomeViewModel(scraperEngine = scraperEngine)
        val downloaderViewModel = DownloaderViewModel(scraperEngine = scraperEngine)
        val meViewModel = MeViewModel(applicationContext, scraperEngine)

        setContent {
            HoloDownTheme {
                MainContainer(
                    homeViewModel = homeViewModel,
                    downloaderViewModel = downloaderViewModel,
                    meViewModel = meViewModel
                )
            }
        }
    }
}

@Composable
fun MainContainer(
    homeViewModel: HomeViewModel,
    downloaderViewModel: DownloaderViewModel,
    meViewModel: MeViewModel
) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = DarkSlateGlass
            ) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = ElectricIndigo,
                        selectedTextColor = ElectricIndigo,
                        unselectedIconColor = Color.Gray,
                        unselectedTextColor = Color.Gray,
                        indicatorColor = Color.Transparent
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Download, contentDescription = "Downloader") },
                    label = { Text("Downloader") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = ElectricIndigo,
                        selectedTextColor = ElectricIndigo,
                        unselectedIconColor = Color.Gray,
                        unselectedTextColor = Color.Gray,
                        indicatorColor = Color.Transparent
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Person, contentDescription = "Me") },
                    label = { Text("Me") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = ElectricIndigo,
                        selectedTextColor = ElectricIndigo,
                        unselectedIconColor = Color.Gray,
                        unselectedTextColor = Color.Gray,
                        indicatorColor = Color.Transparent
                    )
                )
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(DeepVoid)
                .padding(innerPadding)
        ) {
            when (selectedTab) {
                0 -> HomeScreen(
                    viewModel = homeViewModel,
                    onNavigateToDownloader = { query, year, isTv, season, episode, directArticleUrl ->
                        selectedTab = 1
                        if (!directArticleUrl.isNullOrBlank()) {
                            val dummyArticle = ScrapedArticle(
                                id = "direct-${System.currentTimeMillis()}",
                                title = query,
                                permalink = directArticleUrl,
                                siteKey = if (directArticleUrl.contains("moviesmod")) "moviesmod" else "vegamovies",
                                siteDisplayName = if (directArticleUrl.contains("moviesmod")) "MoviesMod" else "VegaMovies"
                            )
                            downloaderViewModel.selectArticle(dummyArticle)
                        } else {
                            downloaderViewModel.setQuery(query)
                            downloaderViewModel.triggerSearch(query)
                        }
                    }
                )
                1 -> DownloaderScreen(
                    viewModel = downloaderViewModel
                )
                2 -> MeScreen(
                    viewModel = meViewModel
                )
            }
        }
    }
}
