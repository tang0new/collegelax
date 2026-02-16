import cron from 'node-cron';
import { scrapeGamesNow } from '../src/api/scrape-games';
import { scrapeRankingsNow } from '../src/api/scrape-rankings';
import { CACHE_KEYS, TTL_SECONDS } from '../src/lib/cache-keys';
import { redisGet, redisSet } from '../src/lib/redis';
import type { ScrapeStatus } from '../src/lib/types';

async function updateNextRuns(gamesNextRun: string, rankingsNextRun: string) {
  const current = (await redisGet<ScrapeStatus>(CACHE_KEYS.SCRAPE_STATUS)) || {};
  await redisSet(
    CACHE_KEYS.SCRAPE_STATUS,
    {
      ...current,
      gamesNextRun,
      rankingsNextRun
    },
    TTL_SECONDS.RANKINGS
  );
}

function nextRunFromNow(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

async function runGamesJob() {
  await scrapeGamesNow();
  await updateNextRuns(nextRunFromNow(12), nextRunFromNow(24));
}

async function runRankingsJob() {
  await scrapeRankingsNow();
  await updateNextRuns(nextRunFromNow(12), nextRunFromNow(24));
}

export function startScheduler() {
  cron.schedule('0 */12 * * *', () => {
    runGamesJob().catch((error) => {
      console.error('[scheduler] games job failed', error);
    });
  });

  cron.schedule('0 0 * * *', () => {
    runRankingsJob().catch((error) => {
      console.error('[scheduler] rankings job failed', error);
    });
  });

  updateNextRuns(nextRunFromNow(12), nextRunFromNow(24)).catch(() => undefined);
  console.log('[scheduler] jobs registered');
}

if (process.argv.includes('--run')) {
  startScheduler();
}
