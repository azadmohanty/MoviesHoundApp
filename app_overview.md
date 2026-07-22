# HoloGram (MoviesHoundApp) - App Overview & Handoff Guide

HoloGram is a next-generation OTT streaming and download aggregation app built in React Native using Expo. It combines TMDB catalog browsing, automated background web scrapers, and dynamic server routing to provide a seamless streaming experience with **zero hardcoded dependencies**.

---

## 1. Core Technical Architecture & State Flow

### A. Catalog & Search Architecture
* **Metadata Provider**: TMDB (The Movie Database) and AniList (for Anime trending feeds).
* **Main Search Bar**: Tying keywords updates `query` and fetches autocomplete suggestions from TMDB.
* **Result Isolation**: The Home tab displays *only* TMDB catalog cards. It is 100% decoupled from scraping lists to prevent rendering stutters.
* **Direct Bypass Fallback**: If TMDB returns 0 results, a button appears: `"SEARCH DOWNLOAD FILES FOR '[QUERY]' DIRECTLY →"`. Clicking it launches the Scraper Terminal Modal directly using raw text, bypassing TMDB entirely.

### B. Scraper Terminal Modal Overlay (`HomeScreen.tsx`)
* **Trigger Points**: Tapping the **`↓` (Download)** badge on suggestion items, movie cards, details pages, or the fallback search button.
* **Isolated Scope**: It runs within its own slide-up Modal, managing separate states: `scraperQuery`, `scraperResults`, `scraperTasks`, and `scraperLoading`.
* **Dynamic WebViews**: Hidden WebViews run in the background to scrape files (e.g., Bollyflix, Vegamovies, GokuHD, RogMovies, MoviesMod).
* **Smart TV Suffixes**: If the media type is TV (`'tv'`), the trigger automatically detects the active season number and appends it to the query (e.g., *“Deadpool S01”*) so scrapers target the correct index page.

### C. Streaming Server Selector (`VideoPlayerModal.tsx`)
* **Player UI**: YouTube-style 16:9 player with details scrolled underneath, seasons/episodes grid selector, horizontal Cast avatar lanes, and "More Like This" carousels.
* **Unblocking Guide**: A toggleable helper panel labeled **`⚡ STREAM BLOCKED? TAP TO UNBLOCK`** instructs users on setting up Private DNS (`1dot1dot1dot1.cloudflare-dns.com`) or turning on a VPN to bypass Indian ISP blockages.
* **Active 5-Server Lineup**:
  1. **Server 1 (SUPER VIP)**: `https://multiembed.mov/directstream.php` (Direct HLS player with subtitles. Works in India).
  2. **Server 2 (SUPER SIMPLE)**: `https://multiembed.mov/` (Standard web player. Works in India).
  3. **Server 3 (VIDSRC 2.RU)**: Dynamic resolved mirror (Requires VPN/DNS in India).
  4. **Server 4 (VIDSRC TO)**: `https://vidsrc.to` (High-speed backup. Requires VPN/DNS in India).
  5. **Server 5 (ANYEMBED)**: `https://anyembed.xyz` (Alternative direct player. Works in India).

---

## 2. File Directory & Layout

* **[HomeScreen.tsx](file:///d:/2026/OWN_APP/src/screens/HomeScreen.tsx)**:
  * Manages Core Tabs (`HOME`, `EXPLORE`, `ME`).
  * Implements the Scraper Terminal layout, autocomplete suggestions dropdown, and hidden WebView tasks.
* **[VideoPlayerModal.tsx](file:///d:/2026/OWN_APP/src/components/VideoPlayerModal.tsx)**:
  * Layout for the top video player (VideoView / WebViews), server selectors, episodes list, and unblocking panel.
* **[streamResolver.ts](file:///d:/2026/OWN_APP/src/utils/streamResolver.ts)**:
  * Dynamic URL builder that pulls base domains from AsyncStorage cache and formats final links at runtime (zero-hardcoding).
* **[resolver.ts](file:///d:/2026/OWN_APP/src/utils/resolver.ts)**:
  * Fetches `domains.json` from GitHub, merges with `HARDCODED_FALLBACKS`, and caches them.
* **[domains.json](file:///d:/2026/OWN_APP/domains.json)**:
  * Remote dictionary storing current mirrors. Updated automatically by GitHub Actions.
* **[test_providers_suite.html](file:///d:/2026/OWN_APP/test_providers_suite.html)**:
  * Desktop browser testing dashboard featuring our exact ad-blocking script logs.

---

## 3. AdBlocker Script Specification

The WebViews in the player modal and scraper utilize a highly aggressive, recursive AdBlocker script to intercept redirects, popup windows, and overlay banners:
```javascript
const blockScript = `
  // 1. Prevent Popup Window Spawning
  window.open = function() { return null; };
  
  // 2. Intercept Navigation Redirects
  window.onbeforeunload = function() { return false; };
  
  // 3. Remove Ad Banners & Overlays
  setInterval(() => {
    document.querySelectorAll('iframe[src*="ads"], div[class*="ad-"], div[id*="ad-"], div[style*="z-index: 99999"]').forEach(el => el.remove());
  }, 1000);
`;
```

---

## 4. How to Run & Build during Handoff

* **Type Check**:
  ```bash
  npx tsc src/utils/resolver.ts src/utils/tmdb.ts src/utils/anilist.ts src/utils/streamResolver.ts src/components/ResultCard.tsx src/components/VideoPlayerModal.tsx src/screens/HomeScreen.tsx --noEmit --skipLibCheck --jsx react-native --target es2020 --module esnext --moduleResolution node --allowSyntheticDefaultImports
  ```
* **Run Dev Server**:
  ```bash
  npx expo start
  ```
* **Build Dev Client APK (Expo)**:
  ```bash
  npx eas build --platform android --profile development
  ```
