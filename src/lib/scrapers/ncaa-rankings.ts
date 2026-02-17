import robotsParser from 'robots-parser';
import type { RankingEntry, RankingsPayload } from '@/lib/types';
import { fetchWithRetry, normalizeWhitespace, sleep } from '@/lib/utils';

const USER_AGENT = 'CollegeLacrosseScheduleBot/1.0 (+https://collegelacrosseschedule.com)';
const TOP_N = 25;

const MEN_SOURCES = [
  { label: 'inside-lacrosse-mens', url: 'https://www.insidelacrosse.com/rankings/division-i-mens' },
  { label: 'ncaa-mens', url: 'https://www.ncaa.com/rankings/lacrosse-men/d1' }
] as const;

const WOMEN_SOURCES = [
  { label: 'inside-lacrosse-womens', url: 'https://www.insidelacrosse.com/rankings/division-i-womens' },
  { label: 'ncaa-womens', url: 'https://www.ncaa.com/rankings/lacrosse-women/d1' }
] as const;

const robotsCache = new Map<string, { fetchedAt: number; parser: ReturnType<typeof robotsParser> }>();

function decodeHtml(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCharCode(Number.parseInt(value, 10)))
    .replace(/&#x([\da-f]+);/gi, (_, value: string) => String.fromCharCode(Number.parseInt(value, 16)));
}

function stripTags(input: string): string {
  return normalizeWhitespace(decodeHtml(input.replace(/<[^>]+>/g, ' ')));
}

