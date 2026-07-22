# Technical Decoding Specifications & Code Mapping Guide

This document defines the exact reverse-engineered endpoints, regex patterns, decryption algorithms, and React Native porting specifications for all 5 verified providers.

---

## 1. MoviesMod
* **Source Repository**: `CSX` (`MoviesmodProvider.kt`, `Utils.kt`)
* **Live Domain**: `https://moviesmod.at` (dynamic fallback from `urls.json`)
* **Content Types**: Bollywood, Hollywood, Web Series, Dual Audio, Anime

### Reverse-Engineered Contracts & Selectors
| Function | Endpoint / Selector / Logic |
| :--- | :--- |
| **Search Endpoint** | `GET ${baseUrl}/search/${encodeURIComponent(query)}/page/1` |
| **Search Article Regex** | `<article[\s\S]*?>([\s\S]*?)<\/article>` |
| **Title Parsing** | `title="([^"]+)"` (stripped of `/^Download\s+/i`) |
| **Permalink Parsing** | `href="([^"]+)"` |
| **Poster Parsing** | `(?:data-src\|src)="([^"]+)"` |
| **Download Buttons** | `a.maxbutton-download-links`, `a.maxbutton-episode-links` |
| **Base64 Link Bypass** | If href contains `url=`, extract parameter and `Buffer.from(base64, 'base64').toString('utf-8')` |
| **WordPress Landing Bypass** | Submit `form#landing` inputs (`name` to `value`), extract `?go=skToken`, request with cookie `${skToken}=${formData._wp_http2}` |

---

## 2. BollyFlix
* **Source Repository**: `CSX` / `CNCVerse` (`BollyflixProvider.kt`, `Extractors.kt`)
* **Live Domain**: `https://bollyflix.at` (dynamic fallback from `urls.json`)
* **Content Types**: Bollywood, South Indian Hindi Dubbed, 4K Web Series

### Reverse-Engineered Contracts & Selectors
| Function | Endpoint / Selector / Logic |
| :--- | :--- |
| **Search Endpoint** | `GET ${baseUrl}/search/${encodeURIComponent(query)}/page/1/` |
| **Download Buttons** | `a.dl`, `a.maxbutton-download-links`, `a.btnn` |
| **Sidexfee Bypass** | `GET https://web.sidexfee.com/?id=${id}` ➡️ Extract `"link":"([^"]+)"` ➡️ Unescape `\\/` to `/` ➡️ Base64 decode |
| **FastDL Location Redirect** | `GET https://dl.fastdlserver.site/?id=${id}` with `allowRedirects: false` ➡️ Read HTTP 302 `Location` header |
| **File Hoster Mirror Target** | Resolves directly to `https://new3.gdflix.io/file/...` |

---

## 3. CineStream
* **Source Repository**: `CSX` (`CineStreamProvider.kt`, `CineStreamExtractors.kt`, `ApiConstants.kt`)
* **Live Domain**: Catalog via `https://v3-cinemeta.strem.io` & `https://aiometadata.elfhosted.com`
* **Content Types**: Global Movies, TV Series, Anime (Subbed & Dubbed), Torrents

### Reverse-Engineered Contracts & Selectors
| Function | Endpoint / Selector / Logic |
| :--- | :--- |
| **Torrentio Addon Endpoint** | `GET https://torrentio.strem.fun/limit=4/stream/movie/${imdb_id}.json` |
| **Stremio Stream Object** | `{ name, title, infoHash, fileIdx, behaviorHints: { filename, bingeGroup } }` |
| **Subtitles Endpoint** | `GET https://sub.wyzie.io/search?id=${imdb_id}` |
| **Multi-Host Aggregator** | Calls 30+ underlying streams (Showbox, Vidlink, Videasy, Allmovieland, Hexa, VaPlayer) |

---

## 4. VegaMovies
* **Source Repository**: `CSX` (`VegaMoviesProvider.kt`, `Extractors.kt`)
* **Live Domain**: `https://vegamovies.navy` (dynamic fallback from `urls.json`)
* **Content Types**: Bollywood, Dual-Audio 4K, Netflix / Hotstar Web Series

### Reverse-Engineered Contracts & Selectors
| Function | Endpoint / Selector / Logic |
| :--- | :--- |
| **Search API Endpoint** | `GET ${baseUrl}/search.php?q=${encodeURIComponent(query)}&page=1` |
| **JSON Search Payload** | `{ hits: [ { document: { post_title, permalink, post_thumbnail } } ] }` |
| **Step 1 (Movie Page)** | Scrape `<button class="dwd-button">` parent `<a>` href |
| **Step 2 (Intermediate Locker)** | `GET https://nexdrive.fit/genxfm.../` ➡️ Extract `<a href="*vcloud*">` |
| **Step 3 (VCloud Decryptor)** | `GET https://vcloud.zip/...` ➡️ Match Regex `var url = atob(atob('([^']+)'))` ➡️ Double base64 decode to retrieve tokenized stream URL |

---

## 5. MovieBox
* **Source Repository**: `CNCVerse` / `CSX` (`MovieBoxProvider.kt`, `CineStreamExtractors.kt`)
* **Live API Host**: `https://h5-api.aoneroom.com`
* **Content Types**: Latest Global Movies, Indian Movies, Web Series

### Reverse-Engineered Contracts & Selectors
| Function | Endpoint / Selector / Logic |
| :--- | :--- |
| **Step 1: Auth Token** | `GET ${BASE_URL}/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox` ➡️ Header `x-user` contains `{ "token": "..." }` |
| **Step 2: JSON Search** | `POST ${BASE_URL}/wefeed-h5api-bff/subject/search` with header `Authorization: Bearer ${token}` & body `{ keyword, page: 1, perPage: 10, subjectType: 1 }` |
| **Step 3: Detail Path** | `GET https://h5.aoneroom.com/wefeed-h5-bff/web/post/list/subject?id=${subjectId}` ➡️ Extract `detailPath` |
| **Step 4: Stream Download** | `GET ${BASE_URL}/wefeed-h5api-bff/subject/download?subjectId=${subjectId}` with header `Referer: https://fmoviesunblocked.net/...` |
| **Output Streams** | Direct fast `.mp4` CDN links (`bcdnxw.hakunaymatata.com`) for 480p, 720p, and 1080p |
