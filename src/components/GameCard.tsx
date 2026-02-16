import type { Game } from '@/lib/types';
import { formatDayMonth, formatUserLocalDateTime, gameCountdown } from '@/lib/utils';

interface Props {
  game: Game;
  timeZone?: string;
  onOpen: (game: Game) => void;
  onShare: (game: Game) => void;
}

export default function GameCard({ game, timeZone, onOpen, onShare }: Props) {
  const dayMonth = formatDayMonth(game.startTimeISO);
  const localLabel = formatUserLocalDateTime(game.startTimeISO, timeZone);
  const countdown = gameCountdown(game.startTimeISO);
  const liveNow = countdown === 'LIVE NOW' || game.isLive;

  return (
    <article id={game.id} className="card-hover rounded-xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-md bg-navy px-3 py-2 text-center text-xs font-bold leading-tight text-white">
          {dayMonth}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className="rounded-full bg-navy/10 px-2 py-1 text-navy">College Lacrosse</span>
            {liveNow && <span className="rounded-full bg-red-600 px-2 py-1 text-white">LIVE NOW</span>}
            {game.oddsAvailable && <span className="rounded-full bg-accent/20 px-2 py-1 text-navy">Odds Available</span>}
          </div>
          <h3 className="mt-2 text-lg font-bold text-navy">
            {game.awayTeam} vs {game.homeTeam}
          </h3>
          <p className="mt-1 text-sm text-navy/80">
            <span className="font-mono">{game.timeEST} EST</span> • {localLabel}
          </p>
          <p className="mt-1 text-xs font-semibold text-navy/60">{countdown}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {game.platforms.slice(0, 4).map((platform) => (
              <img
                key={`${game.id}-${platform.slug}-${platform.name}`}
                src={platform.logo}
                alt={platform.name}
                className="h-6 w-auto rounded bg-slate-100 p-1"
                loading="lazy"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onOpen(game)}
          className="flex-1 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:bg-navy/90"
        >
          View Streams
        </button>
        <button
          type="button"
          onClick={() => onShare(game)}
          className="rounded-md border border-navy/20 px-3 py-2 text-sm font-semibold text-navy hover:border-accent hover:text-accent"
        >
          Share
        </button>
      </div>
    </article>
  );
}
