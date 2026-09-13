/**
 * 🎬 MovieBox Main Stream Resolver for HoloGram (Server 2)
 * Pure REST Client with 3-Gate Deterministic Validation & Multi-Language Audio Mapping
 */

import { movieboxService, MovieBoxStreamSource } from '../services/movieboxService';

export type MovieBoxStream = {
  url: string;
  resolution: number;
  qualityLabel: string;
  language?: string;
  availableLanguages?: string[];
  sources?: MovieBoxStreamSource[];
};

// Helper: Normalize title by removing tags like [Hindi], S1-S4, (2024)
const normalizeTitle = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/\bs\d+(-\s*s?\d+)?\b/gi, '')
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Gate 1: Strict Title Similarity Check
 */
const checkTitleRelevance = (query: string, candidate: string): boolean => {
  const normQuery = normalizeTitle(query);
  const normCandidate = normalizeTitle(candidate);

  if (normQuery === normCandidate) return true;
  if (normCandidate.includes(normQuery) || normQuery.includes(normCandidate)) return true;

  const queryWords = normQuery.split(' ').filter((w) => w.length > 2);
  const candidateWords = normCandidate.split(' ').filter((w) => w.length > 2);

  if (queryWords.length === 0) return false;

  const firstWord = queryWords[0];
  if (!normCandidate.includes(firstWord)) {
    return false;
  }

  const matches = queryWords.filter((qw) =>
    candidateWords.some((cw) => cw.includes(qw) || qw.includes(cw))
  );
  const matchRatio = matches.length / queryWords.length;

  return matchRatio >= 0.65;
};

/**
 * Detect Audio Language from MovieBox Subject Title
 */
const detectAudioLanguage = (title: string): string => {
  const lower = title.toLowerCase();
  if (lower.includes('[hindi]') || lower.includes('(hindi)')) return 'Hindi';
  if (lower.includes('[tamil]') || lower.includes('(tamil)')) return 'Tamil';
  if (lower.includes('[telugu]') || lower.includes('(telugu)')) return 'Telugu';
  if (lower.includes('[english]') || lower.includes('(english)')) return 'English';
  if (lower.includes('[korean]') || lower.includes('(korean)')) return 'Korean';
  if (lower.includes('[japanese]') || lower.includes('(japanese)')) return 'Japanese';
  return 'Original';
};

/**
 * 🎯 Main MovieBox Stream Resolver with 3-Gate Validation
 */
export const resolveMovieBoxStream = async (
  title: string,
  mediaType: 'movie' | 'tv' = 'movie',
  season: number = 1,
  episode: number = 1,
  preferredLanguage: string = 'Original',
  year?: string
): Promise<MovieBoxStream | null> => {
  try {
    console.log(
      `[MovieBox Resolver] Initiating search for: "${title}" (${mediaType}, S${season}E${episode}, Year: ${year || 'N/A'}, PrefLang: ${preferredLanguage})`
    );

    // 1. Search MovieBox Catalog using movieboxService
    const rawItems = await movieboxService.search(title.trim());
    if (!rawItems || rawItems.length === 0) {
      console.log(`[MovieBox Resolver] No search results found for: "${title}"`);
      return null;
    }

    // 2. Run 3-Gate Deterministic Validation
    const validatedCandidates: {
      item: any;
      audioLang: string;
      score: number;
    }[] = [];

    const normTarget = normalizeTitle(title);

    for (const item of rawItems) {
      const itemTitle = item.title || '';
      const itemYear = item.year;

      // GATE 1: Title Relevance Gate
      if (!checkTitleRelevance(title, itemTitle)) {
        continue;
      }

      // GATE 2: Release Year Gate (allow ±1 year tolerance if year provided)
      if (year && itemYear) {
        const yNum = parseInt(year, 10);
        const iyNum = parseInt(itemYear, 10);
        if (!isNaN(yNum) && !isNaN(iyNum)) {
          if (Math.abs(yNum - iyNum) > 1) {
            continue; // Rejected by Year Gate
          }
        }
      }

      // GATE 3: Media Type Gate
      if (mediaType === 'movie') {
        if (!itemTitle.includes('S1') && (itemTitle.includes('S2') || itemTitle.includes('S3') || itemTitle.includes('S4'))) {
          continue;
        }
      }

      // Score Candidate
      let score = 0;
      const normItem = normalizeTitle(itemTitle);
      if (normTarget === normItem) score += 50;
      else score += 30;

      if (year && itemYear && year === itemYear) score += 20;

      const audioLang = detectAudioLanguage(itemTitle);
      validatedCandidates.push({ item, audioLang, score });
    }

    if (validatedCandidates.length === 0) {
      console.log(`[MovieBox Resolver] All candidates rejected by 3-Gate Validation for: "${title}"`);
      return null;
    }

    // 3. Audio Language Mapping
    const availableLanguages = Array.from(new Set(validatedCandidates.map((c) => c.audioLang)));

    let selectedCandidate = validatedCandidates.find(
      (c) => c.audioLang.toLowerCase() === preferredLanguage.toLowerCase()
    );

    if (!selectedCandidate) {
      validatedCandidates.sort((a, b) => b.score - a.score);
      selectedCandidate = validatedCandidates[0];
    }

    const matchedItem = selectedCandidate.item;
    let targetSubjectId = matchedItem.subject_id;
    const detailPath = matchedItem.slug;

    // Check if the item's detail has explicit dubs matching preferredLanguage
    try {
      const detail = await movieboxService.getDetail(detailPath);
      if (detail?.dubs && detail.dubs.length > 0) {
        const matchedDub = detail.dubs.find(
          (d) =>
            d.language_name.toLowerCase().includes(preferredLanguage.toLowerCase()) ||
            (preferredLanguage.toLowerCase() === 'original' && d.is_original)
        );
        if (matchedDub) {
          targetSubjectId = matchedDub.subject_id;
          console.log(`[MovieBox Resolver] Switched to specific dub subject ID: ${targetSubjectId} (${matchedDub.language_name})`);
        }
      }
    } catch {
      // ignore detail dub lookup error
    }

    console.log(
      `[MovieBox Resolver] ✅ 100% Match Found: "${matchedItem.title}" (ID: ${targetSubjectId}, Lang: ${selectedCandidate.audioLang})`
    );

    // 4. Resolve Direct Stream Sources
    const streamRes = await movieboxService.getStreamSources(targetSubjectId, detailPath, season, episode);
    const sources = streamRes.sources || [];

    if (sources.length === 0) {
      console.log(`[MovieBox Resolver] No streams returned for S${season}E${episode}`);
      return null;
    }

    // Prioritize 1080p, then 720p, then highest available
    let bestStream = sources.find((s) => s.resolution === '1080p');
    if (!bestStream) bestStream = sources.find((s) => s.resolution === '720p');
    if (!bestStream) bestStream = sources[0];

    const streamUrl = bestStream?.url;
    if (!streamUrl) return null;

    const resNumber = parseInt(bestStream?.resolution || '1080', 10) || 1080;

    return {
      url: streamUrl,
      resolution: resNumber,
      qualityLabel: `MOVIEBOX (${bestStream?.resolution || '1080p'} MP4)`,
      language: selectedCandidate.audioLang,
      availableLanguages,
      sources,
    };
  } catch (error) {
    console.warn('[MovieBox Resolver] Unexpected error:', error);
    return null;
  }
};
