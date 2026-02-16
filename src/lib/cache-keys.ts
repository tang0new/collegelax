export const CACHE_KEYS = {
  GAMES: 'games:schedule',
  GAMES_LAST_UPDATED: 'games:lastUpdated',
  RANKINGS_MENS: 'rankings:mens',
  RANKINGS_WOMENS: 'rankings:womens',
  RANKINGS_LAST_UPDATED: 'rankings:lastUpdated',
  SCRAPE_STATUS: 'scrape:status',
  GAME_DETAIL_PREFIX: 'games:detail:',
  CLICK_PREFIX: 'clicks:',
  CLICK_RECENT: 'clicks:recent'
} as const;

export const TTL_SECONDS = {
  GAMES: 24 * 60 * 60,
  GAME_DETAIL: 12 * 60 * 60,
  RANKINGS: 48 * 60 * 60,
  CLICK_RECENT: 7 * 24 * 60 * 60
} as const;
