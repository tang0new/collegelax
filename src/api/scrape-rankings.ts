import { CACHE_KEYS, TTL_SECONDS } from '@/lib/cache-keys';
import { redisGet, redisSet } from '@/lib/redis';
import { scrapeNcaaRankings } from '@/lib/scrapers/ncaa-rankings';
import type { RankingEntry, RankingsPayload, ScrapeStatus } from '@/lib/types';
import { sleep } from '@/lib/utils';

async function updateStatus(partial: Partial<ScrapeStatus>): Promise<void> {
  const current = (await redisGet<ScrapeStatus>(CACHE_KEYS.SCRAPE_STATUS)) || {};
  await redisSet(CACHE_KEYS.SCRAPE_STATUS, { ...current, ...partial }, TTL_SECONDS.RANKINGS);
}

async function scrapeWithRetry(): Promise<RankingsPayload> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await scrapeNcaaRankings();
    } catch (error) {
      lastError = error;
      await sleep(Math.pow(2, attempt) * 700);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to scrape rankings');
}

export async function scrapeRankingsNow(): Promise<{ rankings: RankingsPayload; stale: boolean }> {
  try {
    const rankings = await scrapeWithRetry();

    await Promise.all([
      redisSet(CACHE_KEYS.RANKINGS_MENS, rankings.mens, TTL_SECONDS.RANKINGS),
      redisSet(CACHE_KEYS.RANKINGS_WOMENS, rankings.womens, TTL_SECONDS.RANKINGS),
      redisSet(CACHE_KEYS.RANKINGS_LAST_UPDATED, rankings.updatedAt, TTL_SECONDS.RANKINGS)
    ]);

    await updateStatus({
      rankingsLastRun: rankings.updatedAt,
      rankingsLastError: undefined
    });

    return {
      rankings,
      stale: false
    };
  } catch (error) {
    const fallback = await getCachedRankings();

    await updateStatus({
      rankingsLastError: error instanceof Error ? error.message : 'Unknown rankings scrape error'
    });

    return {
      rankings: {
        mens: fallback.mens,
        womens: fallback.womens,
        updatedAt: fallback.lastUpdated || new Date().toISOString()
      },
      stale: true
    };
  }
}

export async function getCachedRankings(): Promise<{
  mens: RankingEntry[];
  womens: RankingEntry[];
  lastUpdated: string | null;
}> {
  const [mens, womens, lastUpdated] = await Promise.all([
    redisGet<RankingEntry[]>(CACHE_KEYS.RANKINGS_MENS),
    redisGet<RankingEntry[]>(CACHE_KEYS.RANKINGS_WOMENS),
    redisGet<string>(CACHE_KEYS.RANKINGS_LAST_UPDATED)
  ]);

  return {
    mens: mens || [],
    womens: womens || [],
    lastUpdated: lastUpdated || null
  };
}
