import { CACHE_KEYS, TTL_SECONDS } from '@/lib/cache-keys';
import { redisGet, redisIncr, redisSet } from '@/lib/redis';
import type { ClickEvent } from '@/lib/types';

export async function trackAffiliateClick(event: ClickEvent): Promise<number> {
  const key = `${CACHE_KEYS.CLICK_PREFIX}${event.platform}:${event.gameId}`;
  const count = await redisIncr(key);

  const recent = (await redisGet<ClickEvent[]>(CACHE_KEYS.CLICK_RECENT)) || [];
  const nextRecent = [event, ...recent].slice(0, 50);
  await redisSet(CACHE_KEYS.CLICK_RECENT, nextRecent, TTL_SECONDS.CLICK_RECENT);

  return count;
}

export async function getRecentClicks(): Promise<ClickEvent[]> {
  return (await redisGet<ClickEvent[]>(CACHE_KEYS.CLICK_RECENT)) || [];
}
