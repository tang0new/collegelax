import { CACHE_KEYS, TTL_SECONDS } from '@/lib/cache-keys';
import { redisGet, redisSet } from '@/lib/redis';
import { scrapeGameDetail } from '@/lib/scrapers/livesportsontv';
import type { GameDetail } from '@/lib/types';
import { safeGameId } from '@/lib/utils';

export async function getGameDetail(detailUrl: string): Promise<GameDetail> {
  const keyId = safeGameId(detailUrl.split('/').pop() || detailUrl);
  const key = `${CACHE_KEYS.GAME_DETAIL_PREFIX}${keyId}`;
  const cached = await redisGet<GameDetail>(key);
  if (cached) {
    return cached;
  }

  const detail = await scrapeGameDetail(detailUrl);
  await redisSet(key, detail, TTL_SECONDS.GAME_DETAIL);
  return detail;
}

export async function cacheGameDetailById(gameId: string): Promise<GameDetail | null> {
  const key = `${CACHE_KEYS.GAME_DETAIL_PREFIX}${safeGameId(gameId)}`;
  return redisGet<GameDetail>(key);
}
