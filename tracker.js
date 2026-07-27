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

async function resolveKickAssAnime() {
  const hubUrl = 'https://kickassanime.cx';
  const candidates = new Set(['https://kickassanime.cx', 'https://kaa.lt', 'https://kaa.rs']);

  try {
    const res = await fetch(hubUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/https?:\/\/(?:www\.)?(?:kickass-?anime|kaa)\.[a-zA-Z]{2,4}/gi)].map(m => m[0]);
      matches.forEach(m => candidates.add(m));
    }
  } catch (e) {
    console.warn('Could not fetch KickAssAnime hub:', e.message);
  }

  for (const domain of candidates) {
    try {
      const res = await fetch(domain, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res && res.status < 400) {
        console.log(`Resolved kickassanime -> ${domain}`);
        return domain;
      }
    } catch (_) {}
  }
  return 'https://kickassanime.cx';
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

  // KickAssAnime resolution
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
