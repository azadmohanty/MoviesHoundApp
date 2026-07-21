
# Comprehensive Source Analysis for a MovieBox-Like App

## 1. HOW EACH SOURCE TYPE WORKS

There are fundamentally **4 architectural approaches** to getting video content. Understanding these is key to building your app.

---

### Approach A: Embed/Iframe Providers (Easiest — Streaming Only)

These are embed pages that take a TMDB or IMDB ID and return an HTML page with an embedded video player. You can either:

- **Load the iframe in a WebView** (trivial, but ads-heavy and less control)
- **Headlessly scrape the page** to extract the direct `.m3u8` (HLS) or `.mp4` URL

**How VidSrc works (the canonical example):**

```
Request:  GET https://vidsrc.to/embed/movie/{tmdb_id}
          OR https://vidsrc.to/embed/tv/{tmdb_id}/{season}/{episode}

Response: HTML page containing:
          1. A video player (usually using HLS.js or native <video>)
          2. Multiple source qualities embedded in JavaScript
          3. Subtitle tracks (VTT files)

To extract the direct .m3u8:
  - The embed page loads a JS bundle that constructs the stream URL
  - You need either a headless browser (Playwright/Puppeteer) or
    reverse-engineer the API call the JS makes
```

There are **pre-built scrapers** for this:

| Project | Language | What it does |
|---|---|---|
| `DivineChile/vidsrc-scraper` | Node.js + Playwright | Extracts `.m3u8` URLs and subtitles from multiple VidSrc domains |
| `cool-dev-guy/vidsrc-api` | Python | Extracts streams from vidsrc.to, vidsrc.me (4 sources at once) |
| `lestwastaken/lestresolver` | Go | Resolves HLS URLs from IMDB IDs via vidsrc.me/vidsrc.net |
| `@movie-web/providers` | TypeScript/JS | The gold standard — scrapes 10+ providers in one npm package |

---

### Approach B: Direct Scrape Sites (Downloading + Streaming)

These are websites that host direct download links. The pattern is:

1. Scrape the search page for results
2. Navigate to the movie detail page
3. Extract download links (usually hosted on file hosts like GD, Clicknupload, etc.)

**FzMovies scraping pattern (the most important one):**

```
Search:     GET https://fzmovies.net/search.php?keyword={query}
            Returns HTML table of results

Detail:     GET https://fzmovies.net/movie-{id}.htm
            Returns page with download links in qualities (480p, 720p)

Download:   Links point to direct .mp4 or .mkv files on CDN-like hosts

Automation: Use the unofficial Python API:
            from fzmovies_api import Auto
            Auto(query="Avatar", quality="720p").run()
```

The `fzmovies-api` Python package (`Simatwa/fzmovies-api`) handles the entire flow — search, filter by category/quality, and download.

---

### Approach C: Internal/Private APIs (Hardest)

MovieBox itself uses a private REST API with HMAC authentication:

```
Base:      api.inmoviebox.com
Auth:      HMAC-MD5 signature with a shared secret key (MOVIEBOX_PRIMARY_KEY)
Endpoint:  Various for search, details, stream URLs

This was documented in the NuvioStreams Addon source code
(provider source file: providers/moviebox.js)
```

This is the hardest to replicate because the keys are proprietary and may change. The `moviebox-api` Python package on PyPI attempted to wrap this, but it was unreliable.

---

### Approach D: The @movie-web/providers Package (Recommended Starting Point)

This is an **MIT-licensed npm package** that already implements scraping for dozens of providers. It's used by production apps (sudo-flix, VidBinge, etc.).

```
npm install @movie-web/providers
```

**Example usage:**

```typescript
import { makeProviders, makeSimpleScraperFilter } from '@movie-web/providers';

const providers = makeProviders({
  fetcher: ... // your fetcher (works in browser or Node)
});

const results = await providers.runAllScrapers({
  media: {
    type: 'movie',
    tmdbId: '19995' // Avatar
  },
  filter: makeSimpleScraperFilter({ returnType: 'stream' })
});
```

---

## 2. STREAMING vs DOWNLOADING — Complete Breakdown

