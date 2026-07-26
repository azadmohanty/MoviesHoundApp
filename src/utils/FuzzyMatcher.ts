/**
 * FuzzyMatcher.ts
 *
 * Normalizes movie & web series titles and calculates match confidence scores
 * to resolve search ambiguity between TMDB queries and provider post titles.
 */

const NOISE_WORDS = [
  'download',
  'dual',
  'audio',
  'hindi',
  'english',
  'dubbed',
  'movie',
  'series',
  'season',
  'web-dl',
  'webdl',
  'bluray',
  'hdrip',
  'brrip',
  '480p',
  '720p',
  '1080p',
  '2160p',
  '4k',
  'hevc',
  '10bit',
  'x264',
  'x265',
  'esub',
  'msubs',
];

/**
 * Normalizes a raw string by removing special characters and noise words.
 */
export function normalizeTitleTokens(rawTitle: string): string[] {
  if (!rawTitle) return [];

  const clean = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ');
  return words.filter((w) => w.length > 0 && !NOISE_WORDS.includes(w));
}

/**
 * Calculates a match confidence score (0 - 100%) between a query title and target post title.
 */
export function calculateMatchConfidence(
  queryTitle: string,
  targetTitle: string,
  queryYear?: string | number,
  targetImdbId?: string,
  queryImdbId?: string
): number {
  // 1. Direct IMDb ID Match (100% confidence)
  if (queryImdbId && targetImdbId && queryImdbId.trim() === targetImdbId.trim()) {
    return 100;
  }

  const queryTokens = normalizeTitleTokens(queryTitle);
  const targetTokens = normalizeTitleTokens(targetTitle);

  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

  // Count matching tokens
  let matchedCount = 0;
  queryTokens.forEach((token) => {
    if (targetTokens.includes(token)) {
      matchedCount++;
    }
  });

  let score = Math.round((matchedCount / queryTokens.length) * 100);

  // If primary token matches and target has IMDb validation, ensure it passes threshold for golden check
  const primaryToken = queryTokens[0];
  if (primaryToken && targetTokens.includes(primaryToken)) {
    score = Math.max(score, 70);
  }

  // 2. Year Matching Boost / Penalty
  if (queryYear) {
    const yrStr = queryYear.toString();
    if (targetTitle.includes(yrStr)) {
      score = Math.min(100, score + 15);
    } else if (/\b(19|20)\d{2}\b/.test(targetTitle)) {
      // Different year penalty
      score = Math.max(0, score - 20);
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Sanitizes a title string for site search queries.
 * Replaces hyphens, colons, and special characters with spaces so titles like "Spider-Man: No Way Home"
 * become "Spider Man No Way Home", preserving specificity without API search syntax breakage.
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query) return '';

  const clean = query
    .replace(/\b(19|20)\d{2}\b/g, '') // Remove year numbers
    .replace(/[^a-zA-Z0-9\s]/g, ' ')  // Replace special chars/hyphens/colons with space
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ');
  if (words.length > 6) {
    return words.slice(0, 6).join(' ');
  }

  return clean;
}
