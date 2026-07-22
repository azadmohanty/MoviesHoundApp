Here's a clean, organized report of all working providers with their details and code snippets:

---

# TIER 2: EMBED/STREAMING PROVIDERS

## 1. SuperEmbed VIP (Ranked #1)

| Detail | Value |
|---|---|
| URL | `https://multiembed.mov/directstream.php` |
| Params | `video_id={TMDB_ID}&tmdb=1` |
| Extra subs | `&sub_url={URL_ENCODED_VTT_URL}` |
| Stream type | HLS multi-quality (360p–1080p) |
| Ads | 1 popup |
| Audio | Multi-audio on VIP version |
| Subtitles | Built-in + custom via `&sub_url` |
| API key | Not needed |

**Usage:**
```
https://multiembed.mov/directstream.php?video_id=19995&tmdb=1
```

---

## 2. VidSrc (Ranked #2 — Best Uptime)

### Active Domains (July 2026)

| Domain | Status |
|---|---|
| `vidsrc2.ru` | ✅ Active |
| `vidsrcme.ru` | ✅ Active |
| `vidsrcme.su` | ✅ Active |
| `vidsrc-me.ru` | ✅ Active |
| `vidsrc-me.su` | ✅ Active |
| `vidsrc-embed.ru` | ✅ Active |
| `vidsrc-embed.su` | ✅ Active |
| `vsrc.su` | ✅ Active |
| `vidsrc.to` | ✅ Active |
| `vidsrc.dev` | ✅ Active |
| `vidsrc.ru` | ✅ Active |
| `vidsrc.fyi` | ✅ Active |

### URL Format

```
https://{domain}/embed/movie/{TMDB_ID}
https://{domain}/embed/tv/{TMDB_ID}/{SEASON}/{EPISODE}
```

**Example:**
```
https://vidsrc2.ru/embed/movie/19995
https://vidsrc.to/embed/tv/1399/1/1
```

### Custom Subtitle Parameters

| Parameter | Format | Example |
|---|---|---|
| `&sub_file` | URL-encoded VTT/SRT URL | `&sub_file=https%3A%2F%2Fexample.com%2Fsubs.vtt` |
| `&sub.info` | JSON array | `&sub.info=[{"lang":"English","url":"https://..."}]` |

### API Documentation

| Resource | URL |
|---|---|
| VidSrc API Docs | `https://vidsrc.dev/docs` |
| VidSrc API Docs | `https://vidsrc.ru/docs` |

---

## 3. MultiEmbed (Fallback)

```
https://multiembed.mov/directstream.php?video_id={TMDB_ID}&tmdb=1
```

Works identically to SuperEmbed VIP but less reliable uptime.

---

## 4. Embed Usage in React Native (WebView)

```tsx
import { WebView } from 'react-native-webview';

// SuperEmbed
<WebView
  source={{ uri: `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1` }}
  allowsFullscreenVideo
  mediaPlaybackRequiresUserAction={false}
/>

// VidSrc with fallback chain
const domains = [
  'vidsrc2.ru', 'vidsrcme.ru', 'vidsrcme.su',
  'vsrc.su', 'vidsrc.to', 'vidsrc.dev',
  'vidsrc.ru', 'vidsrc.fyi'
];
const firstWorking = await tryDomainsUntilOneWorks(domains, tmdbId);
<WebView
  source={{ uri: `https://${firstWorking}/embed/movie/${tmdbId}` }}
  allowsFullscreenVideo
