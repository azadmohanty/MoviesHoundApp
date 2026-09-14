# In-App Downloader & MovieBox Archive

This directory preserves all legacy in-app downloader, local storage download management, notification service, and MovieBox API components. None of this code has been deleted.

---

## Component Index & Roles

### 1. `DownloadService.kt`
- **Role**: An Android `ForegroundService` (`FOREGROUND_SERVICE_TYPE_DATA_SYNC`) intended to keep downloads active in the notification drawer when the app is in the background.
- **Why Archived**: On Android 8.0 through Android 14+, `Context.startForegroundService()` crashes with `ForegroundServiceDidNotStartInTimeException` if called when no active download is running. The app was converted to a lightweight scraper that delegates actual file downloading to external browsers (Brave/Chrome) and dedicated download managers (1DM/ADM).

### 2. `DownloadManager.kt`
- **Role**: Singleton manager handling OkHttp byte-range requests, multi-threaded chunk downloading, file I/O to public `Downloads/HoloDown/`, download status state flows (`DOWNLOADING`, `PAUSED`, `COMPLETED`), and local file scanning.
- **Why Archived**: Replaced by external hand-off. Retained here if offline file management is desired in a future major release.

### 3. `NotificationHelper.kt`
- **Role**: Builds and posts Android Notification channels (`holodown_downloads_channel`) with custom progress bars, speed metrics (KB/s, MB/s), ETA strings, and interactive Pause/Cancel PendingIntents.

### 4. `DownloadProgressCard.kt` & `CompletedDownloadCard.kt`
- **Role**: Jetpack Compose UI cards for active progress bars and completed offline files with intent launchers for VLC, MX Player, Just Player, and File Sharing.

### 5. `MovieBoxProvider.kt`
- **Role**: Reverse-engineered client for the MovieBox H5 BFF API (`https://h5-api.aoneroom.com/wefeed-h5api-bff` & `https://netfilm.world`). Performs JSON search and fetches direct Akamai/CDN MP4 streams with resolution tags.
- **Why Archived**: Put on standby per architecture decision to focus HoloDown strictly as a minimal, accurate scraper for VegaMovies and MoviesMod. Can be reactivated as a modular extension in the future.

---

## How to Re-Integrate
1. Move the `.kt` files back into their respective packages (`service/`, `ui/components/`, `scrapers/providers/`).
2. Add the `<service>` tag back into `AndroidManifest.xml`.
3. In `DownloadManager`, ensure `startForegroundService` is **only** triggered when `tasks.value.any { it.status == DOWNLOADING }` to avoid the startup timeout crash.
