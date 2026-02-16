import type { APIContext } from 'astro';

const ADMIN_COOKIE = 'cls_admin';

type CookieContext = Pick<APIContext, 'cookies'>;

export function isAdminAuthenticated(context: CookieContext): boolean {
  const cookie = context.cookies.get(ADMIN_COOKIE)?.value;
  return cookie === '1';
}

export function setAdminCookie(context: APIContext): void {
  context.cookies.set(ADMIN_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 8
  });
}

export function clearAdminCookie(context: APIContext): void {
  context.cookies.delete(ADMIN_COOKIE, {
    path: '/'
  });
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || !password) {
    return false;
  }
  return timingSafeCompare(expected, password);
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

type AdminGuardContext = Pick<APIContext, 'cookies' | 'redirect'>;

export function requireAdmin(context: AdminGuardContext): Response | null {
  if (isAdminAuthenticated(context)) {
    return null;
  }

  return context.redirect('/admin/login');
}

export function isTrustedCron(context: APIContext): boolean {
  const headerSignal = context.request.headers.get('x-vercel-cron') === '1';
  const secretHeader = context.request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (headerSignal) {
    return true;
  }

  if (expectedSecret && secretHeader === `Bearer ${expectedSecret}`) {
    return true;
  }

  return false;
}
