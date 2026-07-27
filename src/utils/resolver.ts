import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ============================================================================
 * HOLOGRAM DYNAMIC DOMAIN RESOLUTION SYSTEM
 * ============================================================================
 * INSTRUCTIONS FOR AI AGENTS & DEVELOPERS:
 *
 * ❌ NEVER hardcode static domain strings directly inside provider files
 *    (e.g., `const BASE_URL = 'https://site.com'`). Sites shift domains frequently.
 *
 * ✅ ALWAYS use `getLiveDomain('siteKey', 'fallbackUrl')` or `getLiveDomainAsync('siteKey')`.
 *
 * HOW THE ARCHITECTURE WORKS:
 * 1. `tracker.js` & `.github/workflows/sync.yml` run on GitHub every 6 hours.
 * 2. They ping mirrors, scrape hubs, and update `domains.json` on GitHub.
 * 3. HoloGram pulls raw `domains.json` from GitHub and caches it in `AsyncStorage` (`@domains_cache`).
 * 4. Resolvers consume active domains dynamically without needing APK binary rebuilds.
 *
 * STEPS TO ADD A NEW PROVIDER DOMAIN:
 * Step 1: Add your key & initial fallback URL to `HARDCODED_FALLBACKS` below.
 * Step 2: Add rotator/scraper logic to `tracker.js` in project root.
 * Step 3: In your resolver module, use: `getLiveDomain('yourKey')`.
 * ============================================================================
 */

export const ROTATORS = {
  vegamovies: "https://vglist.top/?re=vegamovies",
  moviesmod: "https://modlist.in/?type=hollywood",
  rogmovies: "https://vglist.top/?re=rogmovies",
  topmovies: "https://modlist.in/?type=bollywood",
  gokuhd: "https://vglist.top/?re=anime",
  animeflix: "https://modlist.in/?type=animeflix"
};

const CACHE_KEY = '@domains_cache';
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours
const GITHUB_DOMAINS_URL = 'https://raw.githubusercontent.com/azadmohanty/MoviesHoundApp/main/domains.json';

// In-memory cache for synchronous <1ms lookups
let inMemoryDomainsCache: Record<string, string> | null = null;

