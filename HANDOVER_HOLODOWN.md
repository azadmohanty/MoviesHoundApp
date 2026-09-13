# HoloDown: Native Kotlin High-Performance Download Aggregator
## Handover & Comprehensive Architectural Plan

---

## 1. Project Overview
- **App Name**: `HoloDown` (Standalone Native Kotlin Android App).
- **Location**: [`/HoloDown`](file:///d:/2026/HoloGram/HoloDown) inside the HoloGram repository.
- **Workflow / CI**: Dedicated GitHub Actions workflow [`.github/workflows/build-holodown.yml`](file:///d:/2026/HoloGram/.github/workflows/build-holodown.yml) builds and signs the debug/release APK in the cloud with zero local downloads required on PC.
- **Core Purpose**: Ultra-fast, lightweight (12MB), zero-crash **Media Download Aggregator & Manager** that scrapes verified direct locker links (FastDL, DriveSeed, HubCloud, MovieBox 1080p MP4) and launches external players like **VLC, MX Player, or Just Player** for offline/local playback.

---

## 2. Design System: Minimal Nothing OS / Cyberpunk Dark
- **Color Palette**:
  - `Background`: Deep Void (`#0D0E15`)
  - `Surface / Cards`: Dark Slate Glass (`#161922`)
  - `Border / Dividers`: Subtle Slate (`#222736`)
  - `Primary Accent`: Electric Indigo (`#6366F1`)
  - `Success / Speed`: Emerald Green (`#10B981`)
  - `Warning / Active`: Amber (`#F59E0B`)
- **Typography & Tags**: Monospace dot-matrix style tags for technical metadata (`[1080P]`, `[HINDI DUB]`, `[2.4 GB]`, `[FASTDL]`, `[DRIVESEED]`).

---

## 3. Detailed App Flow & UI Interactions

### Tab 1: Home (Discovery, Search & Download Resolver)
1. **Top Bar**:
   - App title (`HoloDown`) + Quick Search Bar with instant debounce.
   - Search accepts Movie/Series titles or direct scraper URLs.
2. **Catalog Feeds**:
   - TMDb Trending & Popular rows (Posters with title, year, and IMDb rating badge).
3. **Card Click Interaction**:
   - Opens the **Cinema Detail Bottom Sheet**:
     - Backdrop image gradient, Synopsis, Genre chips, Release year, Cast.
     - **For TV Series**: Season selector pills (`S1`, `S2`...) and Episode grid (`EP 01`, `EP 02`...).
     - Main Action Button: `[ ⚡ FETCH DOWNLOAD SOURCES ]`
4. **Download Resolution Engine (Parallel Multi-Scraper)**:
   - When tapped, triggers parallel search & match across:
     - `VegaMoviesProvider` (FastDL / VCloud)
     - `MoviesModProvider` (DriveSeed / HubCloud)
     - `MovieBoxProvider` (Direct CDN 1080p MP4)
   - Employs **3-Gate Deterministic Validation**:
     $$\text{Gate} = (\text{Title Similarity} \ge 65\%) \land (\Delta \text{Year} \le 1) \land (\text{Type Match})$$
   - Displays a clean list of verified download options grouped by Quality & Audio:
     - `Card 1`: **1080p Web-DL** • Dual Audio (Hindi + English) • `2.1 GB` • *FastDL* $\rightarrow$ `[ ⬇ DOWNLOAD ]`
     - `Card 2`: **720p HEVC** • Hindi Dub • `950 MB` • *DriveSeed* $\rightarrow$ `[ ⬇ DOWNLOAD ]`
     - `Card 3`: **480p SD** • English • `450 MB` • *MovieBox MP4* $\rightarrow$ `[ ⬇ DOWNLOAD ]`
5. **Download Trigger**:
   - Clicking `[ ⬇ DOWNLOAD ]` bypasses link-lockers in background coroutines.
   - Enqueues task into the native `DownloadService` with a foreground notification.
   - Displays an animated snackbar: `"Downloading Silo S01E02 (1080p)..."` with a quick action: `[ VIEW PROGRESS ]`.

---

### Tab 2: Downloader (Native Download Manager & Player Launcher)
1. **Active Downloads Section**:
   - Progress bar with real-time download speed (`MB/s`), bytes downloaded (`1.4 GB / 2.8 GB`), and ETA countdown.
   - Control buttons: `[ ⏸ Pause ]`, `[ ▶ Resume ]`, `[ ✕ Cancel ]`.
2. **Completed Downloads Section**:
   - List of saved files in standard Android `Download/HoloDown/` directory.
   - Metadata: File size, format (`.mkv`/`.mp4`), download date.
3. **Completed Item Click Interaction (External Player Integration)**:
   - Tapping any completed item fires an Android `Intent(Intent.ACTION_VIEW)` with MIME type `video/*`.
   - Android shows the player chooser (**VLC**, **MX Player**, **Just Player**, or default system player) with full hardware acceleration, multi-track audio switching, and gesture controls handled natively by the user's favorite player.
   - Long-press / 3-dots menu actions:
     - `[ ▶ Play with VLC / MX Player ]`
     - `[ 🔗 Share / Send File ]`
     - `[ 📁 Show in System Files ]`
     - `[ 🗑 Delete from Storage ]`

---

## 4. Scraper Engine Architecture (Modular Extractor Pattern)

```
com.hologram.downloader.scrapers/
├── base/
│   ├── ScraperProvider.kt       (Standard interface: search, loadDetails, extractDirectUrl)
│   ├── BaseExtractor.kt         (OkHttp client with header spoofing & Jsoup helpers)
│   └── FuzzyGateValidator.kt    (3-Gate Deterministic matcher)
├── providers/
│   ├── VegaMoviesProvider.kt    (Direct port of Vega Kotlin extractor)
│   ├── MoviesModProvider.kt     (Direct port of MoviesMod Kotlin extractor)
│   └── MovieBoxProvider.kt      (Pure JSON REST API client)
└── extractors/
    ├── FastDlExtractor.kt       (FastDL / VCloud direct stream resolver)
    ├── DriveSeedExtractor.kt    (DriveSeed / HubCloud direct stream resolver)
    └── SharedUrlBypasser.kt     (Base shortener / redirect unmasker)
```

---

## 5. Ready-to-Use Handover Prompt for Starting a New Chat

```text
We are developing HoloDown, a high-performance native Kotlin download aggregator located in `/HoloDown`.
The project is configured with Jetpack Compose, Kotlin 2.0, OkHttp/Jsoup, Material3, and a dedicated GitHub Actions build workflow (`.github/workflows/build-holodown.yml`).

Please review `HANDOVER_HOLODOWN.md` and the existing files in `HoloDown/` to begin implementing:
1. The TMDb API discovery client & Jetpack Compose Home Screen.
2. The Modular Scraper Provider Engine (VegaMovies, MoviesMod, MovieBox) with 3-Gate Deterministic Validation.
3. The Native Foreground Download Service with external video player launching (VLC / MX Player via Android Intent).
```
