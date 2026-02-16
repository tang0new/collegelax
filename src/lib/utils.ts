import type { PlatformSlug } from '@/lib/types';

const platformMatchers: Array<{ pattern: RegExp; slug: PlatformSlug; logo: string; displayName: string }> = [
  { pattern: /fubo/i, slug: 'fubo', logo: '/platform-logos/fubo.svg', displayName: 'Fubo Sports' },
  { pattern: /espn\+?/i, slug: 'espn-plus', logo: '/platform-logos/espn.svg', displayName: 'ESPN+' },
  { pattern: /espn\s*select/i, slug: 'espn-select', logo: '/platform-logos/espn.svg', displayName: 'ESPN Select' },
  { pattern: /espn\s*unlimited/i, slug: 'espn-unlimited', logo: '/platform-logos/espn.svg', displayName: 'ESPN Unlimited' },
  { pattern: /paramount/i, slug: 'paramount-plus', logo: '/platform-logos/paramount.svg', displayName: 'Paramount+' },
  { pattern: /nbc/i, slug: 'nbc-sports', logo: '/platform-logos/nbc.svg', displayName: 'NBC Sports' },
  { pattern: /fox/i, slug: 'fox-sports', logo: '/platform-logos/fox.svg', displayName: 'Fox Sports' },
  { pattern: /youtube\s*tv/i, slug: 'youtube-tv', logo: '/platform-logos/youtube-tv.svg', displayName: 'YouTube TV' },
  { pattern: /hulu/i, slug: 'hulu-live', logo: '/platform-logos/hulu.svg', displayName: 'Hulu + Live TV' }
];

const SENSITIVE_QUERY_KEYS = ['url', 'redirect', 'target', 'dest', 'destination', 'u', 'to', 'r', 'ref'];

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function detectPlatform(rawName: string): { slug: PlatformSlug; logo: string; name: string } {
  const normalized = normalizeWhitespace(rawName || '');

  for (const matcher of platformMatchers) {
    if (matcher.pattern.test(normalized)) {
      return {
        slug: matcher.slug,
        logo: matcher.logo,
        name: matcher.displayName
      };
    }
  }

  return {
    slug: 'other',
    logo: '/platform-logos/default.svg',
    name: normalized || 'Streaming Platform'
  };
}

export function safeGameId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function parseTeams(matchup: string): { homeTeam: string; awayTeam: string } {
  const normalized = normalizeWhitespace(matchup);
  const separators = [' - ', ' vs ', ' vs. ', ' @ ', ' at '];

  for (const separator of separators) {
    if (normalized.toLowerCase().includes(separator.trim().toLowerCase())) {
      const [left, right] = normalized.split(new RegExp(separator, 'i')).map((item) => normalizeWhitespace(item));
      if (left && right) {
        return { awayTeam: left, homeTeam: right };
      }
    }
  }

  return { awayTeam: 'TBD', homeTeam: normalized || 'TBD' };
}

export function toESTLabel(isoTime: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(isoTime));
  } catch {
    return 'TBD';
  }
}

export function formatDayMonth(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.toLocaleDateString('en-US', { day: '2-digit', timeZone: 'America/New_York' });
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/New_York' }).toUpperCase();
  return `${day} ${month}`;
}

export function formatUserLocalDateTime(isoTime: string, timeZone?: string): string {
  const date = new Date(isoTime);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function gameCountdown(isoTime: string): string {
  const now = Date.now();
  const eventTime = new Date(isoTime).getTime();
  const diffMs = eventTime - now;

  if (diffMs <= 0 && diffMs > -2 * 60 * 60 * 1000) {
    return 'LIVE NOW';
  }

  if (diffMs <= 0) {
    return 'Final / Completed';
  }

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `Starts in ${minutes}m`;
  }
  return `Starts in ${hours}h ${minutes}m`;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`Request failed (${response.status})`);
    } catch (error) {
      lastError = error;
    }

    const backoffMs = Math.pow(2, i) * 500;
    await sleep(backoffMs);
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

export function extractAffiliateTarget(url: string): string {
  try {
    const parsed = new URL(url);

    for (const key of SENSITIVE_QUERY_KEYS) {
      const value = parsed.searchParams.get(key);
      if (value && /^https?:\/\//i.test(value)) {
        return value;
      }
    }

    return url;
  } catch {
    return url;
  }
}

export function isLikelyMatchUrl(url: string): boolean {
  return /\/match\//i.test(url);
}

export function toAbsoluteUrl(input: string, base: string): string {
  if (!input) {
    return base;
  }
  try {
    return new URL(input, base).toString();
  } catch {
    return base;
  }
}

export function toAffiliateWatchPath(platform: string, gameId: string, target: string): string {
  const safePlatform = safeGameId(platform || 'other');
  const safeId = safeGameId(gameId);
  const to = encodeURIComponent(target);
  return `/watch/${safePlatform}/${safeId}?to=${to}`;
}

export function sanitizeExternalUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}
