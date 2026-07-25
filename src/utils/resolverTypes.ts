export interface SearchArticleCard {
  id: string;
  title: string;
  permalink: string;
  posterUrl?: string;
  siteKey: 'vegamovies' | 'rogmovies' | 'moviesmod' | 'bollyflix' | 'fzmovies' | 'moviebox';
  siteDisplayName: string;
  confidenceScore: number;
}

export interface ScrapedQualityOption {
  id: string;
  siteKey: 'vegamovies' | 'rogmovies' | 'moviesmod' | 'bollyflix' | 'fzmovies' | 'moviebox';
  siteDisplayName: string;
  qualityLabel: '480p' | '720p' | '1080p' | '4K';
  ripFormat: string;       // e.g. "WEBRip", "WEB-DL", "BluRay IMAX"
  codec: string;           // e.g. "H.264", "HEVC 10Bit", "x265"
  fileSize: string;        // e.g. "1.5 GB" or "250MB/E"
  audioTracks: string;     // e.g. "Hindi DD5.1 + English"
  contentType: 'MOVIE' | 'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP';
  episodeName?: string;    // e.g. "Episode 01"
  seasonNumber: number;    // e.g. 1, 2, 3
  targetUrl: string;       // Pass 2 locker URL
  priorityScore: number;   // 1 for VegaMovies, 2 for MoviesMod, 3 for Bollyflix
}

export interface ResolvedStreamResult {
  success: boolean;
  streamUrl?: string;
  providerName: string;
  qualityLabel: string;
  message?: string;
}
