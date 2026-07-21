export const ROTATORS = {
  vegamovies: "https://vglist.top/?re=vegamovies",
  rogmovies: "https://vglist.top/?re=rogmovies",
  anime: "https://vglist.top/?re=anime",
  hollywood: "https://modlist.in/?type=hollywood",
  bollywood: "https://modlist.in/?type=bollywood",
  animeflix: "https://modlist.in/?type=animeflix"
};

export const extractDomainFromHtml = (html: string): string | null => {
  const refreshMatch = html.match(/url=(https?:\/\/[^"'\s>]+)/i);
  if (refreshMatch) return refreshMatch[1];

  const redirectMatch = html.match(/Redirecting to\s+(https?:\/\/[^"'\s<]+)/i);
  if (redirectMatch) return redirectMatch[1];

  return null;
};

export const resolveAllDomains = async (
  setStatusMessage: (msg: string) => void
): Promise<Record<string, string>> => {
  setStatusMessage('Syncing latest links...');
  const domains: Record<string, string> = {};
  const promises = Object.entries(ROTATORS).map(async ([key, url]) => {
    try {
      const response = await fetch(url);
      const html = await response.text();
      let finalUrl = extractDomainFromHtml(html);

      if (finalUrl) {
        if (finalUrl.endsWith('/')) finalUrl = finalUrl.slice(0, -1);
        domains[key] = finalUrl;
        console.log(`Resolved ${key} -> ${finalUrl}`);
      } else {
        throw new Error('No redirect URL found in HTML');
      }
    } catch (error) {
      console.error(`Failed to resolve ${key}:`, error);
      // Fallbacks
      if (key === 'vegamovies') domains[key] = 'https://vegamovies.navy';
      else if (key === 'hollywood') domains[key] = 'https://moviesmod.at';
      else if (key === 'bollywood') domains[key] = 'https://moviesleech.asia';
      else if (key === 'animeflix') domains[key] = 'https://animeflix.dad';
      else domains[key] = url;
    }
  });

  await Promise.all(promises);
  setStatusMessage('');
  return domains;
};
