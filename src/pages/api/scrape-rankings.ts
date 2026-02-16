import type { APIRoute } from 'astro';
import { scrapeRankingsNow } from '@/api/scrape-rankings';
import { isAdminAuthenticated, isTrustedCron } from '@/lib/admin-auth';
import { json } from '@/lib/http';
import { isRateLimited } from '@/lib/rate-limit';

export const GET: APIRoute = async (context) => {
  const trustedCron = isTrustedCron(context);
  const admin = isAdminAuthenticated(context);

  if (!trustedCron && !admin) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const ip = context.clientAddress || context.request.headers.get('x-forwarded-for') || 'unknown';
  if (!trustedCron && isRateLimited(`scrape-rankings:${ip}`, 30_000)) {
    return json({ error: 'Rate limit exceeded. Please wait before triggering again.' }, 429);
  }

  const result = await scrapeRankingsNow();
  return json({
    ok: true,
    stale: result.stale,
    mensCount: result.rankings.mens.length,
    womensCount: result.rankings.womens.length,
    ranAt: new Date().toISOString()
  });
};

export const POST = GET;
