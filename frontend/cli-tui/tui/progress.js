'use strict';

// W5 — Progress bar utility
//
// API:  createProgress(label, total[, _opts]) → { tick(n?, note?), done() }
//
// TTY mode:   renders  \r[####....] 42% label (note)  on a single line.
//             Paints are throttled: no repaint sooner than 100ms after the last.
//             Bar fill:  ASCII '#' / '.' (default)
//                        Unicode '█' / '░' behind isRichTerminal() gate.
//             done() forces a final 100% repaint and moves to a new line.
//
// Non-TTY:    no ANSI, no \r.  Prints a plain text milestone at 25%, 50%,
//             75%, and 100% of total (each milestone fires at most once).
//
// Constraints honoured:
//   - Never emits ESC[s / ESC[u (CUR_SAVE / CUR_RESTORE).
//   - All ANSI codes come from shared/lib/ui/ansi.js.
//   - Non-TTY check: !process.stdout.isTTY OR --json/--verbose in argv.

const A = require('../../../shared/lib/ui/ansi');
const { isRichTerminal } = require('./engine/engine');

const THROTTLE_MS  = 100;
const BAR_WIDTH    = 20; // visual characters for the fill bar

const ASCII_FILL   = '#';
const ASCII_EMPTY  = '.';
const RICH_FILL    = '█';
const RICH_EMPTY   = '░';

const MILESTONES   = [25, 50, 75, 100]; // percent thresholds for non-TTY output

/**
 * Returns true when progress animation should be suppressed.
 */
function _isHeadless() {
  if (!process.stdout.isTTY) return true;
  const argv = process.argv;
  return argv.includes('--json') || argv.includes('--verbose');
}

/**
 * Render a single progress line string (no newline).
 * @param {number} current  Items completed so far.
 * @param {number} total    Total items.
 * @param {string} label    Label text.
 * @param {string|undefined} note  Optional note appended in parentheses.
 * @returns {string}
 */
function _renderLine(current, total, label, note) {
  const pct = total > 0 ? Math.min(100, Math.floor((current / total) * 100)) : 0;
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const empty  = BAR_WIDTH - filled;

  const fillChar  = isRichTerminal() ? RICH_FILL : ASCII_FILL;
  const emptyChar = isRichTerminal() ? RICH_EMPTY : ASCII_EMPTY;

  const bar    = fillChar.repeat(filled) + emptyChar.repeat(empty);
  const pctStr = String(pct).padStart(3, ' ') + '%';
  const noteStr = note ? ` (${note})` : '';

  return `\r[${bar}] ${pctStr} ${label}${noteStr}${A.CLR_LINE}`;
}

/**
 * createProgress(label, total[, _opts]) → { tick(n?, note?), done() }
 *
 * @param {string} label   Descriptive label shown beside the bar.
 * @param {number} total   Total number of work units.
 * @param {{ _stream?: NodeJS.WriteStream }} [_opts]  Internal; used by tests.
 * @returns {{ tick(n?: number, note?: string): void, done(): void }}
 */
function createProgress(label, total, _opts) {
  const out      = (_opts && _opts._stream) || process.stdout;
  const headless = _isHeadless();
  let current    = 0;
  let lastPaint  = 0; // timestamp of last TTY repaint
  let finished   = false;

  // Non-TTY: milestone tracking
  const firedMilestones = new Set();

  function _paintTTY(force, note) {
    if (finished && !force) return;
    const now = Date.now();
    if (!force && (now - lastPaint) < THROTTLE_MS) return;
    out.write(_renderLine(current, total, label, note));
    lastPaint = now;
  }

  function _checkMilestones(note) {
    const pct = total > 0 ? Math.floor((current / total) * 100) : 0;
    for (const m of MILESTONES) {
      if (!firedMilestones.has(m) && pct >= m) {
        firedMilestones.add(m);
        const noteStr = note ? ` (${note})` : '';
        out.write(`${label}: ${m}%${noteStr}\n`);
      }
    }
  }

  return {
    /**
     * Advance the progress counter.
     * @param {number} [n=1]   Number of units completed.
     * @param {string} [note]  Optional annotation shown this tick.
     */
    tick(n = 1, note) {
      if (finished) return;
      current = Math.min(total, current + n);
      if (headless) {
        _checkMilestones(note);
      } else {
        // Re-render immediately when a note is provided; otherwise throttle.
        _paintTTY(!!note, note);
      }
    },

    /**
     * Mark as complete: force final 100% repaint (TTY) or fire the 100%
     * milestone (non-TTY), then move to a new line.
     */
    done() {
      if (finished) return;
      finished = true;
      current = total;
      if (headless) {
        _checkMilestones();
      } else {
        out.write(_renderLine(total, total, label));
        out.write('\n');
      }
    }
  };
}

module.exports = { createProgress };
