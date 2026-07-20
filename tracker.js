const fs = require('fs');

const ROTATORS = {
  vegamovies: "https://vglist.top/?re=vegamovies",
  rogmovies: "https://vglist.top/?re=rogmovies",
  anime: "https://vglist.top/?re=anime",
  hollywood: "https://modlist.in/?type=hollywood",
  bollywood: "https://modlist.in/?type=bollywood",
  animeflix: "https://modlist.in/?type=animeflix"
};

function extractDomainFromHtml(html) {
  const refreshMatch = html.match(/url=(https?:\/\/[^"'\s>]+)/i);
  if (refreshMatch) return refreshMatch[1];

  const redirectMatch = html.match(/Redirecting to\s+(https?:\/\/[^"'\s<]+)/i);
  if (redirectMatch) return redirectMatch[1];

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
  const domains = {};
  for (const [key, url] of Object.entries(ROTATORS)) {
    const resolved = await resolveDomain(key, url);
    if (resolved) {
      domains[key] = resolved;
    }
  }

  fs.writeFileSync('domains.json', JSON.stringify(domains, null, 2));
  console.log('Successfully updated domains.json');
}

main();
