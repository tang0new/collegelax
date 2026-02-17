import robotsParser from 'robots-parser';
import type { Game, GameDetail, StreamingPlatform } from '@/lib/types';
import {
  detectPlatform,
  extractAffiliateTarget,
  fetchWithRetry,
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
const NEXT_FLIGHT_PATTERN = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;

let robotsCache: { fetchedAt: number; parser: ReturnType<typeof robotsParser> } | null = null;

interface SourceChannel {
  id?: number;
  name?: string;
  shortname?: string;
  url?: string | null;
}

interface SourceDeepLink {
  channel_id?: number;
  deep_link?: string;
}

interface SourceFixture {
  fixture_id: number;
  fixture_slug?: string;
  title?: string;
  date?: string;
  home_team?: string;
  visiting_team?: string;
  channels?: SourceChannel[];
  deep_links?: SourceDeepLink[];
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

function parseStartTime(rawIso: string | undefined): Date {
  if (rawIso) {
    const parsed = new Date(rawIso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const fallback = new Date();
  fallback.setHours(fallback.getHours() + 6);
  return fallback;
}

function extractFixtureIdFromUrl(detailUrl: string): number | null {
  const normalized = detailUrl.split('?')[0].replace(/\/+$/, '');
  const match = normalized.match(/-(\d+)$/) || normalized.match(/\/(\d+)$/);
  if (!match) {
    return null;
  }

  const fixtureId = Number.parseInt(match[1], 10);
  return Number.isFinite(fixtureId) ? fixtureId : null;
}

function getMatchPath(fixture: SourceFixture): string {
  const safeSlug = fixture.fixture_slug || safeGameId(fixture.title || `match-${fixture.fixture_id}`);
  return `/match/${safeSlug}-${fixture.fixture_id}`;
}

function buildMatchup(fixture: SourceFixture): string {
  if (fixture.title) {
    return normalizeWhitespace(fixture.title);
  }

  const away = normalizeWhitespace(fixture.visiting_team || 'TBD');
  const home = normalizeWhitespace(fixture.home_team || 'TBD');
  return `${away} - ${home}`;
}

function buildWatchOptions(fixture: SourceFixture, detailUrl: string): StreamingPlatform[] {
  const channels = fixture.channels || [];
  const deepLinks = fixture.deep_links || [];
  const deepLinkByChannelId = new Map<number, string>();

  for (const deepLink of deepLinks) {
    if (deepLink.channel_id && deepLink.deep_link) {
      deepLinkByChannelId.set(deepLink.channel_id, deepLink.deep_link);
    }
  }

  const output: StreamingPlatform[] = [];
  for (const channel of channels) {
    const rawName = normalizeWhitespace(channel.name || channel.shortname || '');
    if (!rawName) {
      continue;
    }

    const affiliateCandidate =
      (channel.id ? deepLinkByChannelId.get(channel.id) : undefined) || channel.url || detailUrl;
    const affiliateUrl = extractAffiliateTarget(toAbsoluteUrl(affiliateCandidate, BASE_URL));

    const detected = detectPlatform(rawName);
    output.push({
      name: detected.slug === 'other' ? rawName : detected.name,
      slug: detected.slug,
      logo: detected.logo,
      affiliateUrl
    });
  }

  const deduped = new Map<string, StreamingPlatform>();
  for (const option of output) {
    deduped.set(`${option.slug}:${option.affiliateUrl}`, option);
  }

  return Array.from(deduped.values());
}

function normalizeFixture(fixture: SourceFixture): Game {
  const detailUrl = toAbsoluteUrl(getMatchPath(fixture), BASE_URL);
  const gameId = safeGameId(detailUrl.split('/').pop() || `game-${fixture.fixture_id}`);
  const matchup = buildMatchup(fixture);
  const parsedTeams = parseTeams(matchup);
  const startDate = parseStartTime(fixture.date);

  return {
    id: gameId,
    date: startDate.toISOString().slice(0, 10),
    timeEST: toESTLabel(startDate.toISOString()),
    startTimeISO: startDate.toISOString(),
    homeTeam: normalizeWhitespace(fixture.home_team || parsedTeams.homeTeam || 'TBD'),
    awayTeam: normalizeWhitespace(fixture.visiting_team || parsedTeams.awayTeam || 'TBD'),
    platforms: buildWatchOptions(fixture, detailUrl),
    detailUrl,
    league: 'College Lacrosse',
    isLive: false,
    oddsAvailable: false,
    lastUpdated: new Date().toISOString()
  };
}

function extractNextFlightPayloads(html: string): string[] {
  const payloads: string[] = [];

  for (const match of html.matchAll(NEXT_FLIGHT_PATTERN)) {
    const raw = match[1];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && typeof parsed[1] === 'string') {
        payloads.push(parsed[1]);
      }
    } catch {
      continue;
    }
  }

  return payloads;
}

function extractFixturesFromPayload(payload: string): SourceFixture[] {
  const startMarker = '"fixtures":[';
  const endMarker = '],"standingsData"';

  const start = payload.indexOf(startMarker);
  if (start === -1) {
    return [];
  }

  const end = payload.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    return [];
  }

  const fixturesJson = `[${payload.slice(start + startMarker.length, end)}]`;

  try {
    const fixtures = JSON.parse(fixturesJson);
    if (Array.isArray(fixtures)) {
      return fixtures.filter((item): item is SourceFixture => Boolean(item && item.fixture_id));
    }
  } catch {
    return [];
  }

  return [];
}

function extractFixturesFromHtml(html: string): SourceFixture[] {
  const payloads = extractNextFlightPayloads(html);
  let bestFixtures: SourceFixture[] = [];

  for (const payload of payloads) {
    const fixtures = extractFixturesFromPayload(payload);
    if (fixtures.length > bestFixtures.length) {
      bestFixtures = fixtures;
    }
  }

  if (!bestFixtures.length) {
    throw new Error('Unable to parse fixtures from livesportsontv payload');
  }

  return bestFixtures;
}

async function fetchScheduleFixtures(): Promise<SourceFixture[]> {
  const response = await fetchWithRetry(SCHEDULE_URL, {
    headers: { 'user-agent': USER_AGENT }
  });

  const html = await response.text();
  const fixtures = extractFixturesFromHtml(html);
  await sleep(REQUEST_DELAY_MS);
  return fixtures;
}

export async function scrapeGamesSchedule(_maxPaginationClicks = 8): Promise<Game[]> {
  await ensureAllowed(SCHEDULE_URL);

  const fixtures = await fetchScheduleFixtures();
  const threshold = Date.now() - 3 * 60 * 60 * 1000;

  const deduped = new Map<string, Game>();
  for (const fixture of fixtures) {
    const game = normalizeFixture(fixture);
    if (new Date(game.startTimeISO).getTime() < threshold) {
      continue;
    }
    deduped.set(game.id, game);
  }

  return Array.from(deduped.values()).sort(
    (a, b) => new Date(a.startTimeISO).getTime() - new Date(b.startTimeISO).getTime()
  );
}

function defaultDescription(matchup: string): string {
  return `This page provides full broadcast information for ${matchup}. Here you can see the confirmed start time, TV channel listings, and live streaming options available for this event.`;
}

function fallbackMatchupFromUrl(url: string): string {
  const tail = url.split('/').pop() || 'college-lacrosse-game';
  const cleaned = tail.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
  return cleaned || 'College Lacrosse Game';
}

function buildGameDetailFromFixture(fixture: SourceFixture, detailUrl: string): GameDetail {
  const matchup = buildMatchup(fixture);
  const idFromUrl = detailUrl.split('/').pop() || `${fixture.fixture_id}`;

  return {
    gameId: safeGameId(idFromUrl),
    matchup,
    description: defaultDescription(matchup),
    watchOptions: buildWatchOptions(fixture, detailUrl),
    detailUrl,
    scrapedAt: new Date().toISOString()
  };
}

export async function scrapeGameDetail(detailUrl: string): Promise<GameDetail> {
  const absoluteUrl = toAbsoluteUrl(detailUrl, BASE_URL);
  await ensureAllowed(absoluteUrl);

  try {
    const fixtureId = extractFixtureIdFromUrl(absoluteUrl);
    const fixtures = await fetchScheduleFixtures();
    const fixture = fixtureId ? fixtures.find((item) => item.fixture_id === fixtureId) : undefined;

    if (fixture) {
      return buildGameDetailFromFixture(fixture, absoluteUrl);
    }

    const fallbackMatchup = fallbackMatchupFromUrl(absoluteUrl);
    return {
      gameId: safeGameId(absoluteUrl.split('/').pop() || 'game-detail'),
      matchup: fallbackMatchup,
      description: defaultDescription(fallbackMatchup),
      watchOptions: [],
      detailUrl: absoluteUrl,
      scrapedAt: new Date().toISOString()
    };
  } finally {
    await sleep(REQUEST_DELAY_MS);
  }
}
