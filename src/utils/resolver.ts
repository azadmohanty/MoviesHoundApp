import AsyncStorage from '@react-native-async-storage/async-storage';

export const ROTATORS = {
  vegamovies: "https://vglist.top/?re=vegamovies",
  moviesmod: "https://modlist.in/?type=hollywood",
  rogmovies: "https://vglist.top/?re=rogmovies",
  topmovies: "https://modlist.in/?type=bollywood",
  gokuhd: "https://vglist.top/?re=anime",
  animeflix: "https://modlist.in/?type=animeflix"
};

const CACHE_KEY = '@movieshound_domains_cache';
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours
const GITHUB_DOMAINS_URL = 'https://raw.githubusercontent.com/azadmohanty/MoviesHoundApp/main/domains.json';

export const extractDomainFromHtml = (html: string): string | null => {
  const refreshMatch = html.match(/url=(https?:\/\/[^"'\s>]+)/i);
  if (refreshMatch) return refreshMatch[1];

  const redirectMatch = html.match(/Redirecting to\s+(https?:\/\/[^"'\s<]+)/i);
  if (redirectMatch) return redirectMatch[1];

  return null;
};

export const HARDCODED_FALLBACKS: Record<string, string> = {
  vegamovies: 'https://vegamovies.navy',
  moviesmod: 'https://moviesmod.at',
  rogmovies: 'https://rogmovies.rest',
  topmovies: 'https://moviesleech.asia',
  gokuhd: 'https://gokuhd.com',
  animeflix: 'https://animeflix.dad',
  vidsrc: 'https://vidsrc2.ru'
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
          // Merge with hardcoded fallbacks just to be safe
          const mergedDomains = { ...HARDCODED_FALLBACKS, ...githubDomains };
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
        // Use hardcoded fallback for this key
        domains[key] = HARDCODED_FALLBACKS[key] || url;
      }
    });

    await Promise.all(promises);

    // Merge with HARDCODED_FALLBACKS to make sure every key is filled
    const completeDomains = { ...HARDCODED_FALLBACKS, ...domains };

    // Save to cache
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
      domains: completeDomains,
      timestamp: Date.now()
    }));

    setStatusMessage('Synced locally');
    setTimeout(() => setStatusMessage(''), 2000);
    return completeDomains;

  } catch (error) {
    console.error('Critical error in resolveAllDomains:', error);
    // Ultimate fallback: Try to return expired cache first, then hardcoded fallbacks
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { domains } = JSON.parse(cached);
        if (domains) {
          setStatusMessage('Using offline cache');
          setTimeout(() => setStatusMessage(''), 2000);
          return domains;
        }
      }
    } catch (_) {}

    setStatusMessage('Sync failed. Offline mode.');
    setTimeout(() => setStatusMessage(''), 2000);
    return HARDCODED_FALLBACKS;
  }
};
