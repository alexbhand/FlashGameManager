import { useMemo } from 'react';
import { TOTAL_SHIFTS } from '../lib/constants.js';
import { availabilityLabel, isAvailableAt } from '../lib/lineup.js';
import { Banner, Button, Card } from './ui.jsx';

/**
 * Mid-game roster changes — the edge case that happens most weeks.
 * A kid turns up at half time, or picks up a knock and is done for the day.
 * Either way we re-plan only the shifts that have NOT been played yet.
 */
export default function RosterChangeSheet({
  open,
  roster,
  fromShift,
  onArrive,
  onDepart,
  onUndo,
  onClose,
}) {
  const { hereNow, notHere } = useMemo(() => {
    const here = [];
    const away = [];
    roster.forEach((p) => {
      // "Here now" means available for the shift we would re-plan from.
      (isAvailableAt(p, Math.min(fromShift, TOTAL_SHIFTS - 1)) ? here : away).push(p);
    });
    return { hereNow: here, notHere: away };
  }, [roster, fromShift]);

  if (!open) return null;

  const Row = ({ player, action, actionLabel, tone }) => (
    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-black uppercase tracking-tight text-white">
          {player.name}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {availabilityLabel(player)}
        </p>
      </div>
      <Button
        variant={tone}
        className="min-h-[44px] shrink-0 px-3 text-[11px]"
        onClick={() => action(player.id)}
      >
        {actionLabel}
      </Button>
    </div>
  );

  const changed = roster.filter(
    (p) => (p.arriveShift || 0) > 0 || p.departShift != null
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm">
      <button className="flex-1" onClick={onClose} aria-label="Close" />

      <div className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-900 pb-8">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-4 pb-3 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl font-black uppercase tracking-tight text-white">Roster Change</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Re-plans from shift {Math.min(fromShift + 1, TOTAL_SHIFTS)} onward
              </p>
            </div>
            <Button variant="outline" className="min-h-[44px] shrink-0 px-4 text-xs" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>

        <div className="space-y-4 px-4 pt-4">
          <Banner tone="slate">
            Shifts already played are kept exactly as they were. A late arrival gets a fair share of
            what is <em>left</em> — not a full game squeezed into the rest.
          </Banner>

          <section>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              On the touchline ({hereNow.length})
            </p>
            <div className="space-y-2">
              {hereNow.map((p) => (
                <Row
                  key={p.id}
                  player={p}
                  action={onDepart}
                  actionLabel="Leaving / hurt"
                  tone="dangerQuiet"
                />
              ))}
            </div>
          </section>

          {notHere.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-lime-400">
                Not available ({notHere.length})
              </p>
              <div className="space-y-2">
                {notHere.map((p) => (
                  <Row key={p.id} player={p} action={onArrive} actionLabel="Just arrived" tone="primary" />
                ))}
              </div>
            </section>
          )}

          {changed.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Changed today
              </p>
              <Card className="divide-y divide-slate-800">
                {changed.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 truncate text-sm font-black uppercase tracking-tight text-white">
                      {p.name}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      {availabilityLabel(p)}
                    </span>
                    <Button
                      variant="outline"
                      className="min-h-[40px] px-3 text-[10px]"
                      onClick={() => onUndo(p.id)}
                    >
                      Undo
                    </Button>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