export const extractDomainFromHtml = (html: string): string | null => {
  const refreshMatch = html.match(/url=(https?:\/\/[^"'\s>]+)/i);
  if (refreshMatch) return refreshMatch[1];

  const redirectMatch = html.match(/Redirecting to\s+(https?:\/\/[^"'\s<]+)/i);
  if (redirectMatch) return redirectMatch[1];

  return null;
};

/**
 * Default initial fallbacks. Used ONLY on 1st app install if device is 100% offline
 * before GitHub domains.json has ever been fetched.
 */
export const HARDCODED_FALLBACKS: Record<string, string> = {
  vegamovies: 'https://vegamovies.navy',
  moviesmod: 'https://moviesmod.at',
  rogmovies: 'https://rogmovies.rest',
  topmovies: 'https://moviesleech.asia',
  gokuhd: 'https://gokuhd.com',
  animeflix: 'https://animeflix.dad',
  vidsrc: 'https://vidsrc2.ru',
  superembed: 'https://multiembed.mov',
  vidsrcto: 'https://vidsrc.to',
  anyembed: 'https://anyembed.xyz',
  kickassanime: 'https://kaa.lt',
  animedekho: 'https://animedekho.com',
  kisskh: 'https://kisskh.co',
  wcofun: 'https://www.wcofun.org'
};

/**
 * Returns the active domain for a provider synchronously from in-memory cache or fallbacks.
 */
export const getLiveDomain = (providerKey: string, fallbackUrl?: string): string => {
  if (inMemoryDomainsCache && inMemoryDomainsCache[providerKey]) {
    return inMemoryDomainsCache[providerKey];
  }
  return HARDCODED_FALLBACKS[providerKey] || fallbackUrl || 'https://google.com';
};

/**
 * Returns the active domain for a provider asynchronously by querying AsyncStorage cache first,
 * then falling back to in-memory/hardcoded defaults.
 */
export const getLiveDomainAsync = async (providerKey: string, fallbackUrl?: string): Promise<string> => {
  try {
    const cachedRaw = await AsyncStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
      const { domains } = JSON.parse(cachedRaw);
      if (domains && domains[providerKey]) {
        inMemoryDomainsCache = { ...inMemoryDomainsCache, ...domains };
        return domains[providerKey];
      }
    }
  } catch (e) {
    console.warn('[Domains] Failed reading AsyncStorage domain cache:', e);
  }

  return getLiveDomain(providerKey, fallbackUrl);
};

export const resolveAllDomains = async (
  setStatusMessage: (msg: string) => void,
  forceRefresh: boolean = false
): Promise<Record<string, string>> => {
  try {
    // 1. Try to load from cache if not forced
    if (!forceRefresh) {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { domains, timestamp } = JSON.parse(cached);
          if (domains && timestamp && Date.now() - timestamp < CACHE_EXPIRY_MS) {
            console.log('Using cached domains (age:', (Date.now() - timestamp) / 1000 / 60, 'mins)');
            inMemoryDomainsCache = domains;
            return domains;
          }
        } catch (e) {
          console.warn('Error parsing cached domains:', e);
        }
      }
    }

    // 2. Try fetching from GitHub
    setStatusMessage('Fetching latest domains...');
    try {
      console.log('Fetching domains from GitHub:', GITHUB_DOMAINS_URL);
      const response = await fetch(GITHUB_DOMAINS_URL, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (response.ok) {
        const githubDomains = await response.json();
        if (githubDomains && typeof githubDomains === 'object' && Object.keys(githubDomains).length > 0) {
          // Merge with hardcoded fallbacks
          const mergedDomains = { ...HARDCODED_FALLBACKS, ...githubDomains };
          inMemoryDomainsCache = mergedDomains;
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
            domains: mergedDomains,
            timestamp: Date.now()
          }));
          console.log('Successfully fetched and cached domains from GitHub');
          setStatusMessage('Synced via Cloud');
          setTimeout(() => setStatusMessage(''), 2000);
          return mergedDomains;
        }
      }
      throw new Error(`GitHub fetch returned status ${response.status}`);
    } catch (githubError) {
      console.warn('GitHub domains fetch failed, falling back to local resolution:', githubError);
    }

    // 3. Fallback: Run local resolver script
    setStatusMessage('Syncing locally on-device...');
    const domains: Record<string, string> = {};
    const promises = Object.entries(ROTATORS).map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        const html = await response.text();
        let finalUrl = extractDomainFromHtml(html);

        if (finalUrl) {
          if (finalUrl.endsWith('/')) finalUrl = finalUrl.slice(0, -1);
          domains[key] = finalUrl;
          console.log(`Locally resolved ${key} -> ${finalUrl}`);
        } else {
          throw new Error('No redirect URL found in HTML');
        }
      } catch (error) {
        console.error(`Failed to locally resolve ${key}:`, error);
        domains[key] = HARDCODED_FALLBACKS[key] || url;
      }
    });

    await Promise.all(promises);

    const completeDomains = { ...HARDCODED_FALLBACKS, ...domains };
    inMemoryDomainsCache = completeDomains;

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
      domains: completeDomains,
      timestamp: Date.now()
    }));

    setStatusMessage('Synced locally');
    setTimeout(() => setStatusMessage(''), 2000);
    return completeDomains;

  } catch (error) {
    console.error('Critical error in resolveAllDomains:', error);
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { domains } = JSON.parse(cached);
        if (domains) {
          inMemoryDomainsCache = domains;
          setStatusMessage('Using offline cache');
          setTimeout(() => setStatusMessage(''), 2000);
          return domains;
        }
      }
    } catch (_) {}

    inMemoryDomainsCache = HARDCODED_FALLBACKS;
    setStatusMessage('Sync failed. Offline mode.');
    setTimeout(() => setStatusMessage(''), 2000);
    return HARDCODED_FALLBACKS;
  }
};
