import robotsParser from 'robots-parser';
import type { RankingEntry, RankingsPayload } from '@/lib/types';
import { fetchWithRetry, normalizeWhitespace, sleep } from '@/lib/utils';

const USER_AGENT = 'CollegeLacrosseScheduleBot/1.0 (+https://collegelacrosseschedule.com)';
const MEN_URLS = [
  'https://www.ncaa.com/rankings/lacrosse-men/d1/ncaa-mens-lacrosse-rpi',
  'https://www.ncaa.com/rankings/lacrosse-men/d1'
];
const WOMEN_URLS = [
  'https://www.ncaa.com/rankings/lacrosse-women/d1/di-committees-top-10',
  'https://www.ncaa.com/rankings/lacrosse-women/d1'
];

let robotsCache: { fetchedAt: number; parser: ReturnType<typeof robotsParser> } | null = null;

async function ensureAllowed(url: string): Promise<void> {
  const robotsUrl = 'https://www.ncaa.com/robots.txt';
  if (!robotsCache || Date.now() - robotsCache.fetchedAt > 12 * 60 * 60 * 1000) {
    const response = await fetch(robotsUrl, {
      headers: { 'user-agent': USER_AGENT }
    });
    const body = await response.text();
    robotsCache = { fetchedAt: Date.now(), parser: robotsParser(robotsUrl, body) };
  }

  if (!robotsCache.parser.isAllowed(url, USER_AGENT)) {
    throw new Error(`Scraping blocked by robots.txt: ${url}`);
  }
}

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

function normalizeRow(rankText: string, team: string, record: string, pointsVotes: string, change: string): RankingEntry | null {
  const rank = Number.parseInt(rankText.replace(/[^0-9]/g, ''), 10);
  if (!rank || !team) {
    return null;
  }

  return {
    rank,
    team: normalizeWhitespace(team),
    record: normalizeWhitespace(record || '--'),
    pointsVotes: normalizeWhitespace(pointsVotes || '--'),
    change: normalizeWhitespace(change || '0')
  };
}

function parseRowsFromHtml(html: string): Array<{
  rank: string;
  team: string;
  record: string;
  pointsVotes: string;
  change: string;
}> {
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return [];
  }

  const tableHtml = tableMatch[1];
  const rows: Array<{ rank: string; team: string; record: string; pointsVotes: string; change: string }> = [];

  for (const rowMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    const cells = Array.from(rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => stripTags(match[1]));

    if (cells.length < 2) {
      continue;
    }

    rows.push({
      rank: cells[0] || '',
      team: cells[1] || '',
      record: cells[2] || '',
      pointsVotes: cells[3] || cells[2] || '',
      change: cells[4] || '0'
    });
  }

  return rows;
}

async function scrapeSingleRanking(urls: string[], topN: number): Promise<RankingEntry[]> {
  for (const url of urls) {
    try {
      await ensureAllowed(url);

      const response = await fetchWithRetry(url, {
        headers: { 'user-agent': USER_AGENT }
      });

      const html = await response.text();
      const rows = parseRowsFromHtml(html)
        .map((row) => normalizeRow(row.rank, row.team, row.record, row.pointsVotes, row.change))
        .filter((row): row is RankingEntry => Boolean(row))
        .slice(0, topN);

      if (rows.length > 0) {
        return rows;
      }
    } catch {
      // Try next source URL.
    }

    await sleep(300);
  }

  return [];
}

export async function scrapeNcaaRankings(): Promise<RankingsPayload> {
  const [mens, womens] = await Promise.all([
    scrapeSingleRanking(MEN_URLS, 25),
    scrapeSingleRanking(WOMEN_URLS, 25)
  ]);

  return {
    mens,
    womens,
    updatedAt: new Date().toISOString()
  };
}
