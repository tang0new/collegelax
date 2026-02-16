import { useEffect, useState } from 'react';

type AdminStatus = {
  status: {
    gamesLastRun?: string;
    rankingsLastRun?: string;
    gamesLastError?: string;
    rankingsLastError?: string;
  };
  redis: {
    mode: 'upstash' | 'memory';
    keyCount: number;
    clickKeyCount: number;
  };
  clicks: Array<{
    gameId: string;
    platform: string;
    targetUrl: string;
    timestamp: string;
  }>;
};

function nextRunEvery(hours: number): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + hours, 0, 0, 0);
  return next.toLocaleString();
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function loadStatus() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/status');
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load dashboard');
      }
      setData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus().catch(() => undefined);
  }, []);

  async function trigger(path: string, label: string) {
    setMessage(`${label} in progress...`);
    const response = await fetch(path, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || `${label} failed`);
      return;
    }
    setMessage(`${label} complete.`);
    await loadStatus();
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.assign('/admin/login');
  }

  if (loading) {
    return <div className="skeleton h-40 w-full" />;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => trigger('/api/scrape-games', 'Game scrape')}
          className="rounded-md bg-navy px-4 py-2 text-sm font-bold text-white"
          type="button"
        >
          Scrape Games Now
        </button>
        <button
          onClick={() => trigger('/api/scrape-rankings', 'Rankings scrape')}
          className="rounded-md bg-navy px-4 py-2 text-sm font-bold text-white"
          type="button"
        >
          Scrape Rankings Now
        </button>
        <button
          onClick={() => trigger('/api/admin/cache-clear', 'Cache clear')}
          className="rounded-md border border-navy/20 px-4 py-2 text-sm font-bold text-navy"
          type="button"
        >
          Clear Cache
        </button>
        <button onClick={logout} className="rounded-md border border-red-300 px-4 py-2 text-sm font-bold text-red-700" type="button">
          Log Out
        </button>
      </div>

      {message && <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-navy">{message}</p>}

      {data && (
        <>
          <div className="grid gap-4 rounded-xl bg-white p-4 shadow-card md:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold text-navy">Scraping Status</h2>
              <p className="text-sm text-navy/80">Games last run: {data.status.gamesLastRun || 'Never'}</p>
              <p className="text-sm text-navy/80">Games next schedule: {nextRunEvery(12)}</p>
              <p className="text-sm text-red-600">{data.status.gamesLastError || ''}</p>
              <p className="mt-2 text-sm text-navy/80">Rankings last run: {data.status.rankingsLastRun || 'Never'}</p>
              <p className="text-sm text-navy/80">Rankings next schedule: {nextRunEvery(24)}</p>
              <p className="text-sm text-red-600">{data.status.rankingsLastError || ''}</p>
            </div>
            <div>
              <h2 className="text-lg font-bold text-navy">Redis Status</h2>
              <p className="text-sm text-navy/80">Mode: {data.redis.mode}</p>
              <p className="text-sm text-navy/80">Total keys: {data.redis.keyCount}</p>
              <p className="text-sm text-navy/80">Click keys: {data.redis.clickKeyCount}</p>
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-card">
            <h2 className="text-lg font-bold text-navy">Recent Affiliate Clicks</h2>
            <div className="mt-3 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-2 pr-2">Time</th>
                    <th className="py-2 pr-2">Game ID</th>
                    <th className="py-2 pr-2">Platform</th>
                    <th className="py-2 pr-2">Target URL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clicks.map((event) => (
                    <tr key={`${event.timestamp}-${event.gameId}`} className="border-b border-slate-100">
                      <td className="py-2 pr-2">{new Date(event.timestamp).toLocaleString()}</td>
                      <td className="py-2 pr-2">{event.gameId}</td>
                      <td className="py-2 pr-2">{event.platform}</td>
                      <td className="max-w-xs truncate py-2 pr-2">{event.targetUrl}</td>
                    </tr>
                  ))}
                  {data.clicks.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-3 text-navy/70">
                        No clicks recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
