import type { APIRoute } from 'astro';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { CACHE_KEYS } from '@/lib/cache-keys';
import { json } from '@/lib/http';
import { redisClearPrefix } from '@/lib/redis';
import { isRateLimited } from '@/lib/rate-limit';

export const POST: APIRoute = async (context) => {
  if (!isAdminAuthenticated(context)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const ip = context.clientAddress || context.request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(`cache-clear:${ip}`, 10_000)) {
    return json({ error: 'Please wait before clearing cache again.' }, 429);
  }

  const [games, rankingsM, rankingsW, details] = await Promise.all([
    redisClearPrefix('games:'),
    redisClearPrefix('rankings:'),
    redisClearPrefix('scrape:'),
    redisClearPrefix(CACHE_KEYS.GAME_DETAIL_PREFIX)
  ]);

  return json({
    ok: true,
    removed: games + rankingsM + rankingsW + details
  });
};
