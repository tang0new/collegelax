import { CACHE_KEYS, TTL_SECONDS } from '@/lib/cache-keys';
import { redisGet, redisSet } from '@/lib/redis';
import { scrapeGamesSchedule } from '@/lib/scrapers/livesportsontv';
import { fetchOddsForGames } from '@/lib/scrapers/odds-api';
import type { Game, ScrapeStatus } from '@/lib/types';
import { sleep } from '@/lib/utils';

async function updateStatus(partial: Partial<ScrapeStatus>): Promise<void> {
  const current = (await redisGet<ScrapeStatus>(CACHE_KEYS.SCRAPE_STATUS)) || {};
  await redisSet(CACHE_KEYS.SCRAPE_STATUS, { ...current, ...partial }, TTL_SECONDS.RANKINGS);
}

async function scrapeWithRetry(): Promise<Game[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const games = await scrapeGamesSchedule();
      if (!games.length) {
        throw new Error('No games parsed from source');
      }
      return games;
    } catch (error) {
      lastError = error;
      await sleep(Math.pow(2, attempt) * 700);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to scrape games');
}

export async function scrapeGamesNow(): Promise<{ games: Game[]; stale: boolean }> {
  try {
    const scrapedGames = await scrapeWithRetry();
    const oddsMap = await fetchOddsForGames(scrapedGames);

    const enrichedGames = scrapedGames.map((game) => {
      const odds = oddsMap[game.id];
      return {
        ...game,
        odds,
        oddsAvailable: Boolean(odds),
        isLive: Date.now() - new Date(game.startTimeISO).getTime() < 2 * 60 * 60 * 1000 && Date.now() >= new Date(game.startTimeISO).getTime(),
        lastUpdated: new Date().toISOString()
      };
    });

    const updatedAt = new Date().toISOString();
    await redisSet(CACHE_KEYS.GAMES, enrichedGames, TTL_SECONDS.GAMES);
    await redisSet(CACHE_KEYS.GAMES_LAST_UPDATED, updatedAt, TTL_SECONDS.GAMES);

    await updateStatus({
      gamesLastRun: updatedAt,
      gamesLastError: undefined
    });

    return { games: enrichedGames, stale: false };
  } catch (error) {
    const cached = (await redisGet<Game[]>(CACHE_KEYS.GAMES)) || [];
    await updateStatus({
      gamesLastError: error instanceof Error ? error.message : 'Unknown games scrape error'
    });

    return { games: cached, stale: true };
  }
}

export async function getCachedGames(): Promise<{ games: Game[]; lastUpdated: string | null }> {
  const [games, lastUpdated] = await Promise.all([
    redisGet<Game[]>(CACHE_KEYS.GAMES),
    redisGet<string>(CACHE_KEYS.GAMES_LAST_UPDATED)
  ]);

  return {
    games: games || [],
    lastUpdated: lastUpdated || null
  };
}

export async function getScrapeStatus(): Promise<ScrapeStatus> {
  return (await redisGet<ScrapeStatus>(CACHE_KEYS.SCRAPE_STATUS)) || {};
}
