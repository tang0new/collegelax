import type { APIRoute } from 'astro';
import { getRecentClicks } from '@/api/track-click';
import { getScrapeStatus } from '@/api/scrape-games';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { CACHE_KEYS } from '@/lib/cache-keys';
import { json } from '@/lib/http';
import { redisKeys, redisStatus } from '@/lib/redis';

export const GET: APIRoute = async (context) => {
  if (!isAdminAuthenticated(context)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const [status, redisInfo, clickEvents, clickKeys] = await Promise.all([
    getScrapeStatus(),
    redisStatus(),
    getRecentClicks(),
    redisKeys(`${CACHE_KEYS.CLICK_PREFIX}*`)
  ]);

  return json({
    status,
    redis: {
      ...redisInfo,
      clickKeyCount: clickKeys.length
    },
    clicks: clickEvents
  });
};
