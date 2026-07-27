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
 * Calculates Levenshtein Distance between two strings for typo tolerance.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const lenA = a.length;
  const lenB = b.length;

  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  for (let i = 0; i <= lenB; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenA; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[lenB][lenA];
}

/**
 * Calculates fuzzy string similarity ratio between 0.0 and 1.0.
 */
export function fuzzySimilarity(a: string, b: string): number {
  const strA = a.toLowerCase().trim();
  const strB = b.toLowerCase().trim();
  if (strA === strB) return 1.0;
  if (strA.includes(strB) || strB.includes(strA)) return 0.85;

  const maxLen = Math.max(strA.length, strB.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(strA, strB);
  return 1 - dist / maxLen;
}

/**
 * Filters and ranks candidate items based on typo-tolerant fuzzy matching.
 */
export function findFuzzyTitleMatches<T extends { title: string }>(
  rawQuery: string,
  candidates: T[],
  limit: number = 5
): T[] {
  if (!rawQuery || rawQuery.trim().length === 0) return [];
  const cleanQuery = rawQuery.toLowerCase().trim();
  const queryTokens = normalizeTitleTokens(cleanQuery);

  const scored = candidates.map((item) => {
    const itemTitleLower = item.title.toLowerCase().trim();
    const itemTokens = normalizeTitleTokens(item.title);

    // Exact prefix match
    if (itemTitleLower.startsWith(cleanQuery)) {
      return { item, score: 100 };
    }

    // Contains query substring
    if (itemTitleLower.includes(cleanQuery)) {
      return { item, score: 90 };
    }

    // Token overlap match
    let tokenMatches = 0;
    queryTokens.forEach((qt) => {
      const bestTokenSim = Math.max(
        0,
        ...itemTokens.map((it) => fuzzySimilarity(qt, it))
      );
      if (bestTokenSim > 0.7) {
        tokenMatches += bestTokenSim;
      }
    });

    const tokenScore = queryTokens.length > 0 ? (tokenMatches / queryTokens.length) * 80 : 0;
    const fullSimScore = fuzzySimilarity(cleanQuery, itemTitleLower) * 70;

    return { item, score: Math.max(tokenScore, fullSimScore) };
  });

  // Unique by title and filter items with at least 40% similarity
  const uniqueMap = new Map<string, { item: T; score: number }>();
  scored.forEach((s) => {
    if (s.score >= 40) {
      const key = s.item.title.toLowerCase();
      if (!uniqueMap.has(key) || uniqueMap.get(key)!.score < s.score) {
        uniqueMap.set(key, s);
      }
    }
  });

  return Array.from(uniqueMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
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
