/**
 * scripts/check-domains.js
 *
 * Automated 6-Hour Domain Health Checker & Mirror Resolver
 * Scrapes official domain hubs (like kickassanime.cx), pings all mirrors,
 * and updates src/utils/domains.json automatically.
 */

const fs = require('fs');
const path = require('path');

const DOMAINS_JSON_PATH = path.join(__dirname, '..', 'src', 'utils', 'domains.json');

const KNOWN_HUBS = {
  kickassanime: {
    hubUrl: 'https://kickassanime.cx',
    fallbackMirrors: [
      'https://kickassanime.cx',
      'https://kaa.to',
      'https://kickass-anime.ru',
      'https://kaa.lt',
      'https://kaa.rs',
      'https://kaa.si'
    ],
    extractRegex: /https?:\/\/(?:www\.)?(?:kickass-?anime|kaa)\.[a-zA-Z]{2,4}/gi
  },
  vegamovies: {
    hubUrl: 'https://vegamovies.navy',
    fallbackMirrors: [
      'https://vegamovies.navy',
      'https://vegamovies.pages.dev',
      'https://vegamovies.yt'
    ],
    extractRegex: /https?:\/\/(?:www\.)?vegamovies\.[a-zA-Z0-9.-]+/gi
  },
  animedekho: {
    hubUrl: 'https://animedekho.com',
    fallbackMirrors: [
      'https://animedekho.com'
    ]
  },
  kisskh: {
    hubUrl: 'https://kisskh.co',
    fallbackMirrors: [
      'https://kisskh.co'
    ]
  },
  wcofun: {
    hubUrl: 'https://www.wcofun.org',
    fallbackMirrors: [
      'https://www.wcofun.org'
    ]
  }
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        ...options.headers
      }
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    return null;
  }
}

async function resolveWorkingDomainsForProvider(providerKey, config) {
  console.log(`\n🔍 Checking domains for [${providerKey}]...`);
  const candidates = new Set(config.fallbackMirrors);

  // 1. Scrape raw hub HTML if available
  if (config.hubUrl && config.extractRegex) {
    try {
      const res = await fetchWithTimeout(config.hubUrl);
      if (res && res.ok) {
        const html = await res.text();
        const matches = [...html.matchAll(config.extractRegex)].map(m => m[0].toLowerCase().trim());
        matches.forEach(m => candidates.add(m));
      }
    } catch (e) {
      console.warn(`Could not scrape hub ${config.hubUrl}:`, e.message);
    }
  }

  // 2. Ping candidates to find active 200 OK mirrors
  const verifiedOnline = [];
  for (const domain of candidates) {
    const res = await fetchWithTimeout(domain, { method: 'HEAD' });
    if (res && res.status < 400) {
      console.log(`  ✅ ${domain} -> HTTP ${res.status}`);
      verifiedOnline.push(domain);
    } else {
      console.log(`  ❌ ${domain} -> ${res ? `HTTP ${res.status}` : 'FAILED'}`);
    }
  }

  return verifiedOnline.length > 0 ? verifiedOnline : config.fallbackMirrors;
}

async function main() {
  console.log('====================================================');
  console.log('🤖 HoloGram 6-Hour Automated Domain Health Check');
  console.log('====================================================');

  let currentDomains = {};
  if (fs.existsSync(DOMAINS_JSON_PATH)) {
    try {
      currentDomains = JSON.parse(fs.readFileSync(DOMAINS_JSON_PATH, 'utf8'));
    } catch (e) {}
  }

  let updated = false;
  for (const [providerKey, config] of Object.entries(KNOWN_HUBS)) {
    const verified = await resolveWorkingDomainsForProvider(providerKey, config);
    const existing = currentDomains[providerKey] || [];

    if (JSON.stringify(verified) !== JSON.stringify(existing)) {
      currentDomains[providerKey] = verified;
      updated = true;
      console.log(`✨ Updated [${providerKey}] mirrors:`, verified);
    }
  }

  if (updated || !fs.existsSync(DOMAINS_JSON_PATH)) {
    fs.writeFileSync(DOMAINS_JSON_PATH, JSON.stringify(currentDomains, null, 2), 'utf8');
    console.log('\n💾 Successfully saved updated domains to src/utils/domains.json!');
  } else {
    console.log('\n👍 All domains are up-to-date. No changes needed.');
  }
}

main().catch(err => {
  console.error('Fatal error running check-domains script:', err);
  process.exit(1);
});