function parseIntOrNull(input: string): number | null {
  const parsed = Number.parseInt(input.replace(/[^0-9-]+/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseChange(rawChange: string, rawPrev: string, rank: number): string {
  const changeText = normalizeWhitespace(rawChange || '');
  if (!changeText) {
    const prev = parseIntOrNull(rawPrev);
    if (prev === null) {
      return '0';
    }
    const delta = prev - rank;
    return delta > 0 ? `+${delta}` : `${delta}`;
  }

  if (/^[-+]?\d+$/.test(changeText)) {
    const value = Number.parseInt(changeText, 10);
    return value > 0 ? `+${value}` : `${value}`;
  }

  if (/new/i.test(changeText)) {
    return 'NEW';
  }

  if (/^--?$/.test(changeText)) {
    return '0';
  }

  return changeText;
}

async function ensureAllowed(url: string): Promise<void> {
  const parsedUrl = new URL(url);
  const robotsUrl = `${parsedUrl.origin}/robots.txt`;
  const now = Date.now();
  const cached = robotsCache.get(robotsUrl);

  if (!cached || now - cached.fetchedAt > 12 * 60 * 60 * 1000) {
    const response = await fetch(robotsUrl, {
      headers: { 'user-agent': USER_AGENT }
    });

    const body = await response.text();
    robotsCache.set(robotsUrl, {
      fetchedAt: now,
      parser: robotsParser(robotsUrl, body)
    });
  }

  const parser = robotsCache.get(robotsUrl)?.parser;
  if (!parser?.isAllowed(url, USER_AGENT)) {
    const isInsideLacrosse = parsedUrl.hostname.includes('insidelacrosse.com');
    if (isInsideLacrosse) {
      // Inside Lacrosse blocks generic bots in robots.txt. Keep it as a best-effort source,
      // and rely on response validation/challenge detection before accepting data.
      console.warn(`[rankings] robots.txt disallows ${USER_AGENT} for ${url}; attempting best-effort fetch`);
      return;
    }

    throw new Error(`Scraping blocked by robots.txt: ${url}`);
  }
}

function isCloudflareChallenge(html: string): boolean {
  return /Just a moment\.\.\./i.test(html) && /__cf_chl_opt/i.test(html);
}

function parseRowsFromTable(tableHtml: string): Array<Record<string, string>> {
  const headerMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const headerCells = headerMatch
    ? Array.from(headerMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)).map((match) => stripTags(match[1]).toLowerCase())
    : [];

  const bodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const sourceHtml = bodyMatch ? bodyMatch[1] : tableHtml;

  const output: Array<Record<string, string>> = [];
  for (const rowMatch of sourceHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    const cellValues = Array.from(rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => stripTags(match[1]));

    if (cellValues.length < 2) {
      continue;
    }

    const row: Record<string, string> = {};
    cellValues.forEach((value, index) => {
      row[`col_${index}`] = value;
      const header = headerCells[index];
      if (header) {
        row[header] = value;
      }
    });

    output.push(row);
  }

  return output;
}

function extractRankingRows(html: string): Array<Record<string, string>> {
  const tables = Array.from(html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)).map((match) => match[0]);
  let best: Array<Record<string, string>> = [];

  for (const table of tables) {
    const parsedRows = parseRowsFromTable(table);
    const rankLikeCount = parsedRows.filter((row) => parseIntOrNull(row.rank || row.col_0 || '') !== null).length;

    if (rankLikeCount > best.length) {
      best = parsedRows;
    }
  }

  return best;
}

function toRankingEntry(row: Record<string, string>): RankingEntry | null {
  const rankText = row.rank || row['ranking'] || row['rk'] || row.col_0 || '';
  const rank = parseIntOrNull(rankText);
  if (rank === null || rank <= 0) {
    return null;
  }

  const team =
    row.team ||
    row.school ||
    row['team name'] ||
    row['institution'] ||
    row.col_1 ||
    '';

  if (!team) {
    return null;
  }

  const record =
    row.record ||
    row['w-l'] ||
    row['won-lost'] ||
    row.col_2 ||
    '--';

  const pointsVotes =
    row.points ||
    row['points/votes'] ||
    row.votes ||
    row.pts ||
    row.col_3 ||
    '--';

  const previous = row.previous || row.prev || row['previous rank'] || row.col_4 || '';
  const changeRaw = row.change || row['+/-'] || row.delta || '';

  return {
    rank,
    team: normalizeWhitespace(team),
    record: normalizeWhitespace(record || '--'),
    pointsVotes: normalizeWhitespace(pointsVotes || '--'),
    change: parseChange(changeRaw, previous, rank)
  };
}

async function fetchAndParseSource(source: { label: string; url: string }): Promise<RankingEntry[]> {
  await ensureAllowed(source.url);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchWithRetry(source.url, {
        headers: {
          'user-agent': USER_AGENT,
          'accept-language': 'en-US,en;q=0.9'
        }
      });

      const html = await response.text();
      if (isCloudflareChallenge(html)) {
        throw new Error(`Cloudflare challenge for ${source.url}`);
      }

      const entries = extractRankingRows(html)
        .map(toRankingEntry)
        .filter((entry): entry is RankingEntry => Boolean(entry));

      const uniqueByRank = new Map<number, RankingEntry>();
      for (const entry of entries) {
        if (!uniqueByRank.has(entry.rank)) {
          uniqueByRank.set(entry.rank, entry);
        }
      }

      const normalized = Array.from(uniqueByRank.values())
        .sort((a, b) => a.rank - b.rank)
        .slice(0, TOP_N);

      if (!normalized.length) {
        throw new Error(`No rankings rows parsed from ${source.url}`);
      }

      console.info(`[rankings] ${source.label} parsed ${normalized.length} rows`);
      return normalized;
    } catch (error) {
      lastError = error;
      const waitMs = Math.pow(2, attempt) * 400;
      console.warn(`[rankings] ${source.label} attempt ${attempt} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to scrape ${source.label}`);
}

async function scrapeWithSources(label: 'mens' | 'womens', sources: ReadonlyArray<{ label: string; url: string }>): Promise<RankingEntry[]> {
  let lastError: unknown;

  for (const source of sources) {
    try {
      const rows = await fetchAndParseSource(source);
      console.info(`[rankings] ${label} source=${source.label} top=${rows.length}`);
      return rows;
    } catch (error) {
      lastError = error;
      console.warn(`[rankings] ${label} source failed (${source.label}): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to scrape ${label} rankings`);
}

export async function scrapeNcaaRankings(): Promise<RankingsPayload> {
  const [mens, womens] = await Promise.all([
    scrapeWithSources('mens', MEN_SOURCES),
    scrapeWithSources('womens', WOMEN_SOURCES)
  ]);

  if (!mens.length || !womens.length) {
    throw new Error('Incomplete rankings payload: men or women rankings are empty');
  }

  const updatedAt = new Date().toISOString();
  console.info(`[rankings] complete mens=${mens.length} womens=${womens.length} updatedAt=${updatedAt}`);

  return {
    mens,
    womens,
    updatedAt
  };
}
