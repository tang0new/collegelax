import puppeteer from 'puppeteer';
import robotsParser from 'robots-parser';
import type { Game, GameDetail, StreamingPlatform } from '@/lib/types';
import {
  detectPlatform,
  extractAffiliateTarget,
  isLikelyMatchUrl,
  normalizeWhitespace,
  parseTeams,
  safeGameId,
  sleep,
  toAbsoluteUrl,
  toESTLabel
} from '@/lib/utils';

const BASE_URL = 'https://www.livesportsontv.com';
const SCHEDULE_URL = `${BASE_URL}/league/college-lacrosse`;
const USER_AGENT = 'CollegeLacrosseScheduleBot/1.0 (+https://collegelacrosseschedule.com)';
const REQUEST_DELAY_MS = 900;

let robotsCache: { fetchedAt: number; parser: ReturnType<typeof robotsParser> } | null = null;

interface RawGame {
  detailUrl: string;
  title: string;
  dateText: string;
  timeText: string;
  timeIso: string;
  platforms: string[];
}

interface RawWatchOption {
  name: string;
  url: string;
}

async function getRobotsParser() {
  const now = Date.now();
  if (robotsCache && now - robotsCache.fetchedAt < 12 * 60 * 60 * 1000) {
    return robotsCache.parser;
  }

  const robotsUrl = `${BASE_URL}/robots.txt`;
  const response = await fetch(robotsUrl, { headers: { 'user-agent': USER_AGENT } });
  const robotsTxt = await response.text();
  const parser = robotsParser(robotsUrl, robotsTxt);
  robotsCache = { fetchedAt: now, parser };
  return parser;
}

async function ensureAllowed(url: string): Promise<void> {
  const parser = await getRobotsParser();
  const allowed = parser.isAllowed(url, USER_AGENT);

  if (!allowed) {
    throw new Error(`Scraping is disallowed by robots.txt for ${url}`);
  }
}

function parseStartTime(rawDate: string, rawTime: string, iso: string): Date {
  if (iso) {
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const composed = normalizeWhitespace(`${rawDate} ${rawTime}`);
  const parsed = new Date(composed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const fallback = new Date();
  fallback.setHours(fallback.getHours() + 6);
  return fallback;
}

function normalizeRawGame(raw: RawGame): Game {
  const detailUrl = toAbsoluteUrl(raw.detailUrl, BASE_URL);
  const idFromUrl = detailUrl.split('/').pop() || raw.title;
  const id = safeGameId(idFromUrl);
  const teams = parseTeams(raw.title);
  const startDate = parseStartTime(raw.dateText, raw.timeText, raw.timeIso);

  const uniquePlatforms = Array.from(new Set(raw.platforms.filter(Boolean)));
  const platforms: StreamingPlatform[] = uniquePlatforms.map((name) => {
    const detected = detectPlatform(name);
    return {
      name: detected.name,
      slug: detected.slug,
      logo: detected.logo,
      affiliateUrl: detailUrl
    };
  });

  return {
    id,
    date: startDate.toISOString().slice(0, 10),
    timeEST: toESTLabel(startDate.toISOString()),
    startTimeISO: startDate.toISOString(),
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
    platforms,
    detailUrl,
    league: 'College Lacrosse',
    isLive: false,
    oddsAvailable: false,
    lastUpdated: new Date().toISOString()
  };
}

export async function scrapeGamesSchedule(maxPaginationClicks = 8): Promise<Game[]> {
  await ensureAllowed(SCHEDULE_URL);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1200);

    for (let i = 0; i < maxPaginationClicks; i += 1) {
      const clicked = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button')) as HTMLElement[];
        const target = links.find((el) => /show\s+previous\s+events/i.test(el.textContent || ''));
        if (!target) {
          return false;
        }
        target.click();
        return true;
      });

      if (!clicked) {
        break;
      }

      await sleep(1500);
    }

    const rawGames = await page.evaluate(() => {
      const anchorNodes = Array.from(document.querySelectorAll('a[href*="/match/"]')) as HTMLAnchorElement[];
      const seen = new Set<string>();
      const rows: RawGame[] = [];

      const climbForContainer = (node: HTMLElement | null): HTMLElement | null => {
        let current = node;
        for (let i = 0; i < 6 && current; i += 1) {
          if (
            current.matches('article, li, .event, .event-row, .event-item, [class*="event"], [class*="match"]')
          ) {
            return current;
          }
          current = current.parentElement;
        }
        return node;
      };

      for (const anchor of anchorNodes) {
        const href = anchor.getAttribute('href') || '';
        if (!href || seen.has(href)) {
          continue;
        }

        const container = climbForContainer(anchor);
        const titleText = (anchor.textContent || container?.querySelector('h2,h3,h4')?.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();

        const timeNode = container?.querySelector('time');
        const timeIso = timeNode?.getAttribute('datetime') || '';
        const dateText =
          timeNode?.getAttribute('data-date') ||
          container?.querySelector('[class*="date"]')?.textContent ||
          '';
        const timeText =
          timeNode?.textContent || container?.querySelector('[class*="time"]')?.textContent || '';

        const platformTexts = Array.from(
          container?.querySelectorAll('[class*="channel"],[class*="stream"],img[alt*="ESPN"],img[alt*="Fubo"],img[alt*="Sports"],.badge') || []
        )
          .map((node) => (node.textContent || (node as HTMLImageElement).alt || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);

        if (!titleText) {
          continue;
        }

        seen.add(href);
        rows.push({
          detailUrl: href,
          title: titleText,
          dateText: (dateText || '').replace(/\s+/g, ' ').trim(),
          timeText: (timeText || '').replace(/\s+/g, ' ').trim(),
          timeIso,
          platforms: platformTexts
        });
      }

      return rows;
    });

    const normalized = rawGames
      .filter((game) => isLikelyMatchUrl(game.detailUrl))
      .map(normalizeRawGame)
      .sort((a, b) => new Date(a.startTimeISO).getTime() - new Date(b.startTimeISO).getTime());

    return normalized;
  } finally {
    await browser.close();
  }
}