/>
```

---

# TIER 3: CLOUDSTREAM-EXTRACTED SOURCES

## Active CloudStream Repositories

| Repo Name | Plugin JSON URL | Language | License |
|---|---|---|---|
| **Megix (CSX)** | `https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/CS.json` | Kotlin | GPLv3 |
| **Phisher** | `https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/plugins.json` | Kotlin | GPLv3 |
| **CNC Verse** | (private repo, MovieBox source) | Kotlin | GPLv3 |
| **English Multi-lingual** | (community repo) | Kotlin | GPLv3 |
| **Hexated** | (community repo) | Kotlin | GPLv3 |
| **Storm** | (community repo) | Kotlin | GPLv3 |

---

## Source Breakdown

### CineStream (via Megix/CSX repo)
- **Architecture**: Multi-database (TMDB + custom)
- **Subtitle support**: Best — multiple languages, VTT/SRT
- **Multi-audio**: Yes
- **Downloads**: Yes (both streaming + download links)
- **How it works**: Kotlin scraper → HTTP requests → HTML parsing → link extraction

### MovieBox (via CNC Verse repo)
- **Architecture**: Private API wrapper (reverse-engineered)
- **Subtitle support**: Good
- **Multi-audio**: Yes
- **Downloads**: Yes
- **Caveat**: API keys change frequently, needs updates

### VegaMovies
- **Architecture**: Direct HTML scraping
- **Output**: Direct `.mp4` / `.mkv` download URLs
- **Pipeline**: 3 pages deep (search → movie → download page → actual file)
- **Subtitle support**: Limited
- **Multi-audio**: Sometimes
- **Downloads**: Yes (primary purpose)

---

## CloudStream Pipeline Pattern (VegaMovies Example)

```
Page 1 (Search Results)
  └── Extract movie detail URL
Page 2 (Movie Detail Page)
  └── Extract download page URL
Page 3 (Download Page)
  └── Extract actual .mp4 / .mkv file URL
```

**Resolution strategy:** Chain HTTP requests with HTML parsing at each step.

---

# @movie-web/providers npm Package (v2.4.13)

## Installation
```bash
npm install @movie-web/providers
```

## Polyfills for React Native
```bash
npm install @react-native-anywhere/polyfill-base64 react-native-quick-crypto
```

**⚠ Expo Go incompatible** (needs native compilation for `react-native-quick-crypto`)

---

## Full List of Source Providers

| ID | Name | Type | Output |
|---|---|---|---|
| autoembed | AutoEmbed | Movies + TV | HLS streams |
| bombtheirish | BombTheirish | Movies | HLS streams |
| catflix | Catflix | Movies | HLS streams |
| flixhq | FlixHQ | Movies + TV | HLS streams |
| gomovies | GoMovies | Movies + TV | HLS streams |
| goojara | Goojara | Movies + TV | Direct downloads |
| hdrezka | HDRezka | Movies + TV | HLS streams (Russian + multi-lang) |
| kissasian | KissAsian | Asian dramas | HLS streams |
| lookmovie | LookMovie | Movies + TV | HLS streams |
| m4ufree | M4UFree | Movies + TV | HLS streams |
| nepu | Nepu | Movies + TV | HLS streams |
| nsbx | NSBX | Movies + TV | HLS streams |
| primewire | PrimeWire | Movies + TV | Embed links |
| redstar | RedStar | Movies | HLS streams |
| showbox | ShowBox | Movies + TV | HLS streams |
| smashystream | SmashyStream | Movies + TV | HLS streams |
| soapertv | SoaperTV | TV Shows | HLS streams |
| vidsrc | VidSrc | Movies + TV | HLS streams |
| vidsrcsu | VidSrcSU | Movies + TV | HLS streams |
| vidsrcto | VidSrcTo | Movies + TV | HLS streams |
| warezcdn | WarezCDN | Movies + TV | HLS streams |
| whvx | WHVX | Movies + TV | HLS streams (multi-layer embeds) |
| zoechip | ZoeChip | Movies + TV | HLS streams |
| remote | RemoteStream | Movies + TV | HLS streams |

---

## Full List of Embed Resolvers (40+)

These are the video hosting sites that source providers link to. The library handles the full redirect chain.

| Embed Host | What it resolves |
|---|---|
| UpCloud | HLS |
| VidCloud | HLS |
| Mp4Upload | Direct file |
| StreamTape | Direct file |
| MixDrop | Direct file |
| DoodStream | Direct file |
| Voe | Direct file |
| FebBox | HLS |
| FileMoon | Direct file |
| StreamSB | HLS |
| StreamHub | HLS |
| *+ 30 more* | |

---

## Code: Full Implementation

```typescript
import { makeProviders, makeStandardFetcher, targets } from '@movie-web/providers';

const providers = makeProviders({
  fetcher: makeStandardFetcher(fetch),
  target: targets.NATIVE
});

// Search + Scrape Movie
async function scrapeMovie(tmdbId: string, title: string, year: number) {
  return await providers.runAll({
    media: {
      type: 'movie',
      tmdbId,
      title,
      releaseYear: year
    }
  });
}

