import { useEffect, useMemo, useRef, useState } from 'react';
import GameCard from '@/components/GameCard';
import GameModal from '@/components/GameModal';
import type { Game, GameDetail } from '@/lib/types';

type DateFilter = 'today' | 'tomorrow' | 'week' | 'all';

function isGameInFilter(game: Game, filter: DateFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  const now = new Date();
  const gameDate = new Date(game.startTimeISO);

  if (filter === 'today') {
    return gameDate.toDateString() === now.toDateString();
  }

  if (filter === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return gameDate.toDateString() === tomorrow.toDateString();
  }

  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  return gameDate >= now && gameDate <= weekEnd;
}

export default function ScheduleBoard() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [fuboOnly, setFuboOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [details, setDetails] = useState<Record<string, GameDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [localZone, setLocalZone] = useState<string | undefined>(undefined);
  const [shareStatus, setShareStatus] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  useEffect(() => {
    const loadGames = async () => {
      try {
        const response = await fetch('/api/get-games');
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Unable to fetch schedule');
        }

        setGames(payload.games || []);
        setLastUpdated(payload.lastUpdated || '');
        setError(payload.stale ? 'Showing cached data because latest scrape failed.' : '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load games');
      } finally {
        setLoading(false);
      }
    };

    loadGames().catch(() => undefined);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) {
      return;
    }
    const game = games.find((item) => item.id === hash);
    if (game) {
      setSelectedGame(game);
      handleOpen(game).catch(() => undefined);
    }
  }, [games]);

  useEffect(() => {
    if (!shareStatus) {
      return;
    }

    const timeout = window.setTimeout(() => setShareStatus(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [shareStatus]);

  const platforms = useMemo(() => {
    return Array.from(
      new Set(
        games.flatMap((game) => game.platforms.map((platform) => platform.name))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [games]);

  const filtered = useMemo(() => {
    return games.filter((game) => {
      const matchesDate = isGameInFilter(game, dateFilter);
      const matchesSearch =
        !searchTerm ||
        game.homeTeam.toLowerCase().includes(searchTerm.toLowerCase()) ||
        game.awayTeam.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPlatform =
        platformFilter === 'all' || game.platforms.some((platform) => platform.name === platformFilter);
      const matchesFubo = !fuboOnly || game.platforms.some((platform) => /fubo/i.test(platform.name));
      return matchesDate && matchesSearch && matchesPlatform && matchesFubo;
    });
  }, [games, dateFilter, searchTerm, platformFilter, fuboOnly]);

  useEffect(() => {
    setVisibleCount(12);
  }, [dateFilter, platformFilter, searchTerm, fuboOnly]);

  useEffect(() => {
    if (!sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setVisibleCount((count) => count + 12);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [filtered.length]);

  async function handleOpen(game: Game): Promise<void> {
    setSelectedGame(game);

    if (details[game.id]) {
      return;
    }

    setDetailLoading(true);
    try {
      const response = await fetch(`/api/game-detail?detailUrl=${encodeURIComponent(game.detailUrl)}`);
      const payload = await response.json();
      if (response.ok && payload.detail) {
        setDetails((current) => ({ ...current, [game.id]: payload.detail }));
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleShare(game: Game): Promise<void> {
    const shareUrl = `${window.location.origin}/#${game.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus('Copied game link');
    } catch {
      setShareStatus('Unable to copy link');
    }
  }

  const visibleGames = filtered.slice(0, visibleCount);

  return (
    <section>
      <div className="rounded-xl bg-white p-4 shadow-card sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold text-navy">
            Date
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            >
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="week">This Week</option>
              <option value="all">All</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-navy">
            Platform
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value)}
            >
              <option value="all">All Platforms</option>
              {platforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-navy">
            Team Search
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="Search by team"
            />
          </label>

          <label className="flex items-center gap-2 self-end rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white">
            <input type="checkbox" checked={fuboOnly} onChange={(event) => setFuboOnly(event.target.checked)} />
            Show only Fubo games
          </label>
        </div>
      </div>

      {shareStatus && <p className="mt-3 text-sm font-semibold text-navy">{shareStatus}</p>}
      {lastUpdated && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-navy/60">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </p>
      )}
      {error && <p className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">{error}</p>}

      {loading && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="skeleton h-48 w-full" />
          ))}
        </div>
      )}

      {!loading && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleGames.map((game, index) => (
              <div key={game.id} className="space-y-4">
                <GameCard game={game} timeZone={localZone} onOpen={handleOpen} onShare={handleShare} />
                {(index + 1) % 5 === 0 && (
                  <div className="ad-slot h-[50px] w-full rounded-md">
                    Mobile Interstitial Ad 320x50
                    {/* Insert ad network code here */}
                  </div>
                )}
              </div>
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 12)}
                className="rounded-md bg-navy px-5 py-2 text-sm font-bold text-white"
              >
                Load More Games
              </button>
              <div ref={sentinelRef} className="h-4 w-full" />
            </div>
          )}

          {filtered.length === 0 && (
            <p className="mt-6 rounded-lg bg-white p-4 text-center text-sm text-navy/70 shadow-card">
              No games match these filters right now.
            </p>
          )}
        </>
      )}

      <GameModal
        game={selectedGame}
        detail={selectedGame ? details[selectedGame.id] || null : null}
        loading={detailLoading}
        onClose={() => setSelectedGame(null)}
      />
    </section>
  );
}