| Source | Streaming | Downloading | Method | Quality Range |
|---|---|---|---|---|
| **VidSrc** (`vidsrc.to`, `vidsrc.me`, etc.) | Yes | No* | Embed/HLS scrape | 360p-1080p |
| **SuperEmbed** (`multiembed.mov`) | Yes | No* | Embed/HLS | 480p-1080p |
| **FzMovies** (`fzmovies.net`) | Yes | **Yes** | Direct .mp4 links | 480p, 720p |
| **Gomovies** | Yes | No | Embed | 720p-1080p |
| **ShowBox** | Yes | No | Embed/API | 720p-1080p |
| **FlixHQ** | Yes | No | Embed | 720p-1080p |
| **SmashyStream** | Yes | No | Embed | 720p-1080p |
| **MovieBox API** (`api.inmoviebox.com`) | Yes | **Yes** | HMAC API | Variable |
| **HDHub4u** | Yes | **Yes** | Direct links | 480p-4K |
| **VegaMovies** | Yes | **Yes** | Direct links | 480p-1080p |
| **PagalWorld** | Yes | **Yes** | Direct links | 360p-1080p |
| **MoviesMod** | Yes | **Yes** | Direct links | 480p-1080p |
| **BollyFlix** | Yes | **Yes** | Direct links | 480p-1080p |
| **KatWorld** | Yes | **Yes** | Direct links | 480p-4K |
| **YTS** (.mx) | Yes | **Yes** | Torrent + direct | 720p-1080p |
| **NetflixMirror** | Yes | No | Embed | 720p-1080p |

*\* "No*" means the embed page doesn't offer a download button, but you can capture the `.m3u8` stream URL and save it locally using `ffmpeg`.*

---

## 3. DIRECT SCRAPING TARGETS — Full List

Here are sites commonly used by apps like MovieBox, grouped by their characteristics.

### Tier 1: Proven, Reliable, Widely Used

These appear in multiple open-source scraping projects (CloudStream, movie-web, etc.):

| Site | URL Pattern | Type | Notes |
|---|---|---|---|
| **FzMovies** | `fzmovies.net` | Direct downloads | Python SDK available. .cms identifier in MovieBox |
| **FzTvSeries** | `fztvseries.net` | Direct downloads | TV shows specific |
| **HDHub4u** | `hdhub4u.med` | Direct downloads | Indian/Hollywood content |
| **VegaMovies** | `vegamovie.ink` | Direct downloads | Multi-quality, multi-language |
| **MoviesMod** | `moviesmod.rent` | Direct downloads | Hindi + dual audio |
| **BollyFlix** | `bollyflix.bond` | Direct downloads | Bollywood focus |
| **KatWorld** | `katworld.net` | Direct downloads | International |
| **FilmyFly** | `filmyflyz.com` | Direct downloads | Bollywood/Hollywood |
| **PagalWorld** | `pagalworldl.com` | Direct downloads | Hindi music + movies |
| **MP4Moviez** | `mp4moviez.bond` | Direct downloads | Hindi/English |

### Tier 2: Embed/Streaming Providers

These are the main embed-layer services that VidSrc and similar aggregators use:

| Service | URL Pattern | Type | How it works |
|---|---|---|---|
| **VidSrc** | `vidsrc.to/embed/movie/{tmdb}` | HLS stream | The big one. Multiple active domains: vidsrc2.ru, vidsrcme.ru, vsrc.su, etc. |
| **SuperEmbed** | `multiembed.mov/?video_id={tmdb}&tmdb=1` | HLS stream | Also at `getsuperembed.link` |
| **VidCloud** | `vidcloud.stream/{imdb}.html` | HLS stream | Old but works |
| **Gomovies** | `gomo.to/movie/{imdb}` | HLS stream | Multi-server |
| **CurtStream** | `curtstream.com/movies/imdb/{imdb}` | HLS stream | Simple embed |
| **FSAPI** | `fsapi.xyz/movie/{imdb}` | HLS stream | Returns JSON with stream URLs |
| **MovieWP** | `moviewp.com/se.php?video_id={tmdb}&tmdb=1` | HLS stream | Also supports TV |
| **APIMDB** | `v2.apimdb.net/e/movie/{imdb}` | HLS stream | Returns embed with stream |
| **DatabaseGDrive** | `databasegdriveplayer.co/player.php` | HLS stream | Google Drive sourced |

### Tier 3: CloudStream-Extracted Sources

From the Hexated, Phisher, and English provider repos (these are actively maintained):

