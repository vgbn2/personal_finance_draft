'use strict';

// W1 — Spinner for loading commands
//
// API:  startSpinner(label) → { stop(finalText?) }
//
// TTY mode:   ticks a frame set at 100-120ms on \r, clears line with CLR_LINE.
//             Timer is unref()'d so it never keeps the process alive.
//             stop(finalText) clears the line or writes finalText + newline.
//
// Non-TTY:    prints "> label..." once (no timer) and returns an inert handle.
//             Non-TTY is defined as: !process.stdout.isTTY OR --json/--verbose
//             in process.argv.  The intersection.js caller also performs its
//             own headless check, but spinner guards defensively too.
//
// Frame sets:
//   ASCII (default):  [ '|', '/', '-', '\\' ]
//   Rich (Braille):   [ '⣾','⣽','⣻','⢿','⡿','⣟','⣯','⣷' ]
//   Rich is selected only when isRichTerminal() returns true.

const A = require('../../../shared/lib/ui/ansi');
const { isRichTerminal } = require('./engine/engine');

const ASCII_FRAMES   = ['|', '/', '-', '\\'];
const BRAILLE_FRAMES = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];

const INTERVAL_MS = 100; // within the 100-120ms range in the spec

/**
 * Returns true when spinner animation should be suppressed.
 * Suppressed when: not a TTY, or --json / --verbose is in argv.
 */
function _isHeadless() {
  if (!process.stdout.isTTY) return true;
  const argv = process.argv;
  return argv.includes('--json') || argv.includes('--verbose');
}

/**
 * startSpinner(label[, _opts]) → handle
 *
 * @param {string} label          Text to show next to the spinning frame.
 * @param {{ _stream?: NodeJS.WriteStream }} [_opts]  Internal; used by tests.
 * @returns {{ stop(finalText?: string): void }}
 */
function startSpinner(label, _opts) {
  const out = (_opts && _opts._stream) || process.stdout;

  if (_isHeadless()) {
    // Non-TTY: single static line, inert handle
    out.write(`${A.GLYPH.pointer} ${label}...\n`);
    return {
      stop(finalText) {
        if (finalText) out.write(`${finalText}\n`);
      }
    };
  }

  const frames = isRichTerminal() ? BRAILLE_FRAMES : ASCII_FRAMES;
  let idx = 0;
  let stopped = false;

  // Initial paint
  out.write(`\r${frames[idx]}  ${label}...${A.CLR_LINE}`);

  const timer = setInterval(() => {
    if (stopped) return;
    idx = (idx + 1) % frames.length;
    out.write(`\r${frames[idx]}  ${label}...${A.CLR_LINE}`);
  }, INTERVAL_MS);

  // Unref so the timer never prevents the process from exiting naturally
  if (timer.unref) timer.unref();

  return {
    stop(finalText) {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (finalText) {
        out.write(`\r${finalText}${A.CLR_LINE}\n`);
      } else {
        // Clear the spinner line
        out.write(`\r${A.CLR_LINE}`);
      }
    }
  };
}

module.exports = { startSpinner };
