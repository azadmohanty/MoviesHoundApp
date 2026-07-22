# CloudStream Decoded Providers & Verification Suite

This folder contains the complete reverse-engineered technical specifications, API contracts, link-decryption algorithms, and standalone Node.js verification scripts for the **5 top-tier providers** extracted from CloudStream repositories.

---

## 📁 Folder Structure

```
decoded_providers/
├── README.md                   # Complete overview & test execution guide (this file)
├── provider_decoding_summary.md# Technical porting specs for MoviesHound React Native integration
├── test_moviesmod.js          # Standalone test script for MoviesMod (search + base64 link bypass)
├── test_bollyflix.js          # Standalone test script for Bollyflix (search + fastdlserver 302 redirect)
├── test_cinestream.js         # Standalone test script for CineStream (Torrentio Stremio addon streams)
├── test_vegamovies.js         # Standalone test script for VegaMovies (3-step VCloud double atob token)
└── test_moviebox.js          # Standalone test script for MovieBox (4-step JSON API to direct MP4 CDN)
```

---

## 🚀 How to Run & Verify the Scripts

All test scripts are zero-dependency Node.js scripts using native standard modules (`http`, `https`, `Buffer`). You can execute them directly from the root of the project:

### 1. Test MoviesMod
```bash
node decoded_providers/test_moviesmod.js
```
* **Target Domain**: `https://moviesmod.at`
* **What it tests**: Search query parsing (`/search/query/page/1`) and base64 `url=` link decoding.

### 2. Test BollyFlix
```bash
node decoded_providers/test_bollyflix.js
```
* **Target Domain**: Dynamic from config (`https://bollyflix.at`)
* **What it tests**: Remote URL config fetching, HTML article parsing, `fastdlserver` HTTP 302 location header redirection to file lockers (`new3.gdflix.io`).

### 3. Test CineStream (Torrentio & Stremio Addons)
```bash
node decoded_providers/test_cinestream.js
```
* **Target Domain**: `https://torrentio.strem.fun`
* **What it tests**: Stremio addon stream endpoint (`/stream/movie/{imdb_id}.json`), returning 20+ HLS and torrent streams with infoHashes and quality tags.

### 4. Test VegaMovies
```bash
node decoded_providers/test_vegamovies.js
```
* **Target Domain**: `https://vegamovies.navy`
* **What it tests**: Search API (`/search.php?q=query`), button extraction, `nexdrive.fit` intermediate page parsing, and VCloud double `atob` base64 token decoding.

### 6. Verify Actual Video Playback & Byte-Range Scrubbing
```bash
node decoded_providers/verify_video_playback.js
```
* **What it tests**: Sends HTTP Range requests (`bytes=0-1023`) directly to the extracted `.mp4` CDN stream URL.
* **Verified Output Metrics**:
  * **HTTP Status**: `206 Partial Content` (Confirms player seekability & fast-forwarding support)
  * **Content-Type**: `video/mp4`
  * **Accept-Ranges**: `bytes`
  * **MP4 Hex Magic Bytes**: `6674797069736f6d` (`ftypisom` ISO media container signature verified)

---

## 🌐 Dynamic Base URL Config Endpoint

Many Indian providers update their TLD domains when blocked by ISPs. All decoded scripts integrate with the official CloudStream dynamic domain lookup URL:
```
https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json
```
This remote JSON provides live active domains for `moviesmod`, `bollyflix`, `vegamovies`, `topmovies`, `rogmovies`, `gdflix`, `mlsbd`, `uhdmovies`, `moviesdrive`, and more.
