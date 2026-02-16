import type { Game, GameOdds } from '@/lib/types';
import { fetchWithRetry, normalizeWhitespace } from '@/lib/utils';

const ODDS_BASE_URL = 'https://api.the-odds-api.com/v4';

type OddsEvent = {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Array<{
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price?: number; point?: number }>;
    }>;
  }>;
};

function normalizeTeamName(team: string): string {
  return normalizeWhitespace(team).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function eventMatchesGame(event: OddsEvent, game: Game): boolean {
  const eventHome = normalizeTeamName(event.home_team);
  const eventAway = normalizeTeamName(event.away_team);
  const gameHome = normalizeTeamName(game.homeTeam);
  const gameAway = normalizeTeamName(game.awayTeam);

  const sameTeams = eventHome === gameHome && eventAway === gameAway;
  const eventTime = new Date(event.commence_time).getTime();
  const gameTime = new Date(game.startTimeISO).getTime();
  const withinRange = Math.abs(eventTime - gameTime) < 12 * 60 * 60 * 1000;
  return sameTeams && withinRange;
}

async function discoverLacrosseSportKeys(apiKey: string): Promise<string[]> {
  const response = await fetchWithRetry(`${ODDS_BASE_URL}/sports/?apiKey=${apiKey}`);
  const sports = (await response.json()) as Array<{ key: string; title: string }>;

  return sports
    .filter((sport) => /lacrosse/i.test(sport.key) || /lacrosse/i.test(sport.title))
    .map((sport) => sport.key)
    .slice(0, 3);
}

function oddsFromEvent(event: OddsEvent): GameOdds | undefined {
  const bookmaker = event.bookmakers?.[0];
  if (!bookmaker) {
    return undefined;
  }

  const moneylineMarket = bookmaker.markets.find((market) => market.key === 'h2h');
  const spreadMarket = bookmaker.markets.find((market) => market.key === 'spreads');
  const totalMarket = bookmaker.markets.find((market) => market.key === 'totals');

  const moneyline = moneylineMarket?.outcomes
    ?.map((outcome) => `${outcome.name}: ${outcome.price ?? '--'}`)
    .join(' | ');

  const spread = spreadMarket?.outcomes
    ?.map((outcome) => `${outcome.name}: ${outcome.point ?? '--'} (${outcome.price ?? '--'})`)
    .join(' | ');

  const overUnder = totalMarket?.outcomes
    ?.map((outcome) => `${outcome.name}: ${outcome.point ?? '--'} (${outcome.price ?? '--'})`)
    .join(' | ');

  return {
    provider: bookmaker.title,
    moneyline,
    spread,
    overUnder,
    updatedAt: new Date().toISOString()
  };
}

export async function fetchOddsForGames(games: Game[]): Promise<Record<string, GameOdds>> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || !games.length) {
    return {};
  }

  const sportKeys = await discoverLacrosseSportKeys(apiKey);
  if (!sportKeys.length) {
    return {};
  }

  const events: OddsEvent[] = [];

  for (const sportKey of sportKeys) {
    const url = `${ODDS_BASE_URL}/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    try {
      const response = await fetchWithRetry(url, undefined, 2);
      const payload = (await response.json()) as OddsEvent[];
      events.push(...payload);
    } catch {
      // Ignore individual sport failures and keep remaining keys.
    }
  }

  const results: Record<string, GameOdds> = {};

  for (const game of games) {
    const match = events.find((event) => eventMatchesGame(event, game));
    if (!match) {
      continue;
    }
    const odds = oddsFromEvent(match);
    if (odds) {
      results[game.id] = odds;
    }
  }

  return results;
}
