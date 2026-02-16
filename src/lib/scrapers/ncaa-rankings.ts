import puppeteer from 'puppeteer';
import robotsParser from 'robots-parser';
import type { RankingEntry, RankingsPayload } from '@/lib/types';
import { normalizeWhitespace, safeGameId, sleep } from '@/lib/utils';

const USER_AGENT = 'CollegeLacrosseScheduleBot/1.0 (+https://collegelacrosseschedule.com)';
const MEN_URL = 'https://www.ncaa.com/rankings/lacrosse-men/d1/inside-lacrosse-media';
const WOMEN_URL = 'https://www.ncaa.com/rankings/lacrosse-women/d1/inside-lacrosse-media';

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

async function scrapeSingleRanking(url: string): Promise<RankingEntry[]> {
  await ensureAllowed(url);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1000);

    const rows = await page.evaluate(() => {
      const tableRows = Array.from(document.querySelectorAll('table tbody tr'));
      const payload = tableRows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim());
        if (cells.length < 2) {
          return null;
        }

        return {
          rank: cells[0] || '',
          team: cells[1] || '',
          record: cells[2] || '',
          pointsVotes: cells[3] || cells[2] || '',
          change: cells[4] || '0'
        };
      });

      return payload.filter(Boolean) as Array<{ rank: string; team: string; record: string; pointsVotes: string; change: string }>;
    });

    const normalized = rows
      .map((row) => normalizeRow(row.rank, row.team, row.record, row.pointsVotes, row.change))
      .filter((row): row is RankingEntry => Boolean(row))
      .slice(0, 25);

    if (normalized.length) {
      return normalized;
    }

    throw new Error(`Unable to parse rankings from ${url} (${safeGameId(url)})`);
  } finally {
    await browser.close();
  }
}

export async function scrapeNcaaRankings(): Promise<RankingsPayload> {
  const [mens, womens] = await Promise.all([scrapeSingleRanking(MEN_URL), scrapeSingleRanking(WOMEN_URL)]);

  return {
    mens,
    womens,
    updatedAt: new Date().toISOString()
  };
}
