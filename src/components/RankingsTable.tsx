import type { RankingEntry } from '@/lib/types';

interface Props {
  title: string;
  rows: RankingEntry[];
}

function changeClass(change: string): string {
  if (change.startsWith('+')) {
    return 'text-green-600';
  }
  if (change.startsWith('-')) {
    return 'text-red-600';
  }
  return 'text-navy/70';
}

export default function RankingsTable({ title, rows }: Props) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-card sm:p-5">
      <h2 className="text-xl font-extrabold text-navy">{title}</h2>

      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-navy text-left text-white">
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Record</th>
              <th className="px-3 py-2">Points/Votes</th>
              <th className="px-3 py-2">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, index) => (
              <tr key={`${title}-${entry.rank}-${entry.team}`} className={index % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                <td className="px-3 py-2 font-bold text-navy">{entry.rank}</td>
                <td className="px-3 py-2 font-semibold text-navy">{entry.team}</td>
                <td className="px-3 py-2 text-navy/80">{entry.record}</td>
                <td className="px-3 py-2 text-navy/80">{entry.pointsVotes}</td>
                <td className={`px-3 py-2 font-semibold ${changeClass(entry.change)}`}>{entry.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 md:hidden">
        {rows.map((entry) => (
          <article key={`${title}-mobile-${entry.rank}-${entry.team}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-navy/60">Rank #{entry.rank}</p>
            <h3 className="text-lg font-bold text-navy">{entry.team}</h3>
            <p className="text-sm text-navy/80">Record: {entry.record}</p>
            <p className="text-sm text-navy/80">Points/Votes: {entry.pointsVotes}</p>
            <p className={`text-sm font-semibold ${changeClass(entry.change)}`}>Change: {entry.change}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
