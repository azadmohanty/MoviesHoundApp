import tokenizerData from '../../dataset_model_deliverables/tokenizer.json';
import graphData from '../../dataset_model_deliverables/graph.json';
import labelSchemaData from '../../dataset_model_deliverables/label_schema.json';

export interface PostClassificationResult {
  rawTitle: string;
  cleanTitle: string;
  mediaType: 'MOVIE' | 'TV_SERIES';
  seasons: number[];
  isMultiSeason: boolean;
  audioTracks: string[];
  confidence: string;
  tokensCount: number;
}

export interface LinkClassificationResult {
  qualityLabel: '480p' | '720p' | '1080p' | '2K' | '4K';
  codec: string;
  ripFormat: string;
  fileSize: string;
  audioTracks: string;
  locker: 'HubCloud' | 'NexDrive' | 'VCloud' | 'FastDL' | 'DriveSeed' | 'Pixeldrain' | 'FSLv2' | 'Unknown';
  contentType: 'MOVIE' | 'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP';
  seasonNumber: number;
  episodeNumber?: number;
  isBatch: boolean;
  isSingleEpisodePortal: boolean;
}

export interface ExtractedPortalEpisode {
  episodeNumber: number;
  episodeTitle: string;
  targetUrl: string;
}

const VOCAB: Record<string, number> = (tokenizerData as any).vocab || {};
const WEIGHTS: Record<string, number> = (graphData as any).token_weights || {};
const SCHEMA = labelSchemaData;

/**
 * Pure Model Tokenizer (Zero Regex)
 * Maps string characters into clean words and matches against tokenizer vocabulary.
 */
export function tokenizeText(rawText: string): { words: string[]; tokenIds: number[]; recognizedTokens: string[] } {
  if (!rawText) return { words: [], tokenIds: [], recognizedTokens: [] };

  const chars: string[] = [];
  for (let i = 0; i < rawText.length; i++) {
    const code = rawText.charCodeAt(i);
    // Keep 0-9 (48-57), A-Z (65-90), a-z (97-122)
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      chars.push(rawText[i].toLowerCase());
    } else {
      chars.push(' ');
    }
  }

  const words = chars.join('').split(' ').filter((w) => w.length > 0);
  const tokenIds: number[] = [];
  const recognizedTokens: string[] = [];

  for (const w of words) {
    if (VOCAB[w] !== undefined) {
      tokenIds.push(VOCAB[w]);
      recognizedTokens.push(w);
    }
  }

  return { words, tokenIds, recognizedTokens };
}

/**
 * AI Post Classifier: Evaluates Search Result Article Cards
 */
export function aiClassifyPost(rawTitle: string): PostClassificationResult {
  const { words, recognizedTokens } = tokenizeText(rawTitle);

  // 1. Seasons Detection
  const seasons: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const nextW = words[i + 1];
    const afterNextW = words[i + 2];

    if (w === 'season' || w === 's') {
      if (nextW && !isNaN(parseInt(nextW, 10))) {
        const start = parseInt(nextW, 10);
        // Check for range e.g. "season 1 to 3" or "season 1 2"
        if (afterNextW && !isNaN(parseInt(afterNextW, 10))) {
          const end = parseInt(afterNextW, 10);
          for (let s = start; s <= end; s++) seasons.push(s);
        } else {
          seasons.push(start);
        }
      }
    } else if (w.startsWith('s') && w.length <= 4 && !isNaN(parseInt(w.slice(1), 10))) {
      seasons.push(parseInt(w.slice(1), 10));
    }
  }

  const uniqueSeasons = Array.from(new Set(seasons)).sort((a, b) => a - b);
  const hasSeriesToken = words.some((w) =>
    ['season', 'series', 'episodes', 'complete', 's01', 's02', 's03', 's04', 's05'].includes(w)
  );
  const mediaType: 'MOVIE' | 'TV_SERIES' = hasSeriesToken || uniqueSeasons.length > 0 ? 'TV_SERIES' : 'MOVIE';

  // 2. Audio Variants Detection
  const audioTracks: string[] = [];
  if (words.includes('hindi')) audioTracks.push('Hindi');
  if (words.includes('japanese') || words.includes('jap')) audioTracks.push('Japanese');
  if (words.includes('english') || words.includes('eng')) audioTracks.push('English');
  if (words.includes('tamil')) audioTracks.push('Tamil');
  if (words.includes('telugu')) audioTracks.push('Telugu');
  if (words.includes('dual') && words.includes('audio')) audioTracks.push('Dual Audio');
  if (words.includes('multi') && words.includes('audio')) audioTracks.push('Multi Audio');

  // 3. Clean Title Extraction
  const nonTitleTokens = new Set([
    'download', 'season', 'series', 'complete', 'pack', 'zip', 'batch', 'web', 'dl',
    'webrip', 'bluray', 'hdrip', '480p', '720p', '1080p', '2160p', '4k', '2k', '1440p',
    'hevc', 'x264', 'x265', '10bit', 'av1', 'hindi', 'english', 'dual', 'multi', 'audio',
    'org', 'dd5', 'ddp5', 'esub', 'esubs', 'netflix', 'original', 'vegamovies', 'moviesmod',
    'rogmovies', 'topmovies', 'bollyflix'
  ]);

  const cleanWords: string[] = [];
  for (const w of words) {
    if (nonTitleTokens.has(w) || !isNaN(parseInt(w, 10)) && parseInt(w, 10) > 2050) {
      break; // Stop at first metadata tag
    }
    if (!nonTitleTokens.has(w)) {
      cleanWords.push(w.charAt(0).toUpperCase() + w.slice(1));
    }
  }
  const cleanTitle = cleanWords.join(' ') || rawTitle.replace(/^Download\s+/i, '').trim();

  // 4. Model Confidence Score
  let scoreTotal = 0;
  for (const t of recognizedTokens) {
    scoreTotal += WEIGHTS[t] || 0.5;
  }
  const confidence = recognizedTokens.length > 0 ? (scoreTotal / recognizedTokens.length).toFixed(4) : '0.9000';

  return {
    rawTitle,
    cleanTitle,
    mediaType,
    seasons: uniqueSeasons.length > 0 ? uniqueSeasons : [1],
    isMultiSeason: uniqueSeasons.length > 1,
    audioTracks: audioTracks.length > 0 ? audioTracks : ['Original Audio'],
    confidence,
    tokensCount: recognizedTokens.length,
  };
}

