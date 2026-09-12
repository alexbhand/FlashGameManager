import { useMemo, useState } from 'react';
import { prettyStamp } from '../lib/format.js';
import { Button, Card, EmptyState, SectionLabel } from './ui.jsx';

const COLUMNS = [
  { key: 'games', label: 'GP', hint: 'Games played' },
  { key: 'total', label: 'Shifts', hint: 'Total shifts' },
  { key: 'GK', label: 'GK', hint: 'Shifts in goal' },
  { key: 'Defense', label: 'D', hint: 'Shifts on defense' },
  { key: 'Midfield', label: 'M', hint: 'Shifts at midfield' },
  { key: 'Forward', label: 'F', hint: 'Shifts at forward' },
];

/**
 * VIEW D — Season history. Reads the `completedGames` array out of
 * localStorage and rolls it up per player. The GK column is the one that
 * matters most week to week: it is how you spot the kid who has quietly played
 * keeper four weeks running.
 */
export default function SeasonHistory({ games, roster, onDeleteGame, onClearSeason }) {
  const [sortKey, setSortKey] = useState('total');

  const rows = useMemo(() => {
    const acc = {};
    // Seed from the current roster so players show up even at 0 shifts.
    roster.forEach((p) => {
      acc[p.id] = { id: p.id, name: p.name, games: 0, total: 0, GK: 0, Defense: 0, Midfield: 0, Forward: 0 };
    });
    games.forEach((game) => {
      Object.values(game.stats || {}).forEach((s) => {
        if (!acc[s.id]) {
          // A player who has since left the roster still keeps their history.
          acc[s.id] = { id: s.id, name: s.name, games: 0, total: 0, GK: 0, Defense: 0, Midfield: 0, Forward: 0 };
        }
        if (s.total > 0) acc[s.id].games += 1;
        acc[s.id].total += s.total;
        acc[s.id].GK += s.GK;
        acc[s.id].Defense += s.Defense;
        acc[s.id].Midfield += s.Midfield;
        acc[s.id].Forward += s.Forward;
      });
    });
    return Object.values(acc);
  }, [games, roster]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        sortKey === 'name' ? a.name.localeCompare(b.name) : b[sortKey] - a[sortKey] || a.name.localeCompare(b.name)
      ),
    [rows, sortKey]
  );

  const maxGk = Math.max(1, ...rows.map((r) => r.GK));
  const avgShifts = rows.length
    ? rows.reduce((sum, r) => sum + r.total, 0) / rows.filter((r) => r.games > 0).length || 0
    : 0;

  if (games.length === 0) {
    return (
      <EmptyState title="No games logged">
        Finish a game on the Live tab and hit <strong>Save to Season</strong>. Totals build up here
        so you can prove every kid got equal time.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionLabel right={`${games.length} game${games.length === 1 ? '' : 's'}`}>
          Season Totals
        </SectionLabel>
        <p className="text-xs text-slate-500">
          Tap a column header to sort. Average shifts per player:{' '}
          <span className="font-black text-lime-400">{avgShifts.toFixed(1)}</span>
        </p>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th
                onClick={() => setSortKey('name')}
                className={`sticky left-0 bg-slate-900 px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest ${
                  sortKey === 'name' ? 'text-lime-400' : 'text-slate-500'
                }`}
              >
                Player
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.hint}
                  onClick={() => setSortKey(c.key)}
                  className={`px-2 py-3 text-center text-[10px] font-black uppercase tracking-widest ${
                    sortKey === c.key ? 'text-lime-400' : 'text-slate-500'
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                <td className="sticky left-0 bg-slate-900 px-3 py-2.5 text-left text-sm font-black uppercase tracking-tight text-white">
                  {r.name}
                </td>
                <td className="px-2 py-2.5 text-center text-sm font-bold text-slate-400">{r.games}</td>
                <td className="clock-digits px-2 py-2.5 text-center text-base font-black text-white">
                  {r.total}
                </td>
                <td
                  className={`clock-digits px-2 py-2.5 text-center text-base font-black ${
                    r.GK > 0 && r.GK >= maxGk ? 'text-amber-400' : r.GK > 0 ? 'text-fuchsia-400' : 'text-slate-600'
                  }`}
                >
                  {r.GK}
                </td>
                <td className="clock-digits px-2 py-2.5 text-center font-bold text-sky-300">{r.Defense}</td>
                <td className="clock-digits px-2 py-2.5 text-center font-bold text-lime-300">{r.Midfield}</td>
                <td className="clock-digits px-2 py-2.5 text-center font-bold text-orange-300">{r.Forward}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div>
        <SectionLabel right="newest first">Game Log</SectionLabel>
        <p className="mb-2 px-1 text-xs text-slate-500">
          Delete a game to pull it back out of the totals above — handy for clearing out
          practice runs so they don't skew the season.
        </p>
        <div className="space-y-2">
          {[...games].reverse().map((game) => {
            const values = Object.values(game.stats || {});
            const played = values.filter((s) => s.total > 0).length;
            const shifts = values.reduce((sum, s) => sum + s.total, 0);
            return (
              <Card key={game.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-black uppercase tracking-tight text-white">
                    {game.opponent ? `vs ${game.opponent}` : 'Game'}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {prettyStamp(game.date, game.savedAt)}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-600">
                    {played} players · {shifts} shifts
                  </p>
                </div>
                <Button
                  variant="dangerQuiet"
                  className="min-h-[48px] shrink-0 px-3 text-xs"
                  onClick={() => onDeleteGame(game.id)}
                >
                  Delete
                </Button>
              </Card>
            );
          })}
        </div>
      </div>

      <Button variant="outline" className="w-full text-sm" onClick={onClearSeason}>
        Clear Entire Season
      </Button>
    </div>
  );
}
