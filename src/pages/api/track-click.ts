import type { APIRoute } from 'astro';
import { trackAffiliateClick } from '@/api/track-click';
import { json } from '@/lib/http';
import { sanitizeExternalUrl, safeGameId } from '@/lib/utils';

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const gameId = safeGameId(String(body.gameId || ''));
    const platform = safeGameId(String(body.platform || 'other'));
    const targetUrl = sanitizeExternalUrl(String(body.targetUrl || ''));

    if (!gameId || !targetUrl) {
      return json({ error: 'Invalid payload' }, 400);
    }

    const count = await trackAffiliateClick({
      gameId,
      platform,
      targetUrl,
      timestamp: new Date().toISOString(),
      userAgent: context.request.headers.get('user-agent') || 'unknown',
      ip: context.clientAddress || context.request.headers.get('x-forwarded-for') || 'unknown'
    });

    return json({ ok: true, count });
  } catch (error) {
    return json(
      {
        error: 'Unable to track click',
        detail: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
};
