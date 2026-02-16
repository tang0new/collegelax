import type { APIRoute } from 'astro';
import { getGames } from '@/api/get-games';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { json } from '@/lib/http';

export const GET: APIRoute = async (context) => {
  const refresh = context.url.searchParams.get('refresh') === '1';
  const forceRefresh = refresh && isAdminAuthenticated(context);

  try {
    const payload = await getGames(forceRefresh);
    return json(payload);
  } catch (error) {
    return json(
      {
        error: 'Unable to load games',
        detail: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
};
