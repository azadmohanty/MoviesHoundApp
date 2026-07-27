const fs = require('fs');

const ROTATORS = {
  vegamovies: "https://vglist.top/?re=vegamovies",
  moviesmod: "https://modlist.in/?type=hollywood",
  rogmovies: "https://vglist.top/?re=rogmovies",
  topmovies: "https://modlist.in/?type=bollywood",
  gokuhd: "https://vglist.top/?re=anime",
  animeflix: "https://modlist.in/?type=animeflix"
};

function extractDomainFromHtml(html) {
  const refreshMatch = html.match(/url=(https?:\/\/[^"'\s>]+)/i);
  if (refreshMatch) return refreshMatch[1];

  const redirectMatch = html.match(/Redirecting to\s+(https?:\/\/[^"'\s<]+)/i);
  if (redirectMatch) return redirectMatch[1];

  return null;
}

/**
 * Resolves active streaming mirror for KickAssAnime.
 * Scrapes landing hub https://kickassanime.cx for actual streaming domains (e.g. https://kaa.lt, kaa.to),
 * and verifies that the search engine endpoint (/search?q=test) returns HTTP 200.
 */
async function resolveKickAssAnime() {
  const hubUrl = 'https://kickassanime.cx';
  const candidates = new Set(['https://kaa.lt', 'https://kaa.to', 'https://kaa.rs', 'https://kaa.si']);

  try {
    const res = await fetch(hubUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (res.ok) {
      const html = await res.text();
      // Extract links like https://kaa.lt or kaa.to from hub HTML text
      const matches = [...html.matchAll(/https?:\/\/(?:www\.)?(?:kickass-?anime|kaa)\.[a-zA-Z]{2,4}/gi)].map(m => m[0]);
      matches.forEach(m => {
        if (!m.includes('kickassanime.cx')) candidates.add(m);
      });
    }
  } catch (e) {
    console.warn('Could not fetch KickAssAnime hub:', e.message);
  }

  // Ping candidate streaming search endpoints
  for (const domain of candidates) {
    try {
      const testUrl = `${domain}/search?q=test`;
      const res = await fetch(testUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (res && res.status === 200) {
        console.log(`Resolved kickassanime streaming engine -> ${domain}`);
        return domain;
      }
    } catch (_) {}
  }

  return 'https://kaa.lt';
}

async function resolveVidSrc() {
  const mirrors = [
    'https://vidsrc2.ru',
    'https://vidsrc.to',
    'https://vidsrcme.ru',
    'https://vsrc.su',
    'https://vidsrcme.su',
    'https://vidsrc-embed.ru'
  ];
  for (const url of mirrors) {
    try {
      const res = await fetch(`${url}/embed/movie/19995`, { method: 'HEAD' });
      if (res.status === 200 || res.status === 301 || res.status === 302) {
        console.log(`Resolved vidsrc -> ${url}`);
        return url;
      }
    } catch (e) {
      // Continue to next mirror
    }
  }
  return null;
}

async function resolveDomain(key, url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    let finalUrl = extractDomainFromHtml(html);

    if (finalUrl) {
      if (finalUrl.endsWith('/')) finalUrl = finalUrl.slice(0, -1);
      console.log(`Resolved ${key} -> ${finalUrl}`);
      return finalUrl;
    } else {
      throw new Error('No redirect URL found in HTML');
    }
  } catch (error) {
    console.error(`Failed resolving ${key}:`, error);
    return null;
  }
}

async function main() {
  let domains = {};
  try {
    if (fs.existsSync('domains.json')) {
      domains = JSON.parse(fs.readFileSync('domains.json', 'utf8'));
    }
  } catch (err) {
    console.error('Failed reading existing domains.json:', err);
  }

  for (const [key, url] of Object.entries(ROTATORS)) {
    const resolved = await resolveDomain(key, url);
    if (resolved) {
      domains[key] = resolved;
    } else {
      console.log(`Keeping existing domain for ${key} -> ${domains[key]}`);
    }
  }

  // KickAssAnime streaming engine resolution
  domains['kickassanime'] = await resolveKickAssAnime();
  domains['animedekho'] = 'https://animedekho.com';
  domains['kisskh'] = 'https://kisskh.co';
  domains['wcofun'] = 'https://www.wcofun.org';

  const vidsrcResolved = await resolveVidSrc();
  if (vidsrcResolved) {
    domains['vidsrc'] = vidsrcResolved;
  } else if (!domains['vidsrc']) {
    domains['vidsrc'] = 'https://vidsrc2.ru';
  }

  fs.writeFileSync('domains.json', JSON.stringify(domains, null, 2));
  console.log('Successfully updated domains.json');
}

main();
