import { getCachedGames, scrapeGamesNow } from '@/api/scrape-games';
import type { Game } from '@/lib/types';

export async function getGames(forceRefresh = false): Promise<{
  games: Game[];
  lastUpdated: string | null;
  stale: boolean;
}> {
  if (forceRefresh) {
    const scraped = await scrapeGamesNow();
    return {
      games: scraped.games,
      lastUpdated: new Date().toISOString(),
      stale: scraped.stale
    };
  }

  const cached = await getCachedGames();
  if (cached.games.length) {
    return {
      games: cached.games,
      lastUpdated: cached.lastUpdated,
      stale: false
    };
  }

  const scraped = await scrapeGamesNow();
  return {
    games: scraped.games,
    lastUpdated: new Date().toISOString(),
    stale: scraped.stale
  };
}