| Provider | What you get | Language/Region |
|---|---|---|
| **Sorastream** | Multi-quality HLS | Global |
| **SuperStream** | HD streams | Global |
| **SFlix** | Embed streams | Global |
| **Cineby** | Embed streams | Global |
| **LookMovie2** | Embed streams | Global |
| **Putlocker** | Embed streams | Global |
| **ShowFlix** | Direct + Embed | Indian |
| **Dramacool** | Direct download | Asian/Korean |
| **KissKH** | Embed streams | Asian |
| **KissAsian** | Embed streams | Asian |
| **Tamilian** | Direct download | Tamil |
| **MassTamilan** | Direct download | Tamil |
| **Telugumv** | Direct download | Telugu |
| **MyFlixer** | Embed streams | Global |
| **NOXX** | Embed streams | Global |
| **YTS** (plugin) | Torrent links | Global |
| **CineStream** | Direct download | Indian |
| **World4uFree** | Direct download | Indian |
| **FourKHDHub** | Direct download | 4K content |
| **Streamblasters** | Embed streams | Global |
| **HDrezka** | Embed streams | Russian/Global |
| **LokLok** | Embed streams | Indonesian |

### Tier 4: File Host / CDN Sources

These are where the actual `.mp4`/`.mkv` files live. The scraping sites above usually link to these:

```
Google Drive (shared links)
Clicknupload
Indishare
RapidGator
Uploaded.net
1Fichier
Mega.nz
Pcloud
Ncloud
```

---

## 4. PRACTICAL IMPLEMENTATION BLUEPRINT

For a **mini MovieBox app**, here's what I'd recommend as your architecture:

### Phase 1: Streaming Only (Can build in a weekend)

```
TMDB API → Get movie metadata + IDs
     ↓
@movie-web/providers → Try all providers in order
     ↓
VidSrc fallback → Use a Node/Playwright scraper
     ↓
ExoPlayer / AVPlayer → Play the .m3u8 stream
```

### Phase 2: Add Downloads

```
Add FzMovies scraper → Extract direct .mp4 links
Add HDHub4u/VegaMovies scrapers → More download sources
Add Google Drive parsing → Handle GDrive-hosted content
```

### Phase 3: Production Scale

```
Backend proxy (to avoid CORS + IP bans):
  - Cloudflare Worker or Node/Express server
  - Caches scraped results
  - Rotates user-agents and IPs
```

### Concrete Code Example: VidSrc Scraper in Python

```python
import requests
import re
import json

def get_vidsrc_stream(tmdb_id, media_type="movie", season=1, episode=1):
    """Extract stream URL from VidSrc"""
    if media_type == "movie":
        url = f"https://vidsrc.to/embed/movie/{tmdb_id}"
    else:
        url = f"https://vidsrc.to/embed/tv/{tmdb_id}/{season}/{episode}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://vidsrc.to/"
    }

    resp = requests.get(url, headers=headers)
    # The page JS builds the stream URL dynamically
    # Look for JSON config or hls URL in the response
    hls_match = re.search(r'(https?://[^"\']+\.m3u8[^"\']*)', resp.text)
    if hls_match:
        return hls_match.group(1)

    # Fallback: extract the API endpoint from the page
    api_match = re.search(r'api\.vidsrc\.to/([a-z0-9/]+)', resp.text)
    if api_match:
        api_resp = requests.get(f"https://api.vidsrc.to/{api_match.group(1)}")
        return api_resp.json().get("stream_url")

    return None
```

### Concrete Code Example: FzMovies Download in Python

```python
from fzmovies_api import Auto

# Download a movie
auto = Auto(query="Avatar", quality="720p")
movie_file = auto.run()  # Downloads to current directory

# Or through the search-based API
from fzmovies_api import Search

search = Search("Avatar")
results = search.all_results
for r in results:
    print(f"{r.title} - {r.quality} - {r.size}")
```

---

## 5. KEY THINGS TO WATCH OUT FOR

| Issue | Mitigation |
|---|---|
| **Domain rotation** (VidSrc changes domains frequently) | Maintain a domain list, check `vidsrc.domains` for updates |
| **CAPTCHAs** (some sites use Cloudflare) | Use Playwright with stealth plugins or a captcha-solving service |
| **CORS blocking** (browser can't fetch from these sites) | Run a backend proxy (Node, Python, Cloudflare Worker) |
| **Rate limiting** | Add delays between requests, rotate user-agents |
| **DMCA takedowns** (sites go offline regularly) | Have 3-4 fallback sources per movie |
| **SSL errors** (some sites have expired certs) | Handle SSL verification gracefully in your HTTP client |

Want me to dig deeper into any specific source, show the exact scraping logic for a particular site, or help architect the app structure?