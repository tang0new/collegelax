import type { APIRoute } from 'astro';
import { setAdminCookie, verifyAdminPassword } from '@/lib/admin-auth';
import { json } from '@/lib/http';
import { isRateLimited } from '@/lib/rate-limit';

export const POST: APIRoute = async (context) => {
  const ip = context.clientAddress || context.request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(`admin-login:${ip}`, 5_000)) {
    return json({ error: 'Too many attempts. Please wait.' }, 429);
  }

  const contentType = context.request.headers.get('content-type') || '';
  let password = '';

  if (contentType.includes('application/json')) {
    const payload = (await context.request.json().catch(() => ({}))) as { password?: string };
    password = String(payload.password || '');
  } else {
    const formData = await context.request.formData();
    password = String(formData.get('password') || '');
  }

  if (!verifyAdminPassword(password)) {
    return json({ error: 'Invalid password' }, 401);
  }

  setAdminCookie(context);
  return json({ ok: true });
};