// Search + Scrape TV Show
async function scrapeEpisode(
  tmdbId: string, title: string, season: number, episode: number
) {
  return await providers.runAll({
    media: {
      type: 'show',
      tmdbId,
      title,
      season: { number: season },
      episode: { number: episode }
    }
  });
}

// Run single source
async function scrapeFromSource(sourceId: string, tmdbId: string, title: string, year: number) {
  return await providers.runSourceScraper({
    id: sourceId,  // e.g., 'showbox', 'vidsrc', 'flixhq'
    media: {
      type: 'movie',
      tmdbId,
      title,
      releaseYear: year
    }
  });
}

// List all available sources
const sources = providers.listSources();
console.log(sources.map(s => s.name));
```

---

## Stream Output Structure

```typescript
// HLS Stream
{
  stream: {
    type: 'hls',
    playlist: 'https://cdn.example.com/master.m3u8',
    headers: {
      'Referer': 'https://showbox.com/',
      'User-Agent': 'Mozilla/5.0 ...'
    },
    captions: [
      { type: 'vtt', url: 'https://...', language: 'en', hasCorsRestrictions: false },
      { type: 'vtt', url: 'https://...', language: 'es', hasCorsRestrictions: false }
    ]
  }
}

// Direct File Stream
{
  stream: {
    type: 'file',
    qualities: {
      '360': { url: 'https://cdn.../360.mp4' },
      '480': { url: 'https://cdn.../480.mp4' },
      '720': { url: 'https://cdn.../720.mp4' },
      '1080': { url: 'https://cdn.../1080.mp4' }
    },
    headers: {
      'Referer': 'https://goojara.to/'
    },
    captions: [...]
  }
}
```

---

# EXPO GO COMPATIBILITY MATRIX

| Approach | Works in Expo Go? | Notes |
|---|---|---|
| **SuperEmbed VIP** (embed + WebView) | ✅ Yes | No native modules needed |
| **VidSrc** (embed + WebView) | ✅ Yes | Fallback domains built-in |
| **@movie-web/providers** (direct in-app) | ❌ No | Needs `react-native-quick-crypto` native module |
| **Backend proxy** (server runs scrapers) | ✅ Yes | Expo app calls your backend API |
| **Expo Dev Client** (eas build) | ✅ Yes | Requires build, not Expo Go |
| **Kotlin rewrite** | ✅ Yes | Full native, but overkill |

**Recommended Expo Go setup:**
```tsx
// Option 1: SuperEmbed + TMDB (works today)
const embedUrl = `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1`;
<WebView source={{ uri: embedUrl }} allowsFullscreenVideo />

// Option 2: Backend proxy architecture
// Server (Node.js):
const { providers } = require('@movie-web/providers');
app.get('/api/stream', async (req, res) => {
  const result = await providers.runAll({ media: req.query });
  res.json(result.stream);
});
// Client (Expo Go):
const stream = await fetch(`https://your-api.com/api/stream?tmdbId=19995`);
// Play stream.url in expo-video or WebView
```

---

**Quick comparison table:**

| Source | Free | Ads | Multi-Audio | Multi-Sub | Downloads | Expo Go |
|---|---|---|---|---|---|---|
| SuperEmbed VIP | ✅ | 1 popup | ✅ | ✅ | ❌ | ✅ WebView |
| VidSrc | ✅ | 2-3 popups | ❌ (mostly) | ✅ | ❌ | ✅ WebView |
| @movie-web/providers | ✅ | None (direct) | ✅ | ✅ | ✅ (some) | ❌ (needs backend) |
| CloudStream (direct scrape) | ✅ | None | ✅ | ✅ | ✅ | ❌ (Kotlin) |



Site	URL Pattern	Type	Notes
FzMovies	fzmovies.net	Direct downloads	Python SDK available. .cms identifier in MovieBox
FzTvSeries	fztvseries.net	Direct downloads	TV shows specific
HDHub4u	hdhub4u.med	Direct downloads	Indian/Hollywood content


Megix Repo:    https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/CS.json
Phisher Repo:  https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/plugins.json
CNC Verse:     https://raw.githubusercontent.com/NivinCNC/CNCVerse-Cloud-Stream-Extension/refs/heads/builds/CNC.json
English Repo:  https://codeberg.org/cloudstream/cloudstream-extensions-multilingual/raw/branch/builds/repo.json