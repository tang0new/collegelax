import { useMemo } from 'react';
import type { Game, GameDetail, StreamingPlatform } from '@/lib/types';
import { toAffiliateWatchPath } from '@/lib/utils';

interface Props {
  game: Game | null;
  detail: GameDetail | null;
  loading: boolean;
  onClose: () => void;
}

function buildWatchOptions(game: Game | null, detail: GameDetail | null): StreamingPlatform[] {
  if (detail?.watchOptions?.length) {
    return detail.watchOptions;
  }
  if (game?.platforms?.length) {
    return game.platforms;
  }
  return [];
}

export default function GameModal({ game, detail, loading, onClose }: Props) {
  const watchOptions = useMemo(() => buildWatchOptions(game, detail), [game, detail]);

  if (!game) {
    return null;
  }

  const matchup = `${game.awayTeam} - ${game.homeTeam}`;
  const description =
    detail?.description ||
    `This page provides full broadcast information for ${matchup}. Here you can see the confirmed start time, TV channel listings, and live streaming options available for this event.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 px-4 py-6" role="dialog" aria-modal="true">
      <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-navy/60">Game Details</p>
            <h2 className="mt-1 text-2xl font-extrabold text-navy">{matchup}</h2>
            <p className="text-sm text-navy/70">{game.timeEST} EST</p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-md border border-navy/20 px-3 py-1.5 text-sm font-semibold text-navy"
          >
            Close
          </button>
        </div>

        <h3 className="mt-6 text-lg font-extrabold uppercase tracking-wide text-navy">
          WATCH IT LIVE ON TV OR STREAM
        </h3>

        {loading && (
          <div className="mt-3 space-y-3">
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        )}

        {!loading && (
          <div className="mt-3 space-y-3">
            {watchOptions.length === 0 && (
              <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-navy/75">
                Streaming options are still loading. Please check back shortly.
              </p>
            )}
            {watchOptions.map((platform) => {
              const destination = platform.affiliateUrl || game.detailUrl;
              const watchPath = `${toAffiliateWatchPath(platform.slug, game.id, destination)}&matchup=${encodeURIComponent(matchup)}`;
              return (
                <a
                  href={watchPath}
                  key={`${game.id}-${platform.slug}-${platform.affiliateUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition hover:border-accent hover:bg-accent/5"
                >
                  <div className="flex items-center gap-3">
                    <img src={platform.logo} alt={platform.name} className="h-8 w-8 rounded bg-slate-100 p-1" loading="lazy" />
                    <span className="font-semibold text-navy">{platform.name}</span>
                  </div>
                  <span className="rounded-md bg-accent px-3 py-2 text-sm font-bold text-navy">Watch it live →</span>
                </a>
              );
            })}
          </div>
        )}

        <p className="mt-5 text-sm text-navy/70">{description}</p>

        {game.odds && (
          <section className="mt-6 rounded-xl border border-navy/10 bg-slate-50 p-4">
            <h4 className="text-sm font-bold uppercase tracking-wide text-navy">Betting Odds</h4>
            <p className="mt-2 text-sm text-navy/80">Provider: {game.odds.provider}</p>
            <p className="text-sm text-navy/80">Moneyline: {game.odds.moneyline || 'N/A'}</p>
            <p className="text-sm text-navy/80">Spread: {game.odds.spread || 'N/A'}</p>
            <p className="text-sm text-navy/80">Over/Under: {game.odds.overUnder || 'N/A'}</p>
            <p className="mt-2 text-xs text-navy/60">For entertainment purposes only. Gamble responsibly.</p>
          </section>
        )}

        <div className="ad-slot mt-6 h-[250px] w-full rounded-lg">
          Expanded View Ad Slot 300x250
          {/* Insert ad network code here */}
        </div>
      </div>
    </div>
  );
}
