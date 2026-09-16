import {
  HALVES,
  POSITIONS,
  POSITION_IDS,
  SHIFTS_PER_HALF,
  SHIFT_MS,
} from './constants.js';
import { formatClock } from './format.js';
import { benchForShift } from './lineup.js';

// ===========================================================================
// SHAREABLE LINEUP CARD
// ---------------------------------------------------------------------------
// Draws the whole game as one portrait image so it can be texted to another
// coach. Drawn onto a canvas by hand rather than screenshotting the DOM: a
// DOM-to-image library is another dependency, it chokes on the oklch colours
// Tailwind v4 emits, and it would inherit the app's phone layout rather than
// producing something shaped for a message thread.
//
// Deliberately LIGHT, unlike the app. The app is dark because it is held by
// one person who set it up; this image is read by someone else on an unknown
// phone, possibly in sunlight, possibly printed and taped to a clipboard.
// Dark text on a bright ground survives all of that better.
//
// PNG, not JPEG. The card is flat colour and small type — exactly what JPEG
// smears and PNG keeps crisp, and at this size PNG is the smaller file too.
// ===========================================================================

const C = {
  paper: '#ffffff',
  ink: '#0f172a',
  muted: '#64748b',
  rule: '#e2e8f0',
  band: '#f1f5f9',
  keeper: '#f5d0fe',
  keeperInk: '#701a75',
  accent: '#65a30d',
};