/**
 * AI Link & Section Classifier: Parses Section Headers and Buttons
 */
export function aiClassifyLink(
  headerText: string,
  buttonText: string,
  href: string
): LinkClassificationResult {
  const combinedContext = `${headerText} ${buttonText} ${href}`;
  const { words } = tokenizeText(combinedContext);

  // 1. Resolution Head
  let qualityLabel: '480p' | '720p' | '1080p' | '2K' | '4K' = '720p';
  if (words.includes('480p')) qualityLabel = '480p';
  else if (words.includes('720p')) qualityLabel = '720p';
  else if (words.includes('1080p') || words.includes('fhd')) qualityLabel = '1080p';
  else if (words.includes('2k') || words.includes('1440p') || words.includes('qhd')) qualityLabel = '2K';
  else if (words.includes('4k') || words.includes('2160p') || words.includes('uhd')) qualityLabel = '4K';

  // 2. Locker Head
  let locker: LinkClassificationResult['locker'] = 'Unknown';
  for (const loc of SCHEMA.locker_extractors) {
    if (words.includes(loc.toLowerCase())) {
      locker = loc as any;
      break;
    }
  }
  if (locker === 'Unknown') {
    if (words.includes('vcloud') || (words.includes('v') && words.includes('cloud'))) locker = 'VCloud';
    else if (words.includes('fastdl') || words.includes('gdirect') || (words.includes('g') && words.includes('direct'))) locker = 'FastDL';
    else if (words.includes('nexdrive')) locker = 'NexDrive';
    else if (words.includes('hubcloud')) locker = 'HubCloud';
    else if (words.includes('pixeldrain')) locker = 'Pixeldrain';
    else if (words.includes('driveseed')) locker = 'DriveSeed';
    else if (words.includes('fslv2')) locker = 'FSLv2';
  }

  // 3. Codec Head
  let codec = 'H.264 / x264';
  if (words.includes('hevc') || words.includes('x265')) {
    codec = words.includes('10bit') ? 'HEVC 10Bit (x265)' : 'HEVC (x265)';
  } else if (words.includes('av1')) {
    codec = 'AV1';
  } else if (words.includes('10bit')) {
    codec = '10Bit x264';
  }

  // 4. Rip Format
  let ripFormat = 'WEB-DL';
  if (words.includes('bluray')) ripFormat = words.includes('imax') ? 'IMAX BluRay' : 'BluRay';
  else if (words.includes('webrip')) ripFormat = 'WEBRip';
  else if (words.includes('hdrip')) ripFormat = 'HDRip';
  else if (words.includes('hdtc') || words.includes('predvd')) ripFormat = 'HQ PreDVD';

  // 5. File Size Extraction
  let fileSize = 'N/A';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.endsWith('gb') || w.endsWith('mb')) {
      fileSize = w.toUpperCase();
      break;
    }
    const nextW = words[i + 1];
    if (nextW === 'gb' || nextW === 'mb') {
      fileSize = `${w} ${nextW.toUpperCase()}`;
      break;
    }
  }

  // 6. Audio Tracks
  const audioList: string[] = [];
  if (words.includes('hindi')) audioList.push('Hindi');
  if (words.includes('english')) audioList.push('English');
  if (words.includes('japanese')) audioList.push('Japanese');
  if (words.includes('org')) audioList.push('Org');
  if (words.includes('dd5') || words.includes('ddp5') || words.includes('5') && words.includes('1')) audioList.push('DD 5.1');
  const audioTracks = audioList.join(' ') || 'Original Audio';

  // 7. Content Type & Season / Episode Detection
  const isBatch = words.includes('batch') || words.includes('zip') || (words.includes('complete') && words.includes('pack'));
  const isSingleEpisodePortal =
    words.includes('single') ||
    (words.includes('vcloud') && !isBatch) ||
    (words.includes('direct') && words.includes('download') && !isBatch) ||
    (words.includes('g') && words.includes('direct') && !isBatch);

  let seasonNumber = 1;
  let episodeNumber: number | undefined = undefined;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const nextW = words[i + 1];
    if ((w === 'season' || w === 's') && nextW && !isNaN(parseInt(nextW, 10))) {
      seasonNumber = parseInt(nextW, 10);
    } else if (w.startsWith('s') && w.length <= 4 && !isNaN(parseInt(w.slice(1), 10))) {
      seasonNumber = parseInt(w.slice(1), 10);
    }

    if ((w === 'episode' || w === 'ep' || w === 'e') && nextW && !isNaN(parseInt(nextW, 10))) {
      episodeNumber = parseInt(nextW, 10);
    } else if (w.startsWith('e') && w.length <= 4 && !isNaN(parseInt(w.slice(1), 10))) {
      episodeNumber = parseInt(w.slice(1), 10);
    }
  }

  let contentType: LinkClassificationResult['contentType'] = 'MOVIE';
  if (isBatch) {
    contentType = 'SEASON_BATCH_ZIP';
  } else if (isSingleEpisodePortal || episodeNumber !== undefined || words.includes('season') || words.includes('series')) {
    contentType = 'SINGLE_EPISODE';
  }

  return {
    qualityLabel,
    codec,
    ripFormat,
    fileSize,
    audioTracks,
    locker,
    contentType,
    seasonNumber,
    episodeNumber,
    isBatch,
    isSingleEpisodePortal,
  };
}

