import type { APIRoute } from 'astro';
import { getGameDetail } from '@/api/get-game-detail';
import { json } from '@/lib/http';
import { toAbsoluteUrl } from '@/lib/utils';

const LSTV_BASE = 'https://www.livesportsontv.com';

export const GET: APIRoute = async ({ url }) => {
  const detailUrl = url.searchParams.get('detailUrl');
  if (!detailUrl) {
    return json({ error: 'detailUrl is required' }, 400);
  }

  const absolute = toAbsoluteUrl(detailUrl, LSTV_BASE);
  if (!absolute.startsWith(LSTV_BASE)) {
    return json({ error: 'Invalid detail URL domain' }, 400);
  }

  try {
    const detail = await getGameDetail(absolute);
    return json({ detail });
  } catch (error) {
    return json(
      {
        error: 'Unable to fetch game detail',
        detail: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
};