const FONT = (size, weight = '400') =>
  `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

const W = 760;
const PAD = 28;
const LABEL_W = 86;
const ROW_H = 38;
const HEAD_H = 34;

/** Player names for one shift, or an em dash where a slot is open. */
const cellText = (shift, posId, nameOf) => nameOf[shift?.[posId]] || '—';

function drawHalf(ctx, y, half, lineup, nameOf, present) {
  const first = (half - 1) * SHIFTS_PER_HALF;
  const colW = (W - PAD * 2 - LABEL_W) / SHIFTS_PER_HALF;

  ctx.fillStyle = C.ink;
  ctx.font = FONT(19, '800');
  ctx.textAlign = 'left';
  ctx.fillText(half === 1 ? '1ST HALF' : '2ND HALF', PAD, y + 18);
  y += 32;

  // Column headers: shift number and the clock time it starts at.
  ctx.font = FONT(12, '700');
  ctx.fillStyle = C.muted;
  for (let i = 0; i < SHIFTS_PER_HALF; i += 1) {
    const x = PAD + LABEL_W + colW * i + colW / 2;
    ctx.textAlign = 'center';
    ctx.fillText(`SHIFT ${first + i + 1}`, x, y + 13);
    ctx.fillText(formatClock(i * SHIFT_MS), x, y + 27);
  }
  y += HEAD_H;

  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 0.5);
  ctx.lineTo(W - PAD, y + 0.5);
  ctx.stroke();

  POSITIONS.forEach((pos, r) => {
    const rowY = y + r * ROW_H;
    const isKeeper = pos.id === 'GK';

    if (isKeeper) {
      ctx.fillStyle = C.keeper;
      ctx.fillRect(PAD, rowY, W - PAD * 2, ROW_H);
    } else if (r % 2 === 1) {
      ctx.fillStyle = C.band;
      ctx.fillRect(PAD, rowY, W - PAD * 2, ROW_H);
    }

    ctx.textAlign = 'left';
    ctx.font = FONT(13, '800');
    ctx.fillStyle = isKeeper ? C.keeperInk : C.muted;
    ctx.fillText(pos.label.toUpperCase(), PAD + 8, rowY + ROW_H / 2 + 5);

    ctx.textAlign = 'center';
    ctx.font = FONT(16, isKeeper ? '800' : '600');
    ctx.fillStyle = isKeeper ? C.keeperInk : C.ink;
    for (let i = 0; i < SHIFTS_PER_HALF; i += 1) {
      const x = PAD + LABEL_W + colW * i + colW / 2;
      ctx.fillText(cellText(lineup[first + i], pos.id, nameOf), x, rowY + ROW_H / 2 + 6);
    }
  });

  y += POSITIONS.length * ROW_H;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 0.5);
  ctx.lineTo(W - PAD, y + 0.5);
  ctx.stroke();

  // Who is resting, shift by shift — the question a second coach asks next.
  ctx.textAlign = 'left';
  ctx.font = FONT(11, '700');
  ctx.fillStyle = C.muted;
  ctx.fillText('RESTING', PAD + 8, y + 20);
  ctx.font = FONT(12, '500');
  for (let i = 0; i < SHIFTS_PER_HALF; i += 1) {
    const names = benchForShift(lineup, present, first + i).map((p) => p.name);
    const x = PAD + LABEL_W + colW * i + colW / 2;
    ctx.textAlign = 'center';
    // Wrap into at most three short lines so a big bench still fits.
    const lines = [];
    let line = '';
    names.forEach((n) => {
      const next = line ? `${line}, ${n}` : n;
      if (ctx.measureText(next).width > colW - 10 && line) {
        lines.push(line);
        line = n;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((l, li) => ctx.fillText(l, x, y + 18 + li * 14));
  }

  return y + 62;
}

/**
 * Render the whole game as a PNG blob.
 * @returns {Promise<Blob|null>}
 */
export async function renderLineupImage({ lineup, roster, opponent, dateLabel }) {
  const present = roster.filter((p) => p.isPresent);
  const nameOf = Object.fromEntries(roster.map((p) => [p.id, p.name]));

  const halfHeight = 32 + HEAD_H + POSITIONS.length * ROW_H + 62;
  const H = 96 + halfHeight * HALVES + 46;

  const canvas = document.createElement('canvas');
  const dpr = 2; // fixed, so the file looks the same whatever device made it
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.textAlign = 'left';
  ctx.font = FONT(30, '800');
  ctx.fillStyle = C.ink;
  ctx.fillText('FLASH', PAD, 46);
  const flashW = ctx.measureText('FLASH').width;
  ctx.font = FONT(17, '600');
  ctx.fillStyle = C.muted;
  ctx.fillText(opponent ? `vs ${opponent}` : 'Game day', PAD + flashW + 12, 46);
  ctx.textAlign = 'right';
  ctx.font = FONT(14, '600');
  ctx.fillText(dateLabel, W - PAD, 46);

  ctx.textAlign = 'left';
  ctx.font = FONT(12, '500');
  ctx.fillStyle = C.muted;
  ctx.fillText(
    `${present.length} players · 8 shifts of 7:30 · subs at 7:30, 15:00, 22:30`,
    PAD,
    68
  );

  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(PAD, 82);
  ctx.lineTo(W - PAD, 82);
  ctx.stroke();

  let y = 96;
  for (let half = 1; half <= HALVES; half += 1) {
    y = drawHalf(ctx, y, half, lineup, nameOf, present);
  }

  ctx.textAlign = 'center';
  ctx.font = FONT(11, '500');
  ctx.fillStyle = C.muted;
  ctx.fillText('Generated by FLASH Game Manager', W / 2, H - 18);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Same information as plain text, for when an image is more than is wanted. */
export function lineupAsText({ lineup, roster, opponent, dateLabel }) {
  const nameOf = Object.fromEntries(roster.map((p) => [p.id, p.name]));
  const present = roster.filter((p) => p.isPresent);
  const out = [`FLASH${opponent ? ` vs ${opponent}` : ''} — ${dateLabel}`, ''];

  for (let s = 0; s < lineup.length; s += 1) {
    const half = s < SHIFTS_PER_HALF ? 1 : 2;
    const at = formatClock((s % SHIFTS_PER_HALF) * SHIFT_MS);
    out.push(`SHIFT ${s + 1} — ${half === 1 ? '1st' : '2nd'} half ${at}`);
    POSITION_IDS.forEach((posId) => {
      out.push(`  ${posId.padEnd(3)} ${cellText(lineup[s], posId, nameOf)}`);
    });
    const resting = benchForShift(lineup, present, s).map((p) => p.name);
    if (resting.length) out.push(`  out: ${resting.join(', ')}`);
    out.push('');
  }
  return out.join('\n');
}