function defaultDescription(matchup: string): string {
  return `This page provides full broadcast information for ${matchup}. Here you can see the confirmed start time, TV channel listings, and live streaming options available for this event.`;
}

export async function scrapeGameDetail(detailUrl: string): Promise<GameDetail> {
  const absoluteUrl = toAbsoluteUrl(detailUrl, BASE_URL);
  await ensureAllowed(absoluteUrl);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(absoluteUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(900);

    const payload = await page.evaluate(() => {
      const h1 = (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim();
      const description =
        (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content ||
        (Array.from(document.querySelectorAll('p')).find((p) => (p.textContent || '').length > 100)?.textContent || '');

      const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const watchOptions: RawWatchOption[] = links
        .filter((link) => /watch\s*it\s*live/i.test(link.textContent || '') || /\/go\//i.test(link.href))
        .map((link) => {
          const rowText =
            (link.closest('li,article,div')?.textContent || link.textContent || '').replace(/\s+/g, ' ').trim();
          return {
            name: rowText || 'Streaming Platform',
            url: link.href
          };
        });

      return {
        matchup: h1,
        description: (description || '').replace(/\s+/g, ' ').trim(),
        watchOptions
      };
    });

    const detailId = safeGameId(absoluteUrl.split('/').pop() || payload.matchup);
    const watchOptions = payload.watchOptions.map((option) => {
      const platform = detectPlatform(option.name);
      return {
        name: platform.name,
        slug: platform.slug,
        logo: platform.logo,
        affiliateUrl: extractAffiliateTarget(option.url)
      };
    });

    const uniqueMap = new Map<string, StreamingPlatform>();
    for (const option of watchOptions) {
      uniqueMap.set(`${option.slug}:${option.affiliateUrl}`, option);
    }

    return {
      gameId: detailId,
      matchup: payload.matchup,
      description: payload.description || defaultDescription(payload.matchup),
      watchOptions: Array.from(uniqueMap.values()),
      detailUrl: absoluteUrl,
      scrapedAt: new Date().toISOString()
    };
  } finally {
    await browser.close();
    await sleep(REQUEST_DELAY_MS);
  }
}
