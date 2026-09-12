import { useMemo } from 'react';
import { PREFERENCE_GROUPS, TOTAL_SLOTS, POSITIONS } from '../lib/constants.js';
import { Button, Card, SectionLabel, Banner, Stat } from './ui.jsx';

/**
 * VIEW A — Pre-Game Setup.
 * Attendance, season-long position preferences, and the daily goalie opt-in.
 */
export default function PreGameSetup({
  roster,
  setRoster,
  settings,
  setSettings,
  onGenerate,
  warnings,
  lineupReady,
  onGoLive,
  seasonGkShifts = {},
  onOpenRatings,
}) {
  const present = useMemo(() => roster.filter((p) => p.isPresent), [roster]);
  const keepers = useMemo(() => present.filter((p) => p.wantsGoalieToday), [present]);
  const target = present.length ? TOTAL_SLOTS / present.length : 0;

  // How many players the coach has moved off the neutral default.
  const ratedCount = useMemo(
    () => roster.filter((p) => p.offense !== 'Steady' || p.defense !== 'Steady').length,
    [roster]
  );

  // Who has been carrying the gloves this season, busiest first.
  const keeperLoad = useMemo(
    () =>
      roster
        .map((p) => ({ name: p.name, n: seasonGkShifts[p.id] || 0 }))
        .filter((k) => k.n > 0)
        .sort((a, b) => b.n - a.n),
    [roster, seasonGkShifts]
  );

  const update = (id, patch) =>
    setRoster((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const togglePreference = (player, group) => {
    const has = player.preferredPositions.includes(group);
    update(player.id, {
      preferredPositions: has
        ? player.preferredPositions.filter((g) => g !== group)
        : [...player.preferredPositions, group],
    });
  };

  const setAllPresent = (value) =>
    setRoster((prev) => prev.map((p) => ({ ...p, isPresent: value })));

  return (
    <div className="space-y-4">
      {/* --- Today's numbers -------------------------------------------------- */}
      <Card className="p-4">
        <SectionLabel right={`${POSITIONS.length} on the field · 8 shifts`}>Today</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Present" value={present.length} accent="text-lime-400" />
          <Stat label="Shifts Ea" value={present.length ? target.toFixed(1) : '—'} />
          <Stat
            label="Want GK"
            value={keepers.length}
            accent={keepers.length ? 'text-fuchsia-400' : 'text-red-400'}
          />
        </div>

        {keeperLoad.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            <span className="font-black uppercase tracking-wider text-fuchsia-400">In goal so far</span>{' '}
            — {keeperLoad.map((k) => `${k.name} ${k.n}`).join(' · ')}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1 text-sm" onClick={() => setAllPresent(true)}>
            All In
          </Button>
          <Button variant="outline" className="flex-1 text-sm" onClick={() => setAllPresent(false)}>
            All Out
          </Button>
        </div>

        <Button variant="outline" className="mt-3 w-full text-sm" onClick={onOpenRatings}>
          Line Balance{ratedCount > 0 ? ` · ${ratedCount} set` : ''}
        </Button>

        <div className="mt-3 space-y-2">
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
            Opponent (optional)
          </label>
          <input
            value={settings.opponent}
            onChange={(e) => setSettings((s) => ({ ...s, opponent: e.target.value }))}
            placeholder="e.g. Thunder"
            className="min-h-[52px] w-full rounded-xl border border-slate-700 bg-slate-800 px-4 text-base font-semibold text-white placeholder:text-slate-500 focus:border-lime-400 focus:outline-none"
          />
        </div>
      </Card>

      {/* --- The lone-keeper prompt ------------------------------------------- */}
      {keepers.length === 1 && (
        <Card className="border-fuchsia-500/40 bg-fuchsia-500/5 p-4">
          <p className="text-sm font-semibold text-fuchsia-200">
            Only <span className="font-black">{keepers[0].name}</span> wants goalie today. They will
            keep the full 1st half. Both halves?
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant={settings.singleKeeperBothHalves ? 'primary' : 'outline'}
              className="flex-1 text-sm"
              onClick={() => setSettings((s) => ({ ...s, singleKeeperBothHalves: true }))}
            >
              All 60 min
            </Button>
            <Button
              variant={!settings.singleKeeperBothHalves ? 'primary' : 'outline'}
              className="flex-1 text-sm"
              onClick={() => setSettings((s) => ({ ...s, singleKeeperBothHalves: false }))}
            >
              1st half only
            </Button>
          </div>
        </Card>
      )}

      {/* --- Roster checklist -------------------------------------------------- */}
      <div>
        <SectionLabel right={`${present.length} / ${roster.length}`}>Roster</SectionLabel>
        <div className="space-y-2">
          {roster.map((player) => (
            <Card
              key={player.id}
              className={`p-3 transition-colors ${
                player.isPresent ? 'border-slate-700' : 'border-slate-800 bg-slate-900/30 opacity-60'
              }`}
            >
              {/* Attendance row */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => update(player.id, { isPresent: !player.isPresent })}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 text-lg font-black transition-colors ${
                    player.isPresent
                      ? 'border-lime-400 bg-lime-400 text-slate-950'
                      : 'border-slate-700 bg-slate-800 text-slate-600'
                  }`}
                  aria-label={`${player.name} ${player.isPresent ? 'present' : 'absent'}`}
                >
                  {player.isPresent ? '✓' : '—'}
                </button>

                <div className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xl font-black uppercase tracking-tight ${
                      player.isPresent ? 'text-white' : 'text-slate-500 line-through'
                    }`}
                  >
                    {player.name}
                  </span>
                  {/* Season keeper load, so you can see who has been carrying
                      the gloves before deciding who takes them today. */}
                  {seasonGkShifts[player.id] > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">
                      {seasonGkShifts[player.id]} GK shift
                      {seasonGkShifts[player.id] === 1 ? '' : 's'} this season
                    </span>
                  )}
                </div>

                {/* Goalie opt-in — deliberately the loudest control on the row */}
                <button
                  onClick={() => update(player.id, { wantsGoalieToday: !player.wantsGoalieToday })}
                  disabled={!player.isPresent}
                  className={`flex min-h-[48px] items-center gap-1.5 rounded-xl border-2 px-3 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-30 ${
                    player.wantsGoalieToday
                      ? 'border-fuchsia-400 bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30'
                      : 'border-slate-700 bg-slate-800 text-slate-400'
                  }`}
                >
                  <span className="text-base leading-none">🧤</span> GK
                </button>
              </div>

              {/* Preference quick-select */}
              {player.isPresent && (
                <div className="mt-2 flex gap-2 pl-[60px]">
                  {PREFERENCE_GROUPS.map((group) => {
                    const on = player.preferredPositions.includes(group);
                    return (
                      <button
                        key={group}
                        onClick={() => togglePreference(player, group)}
                        className={`min-h-[48px] flex-1 rounded-lg border text-xs font-black uppercase tracking-wide transition-colors ${
                          on
                            ? 'border-lime-400/60 bg-lime-400/20 text-lime-300'
                            : 'border-slate-700 bg-slate-800/60 text-slate-500'
                        }`}
                      >
                        {group === 'Midfield' ? 'Mid' : group === 'Forward' ? 'Fwd' : 'Def'}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* --- Generate ---------------------------------------------------------- */}
      <div className="space-y-3 pt-2">
        {warnings?.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <Banner key={i} tone="amber">
                {w}
              </Banner>
            ))}
          </div>
        )}

        <Button
          variant="primary"
          className="w-full text-lg"
          onClick={onGenerate}
          disabled={present.length === 0}
        >
          {lineupReady ? 'Regenerate Lineup' : 'Build Lineup'}
        </Button>

        {lineupReady && (
          <Button variant="ghost" className="w-full" onClick={onGoLive}>
            Go to Game Day →
          </Button>
        )}

        <p className="px-2 text-center text-xs leading-relaxed text-slate-500">
          {lineupReady
            ? 'The lineup updates itself as you change attendance or goalie picks, right up until you start the clock. Regenerate shuffles it into a different plan. '
            : ''}
          Position preferences carry over all season.
        </p>
      </div>
    </div>
  );
}