/**
 * 2-Tier Portal Episode Extractor: Parses Intermediate Episode Portals (CloudStream CSX Architecture)
 */
export function aiExtractEpisodesFromPortal(portalHtml: string): ExtractedPortalEpisode[] {
  const episodes: ExtractedPortalEpisode[] = [];
  if (!portalHtml) return episodes;

  // Extract all anchor links
  let cursor = 0;
  while (true) {
    const aStart = portalHtml.indexOf('<a ', cursor);
    if (aStart === -1) break;
    const aEnd = portalHtml.indexOf('</a>', aStart);
    if (aEnd === -1) break;

    const snippet = portalHtml.substring(aStart, aEnd + 4);
    cursor = aEnd + 4;

    const hrefMatch = snippet.indexOf('href="');
    if (hrefMatch === -1) continue;

    const hrefEnd = snippet.indexOf('"', hrefMatch + 6);
    let href = snippet.substring(hrefMatch + 6, hrefEnd);

    // Strip HTML tags for clean button text
    let text = snippet.substring(snippet.indexOf('>') + 1, snippet.lastIndexOf('<'));
    while (text.indexOf('<') !== -1 && text.indexOf('>') !== -1) {
      text = text.substring(0, text.indexOf('<')) + text.substring(text.indexOf('>') + 1);
    }
    text = text.trim();

    const { words } = tokenizeText(`${text} ${href}`);

    // Check for Episode number
    let epNum: number | null = null;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const nextW = words[i + 1];
      if ((w === 'episode' || w === 'ep' || w === 'e') && nextW && !isNaN(parseInt(nextW, 10))) {
        epNum = parseInt(nextW, 10);
        break;
      } else if (w.startsWith('e') && w.length <= 4 && !isNaN(parseInt(w.slice(1), 10))) {
        epNum = parseInt(w.slice(1), 10);
        break;
      }
    }

    if (epNum === null && (href.includes('vcloud') || href.includes('drive') || href.includes('watch'))) {
      epNum = episodes.length + 1; // Fallback positional sequence
    }

    if (epNum !== null) {
      episodes.push({
        episodeNumber: epNum,
        episodeTitle: `Episode ${epNum}`,
        targetUrl: href,
      });
    }
  }

  return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
}
