import type { APIRoute } from 'astro';
import { clearAdminCookie } from '@/lib/admin-auth';
import { json } from '@/lib/http';

export const POST: APIRoute = async (context) => {
  clearAdminCookie(context);
  return json({ ok: true });
};
