# 🚀 HoloGram - Master Project Handoff & Architecture Context

> **Instructions for AI Assistant**: Read this file at the start of a new chat session. It contains the complete technical state, working API resolvers, active server lineup, reverse-engineered providers, and the step-by-step Phase 1 & Phase 2 execution roadmap.

---

## 📌 1. Project Overview & Tech Stack
* **Project Name**: HoloGram (App Name: MoviesHound)
* **Workspace Path**: `D:\2026\HoloGram`
* **Framework**: React Native (Expo SDK 52+, Dev Client)
* **Language**: TypeScript (`.ts` / `.tsx`)
* **Native Video Player**: `expo-video` (`VideoView` & `useVideoPlayer`)
* **Web Player Fallback**: `react-native-webview` with injected JS CSS ad-blocker

---

## 🎬 2. Active Server Lineup (Verified & Working)

| Server ID | Server Label | Protocol / Engine | Player Component | Key Configuration |
| :--- | :--- | :--- | :--- | :--- |
| **Server 1** | **SERVER 1 (MOVIEBOX MP4)** | Direct `.mp4` CDN Link (`bcdnxw.hakunaymatata.com`) | Native `VideoView` | Requires `replaceAsync` with `User-Agent` & `Referer` (`https://fmoviesunblocked.net/`) headers |
| **Server 2** | **SERVER 2 (VIDSRC 2.RU)** | HLS Embed (`vidsrc2.ru`) | `<WebView>` | Injected ad-blocker script + top frame popup blocker |
| **Server 3** | **SERVER 3 (SUPEREMBED)** | Multi-iframe (`multiembed.mov`) | `<WebView>` | Injected ad-blocker script |
| **Server 4** | **SERVER 4 (ANYEMBED)** | Multi-iframe (`anyembed.xyz`) | `<WebView>` | Injected ad-blocker script |

---

## 🔑 3. Key Resolved Modules & Solvers

### A. MovieBox Resolver (`src/utils/movieboxResolver.ts`)
* **Endpoint**: `https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/...`
* **JWT Auth Extraction**: Dynamically fetches active tokens from `/app/get-latest-app-pkgs`.
* **Headers**: Required `Referer` (`https://fmoviesunblocked.net/...`) and `Origin` headers to unlock `.mp4` download streams.
* **Strict Title Relevance Matching**: `checkTitleRelevance()` enforces first-word similarity guards to prevent false matches (e.g. *"Bhooth Bangla"* will never match *"Baahubali 2 Bangla"*).
* **Multi-Audio Track / Dub Selector**: Automatically detects language variants (`Original` vs `Hindi`) and passes `preferredLanguage` parameter.

### B. Central Stream Resolver (`src/utils/streamResolver.ts`)
* Routes requests across Servers 1-4 and returns `StreamResult` with `isDirectStream`, `language`, and `availableLanguages`.

### C. Video Player Modal (`src/components/VideoPlayerModal.tsx`)
* **Background Audio Cleanup**: `handleClose()` calls `player.pause()` and clears state when closing (prevents background audio leak).
* **Option 2 Preview**: Blurred 16:9 ambient backdrop + sharp floating 2:3 poster card when not playing.
* **Side-by-Side Action Row**: **▶ STREAM NOW** (Pink) and **↓ DOWNLOAD** (Yellow) buttons side-by-side.
* **Dynamic Audio Selector**: Renders `[ 🌐 ORIGINAL AUDIO ]` / `[ 🌐 HINDI AUDIO ]` pills when Server 1 has audio variants.

---

## 📁 4. Reverse-Engineered Provider Artifacts (`scratch/decoded_providers/`)

1. [test_superstream.js](file:///D:/2026/HoloGram/scratch/decoded_providers/test_superstream.js): FlixHQ / SuperStream `.m3u8` API testing.
2. [test_cinemahd.js](file:///D:/2026/HoloGram/scratch/decoded_providers/test_cinemahd.js): CinemaHD legacy API domain audit.
3. [test_torrentio_stremio.js](file:///D:/2026/HoloGram/scratch/decoded_providers/test_torrentio_stremio.js): Stremio / Torrentio API (59 streams for Avatar, 50 streams for Breaking Bad S1E1).
4. [provider_decoding_summary.md](file:///D:/2026/HoloGram/scratch/decoded_providers/provider_decoding_summary.md): Summary report.

---

## 🔮 5. Future Feature Plans (`scratch/future_plans/`)

1. [realdebrid_stremio_integration_plan.md](file:///D:/2026/HoloGram/scratch/future_plans/realdebrid_stremio_integration_plan.md): Real-Debrid + Torrentio 4K HDR direct streaming blueprint.
2. [group_match_night_plan.md](file:///D:/2026/HoloGram/scratch/future_plans/group_match_night_plan.md): Swiparr-style room code / QR group swipe matching blueprint.

---

## 🚀 6. The Complete 4-Tab Makeover Roadmap

### 📄 Phase 1 Implementation Plan: [implementation_plan.md](file:///C:/Users/azadm/.gemini/antigravity-ide/brain/fb82afe6-9beb-4fff-b98a-d58f7ceb9d80/implementation_plan.md)

* **Bottom Tab Navigation Shell (`AppNavigator.tsx`)**:
  1. 🏠 **HOME**: Merged Home & Explore, **Swiparr Filter Drawer** (`FilterDrawerModal.tsx`), YouTube-style search bar with recent search history dropdown & clear chips, and dark-mode grey skeleton shimmer loaders (`SkeletonCard.tsx`).
  2. 🃏 **SWIPE**: Placeholder screen (Full Tinder engine in Phase 2).
  3. 📥 **DOWNLOADER**: Dedicated Scraper & Downloader Terminal (`DownloaderScreen.tsx`) + Navigation Migration link from `VideoPlayerModal.tsx`'s `↓ DOWNLOAD OPTIONS` button.
  4. 👤 **ME**: Profile stats, 5-List Management (`Watch Later`, `Watched`, `Liked`, `Loved`, `Disliked`), YouTube-style Watch History timeline, **preserves ALL existing settings** (TMDB Keys, Domain Cache Age, DNS Troubleshooter, Mirror Overrides), and **JSON Database Backup/Restore** (`DatabaseBackup.ts`).

### 📄 Phase 2 Implementation Plan: [implementation_plan_phase2.md](file:///C:/Users/azadm/.gemini/antigravity-ide/brain/fb82afe6-9beb-4fff-b98a-d58f7ceb9d80/implementation_plan_phase2.md)

* 🃏 **Tab 2 (SWIPE)**: Movie Tinder card deck with gestures (`SwipeScreen.tsx`).
* 🎨 **Dynamic Ambient Backdrop**: Blurred backdrop + dominant poster color palette extraction.
* 📋 **Swiparr Slide-Up Detail Sheet**: Exact UI matching screenshot (backdrop, poster, tagline, director, language, synopsis, horizontal cast list, and **"↗ See more"** button).
* 🎬 **3-Second Auto-Play Trailer**: Auto-plays YouTube trailer after 3 seconds on detail sheet.
* 🔴 **Netflix-Style Floating Action Button**: Quick play/stream FAB over poster.
* 🧠 **Smart Behavioral AI Taste Engine**: `TasteEngine.ts` (`+1.5` / `+0.5` / `-0.5` weighting, tracking streaming playback duration).
* 🖼️ **ImageCache & Auto-Watched Toast**: 150MB LRU image disk cache & >75% playback progress toast.

---

## 🧪 Quick Verification Command
```bash
npx tsc --noEmit --skipLibCheck
```
