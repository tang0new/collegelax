import type { APIRoute } from 'astro';
import { getCachedRankings, scrapeRankingsNow } from '@/api/scrape-rankings';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { json } from '@/lib/http';

export const GET: APIRoute = async (context) => {
  const refresh = context.url.searchParams.get('refresh') === '1';

  try {
    if (refresh && isAdminAuthenticated(context)) {
      const response = await scrapeRankingsNow();
      return json(response);
    }

    const cached = await getCachedRankings();

    if (!cached.mens.length && !cached.womens.length) {
      const scraped = await scrapeRankingsNow();
      return json(scraped);
    }

    return json({
      rankings: {
        mens: cached.mens,
        womens: cached.womens,
        updatedAt: cached.lastUpdated
      },
      stale: false
    });
  } catch (error) {
    return json(
      {
        error: 'Unable to load rankings',
        detail: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
};
