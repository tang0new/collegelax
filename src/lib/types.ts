export type PlatformSlug =
  | 'fubo'
  | 'espn-plus'
  | 'espn-select'
  | 'espn-unlimited'
  | 'paramount-plus'
  | 'nbc-sports'
  | 'fox-sports'
  | 'youtube-tv'
  | 'hulu-live'
  | 'other';

export interface StreamingPlatform {
  name: string;
  slug: PlatformSlug;
  logo: string;
  affiliateUrl: string;
}

export interface GameOdds {
  provider: string;
  moneyline?: string;
  spread?: string;
  overUnder?: string;
  updatedAt: string;
}

export interface Game {
  id: string;
  date: string;
  timeEST: string;
  startTimeISO: string;
  homeTeam: string;
  awayTeam: string;
  platforms: StreamingPlatform[];
  detailUrl: string;
  league: 'College Lacrosse';
  isLive: boolean;
  oddsAvailable: boolean;
  odds?: GameOdds;
  lastUpdated: string;
}

export interface GameDetail {
  gameId: string;
  matchup: string;
  description: string;
  watchOptions: StreamingPlatform[];
  detailUrl: string;
  scrapedAt: string;
}

export interface RankingEntry {
  rank: number;
  team: string;
  record: string;
  pointsVotes: string;
  change: string;
}

export interface RankingsPayload {
  mens: RankingEntry[];
  womens: RankingEntry[];
  updatedAt: string;
}

export interface ScrapeStatus {
  gamesLastRun?: string;
  rankingsLastRun?: string;
  gamesNextRun?: string;
  rankingsNextRun?: string;
  gamesLastError?: string;
  rankingsLastError?: string;
}

export interface ClickEvent {
  gameId: string;
  platform: string;
  targetUrl: string;
  timestamp: string;
  userAgent: string;
  ip: string;
}
