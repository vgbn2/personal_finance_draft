// Centralized terminal escape codes and raw-mode key codes.
//
// ANSI escape codes are byte sequences that terminals interpret as commands
// instead of printable text. Keep this file ASCII-only so terminal UI code can
// avoid scattered literal escape bytes and Unicode glyphs.

const ESC = '\u001b';

// Text styles
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const BLINK = `${ESC}[5m`;

// Foreground colors
const GRAY = `${ESC}[90m`;
const RED = `${ESC}[31m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const BLUE = `${ESC}[34m`;
const CYAN = `${ESC}[36m`;
const WHITE = `${ESC}[37m`;

// Bold foreground colors
const B_RED = `${ESC}[1;31m`;
const B_GREEN = `${ESC}[1;32m`;
const B_YELLOW = `${ESC}[1;33m`;
const B_BLUE = `${ESC}[1;34m`;
const B_MAGENTA = `${ESC}[1;35m`;
const B_CYAN = `${ESC}[1;36m`;
const B_WHITE = `${ESC}[1;37m`;

// Cursor and screen control
const CUR_SAVE = `${ESC}[s`;
const CUR_RESTORE = `${ESC}[u`;
const CUR_HIDE = `${ESC}[?25l`;
const CUR_SHOW = `${ESC}[?25h`;
const CLR_LINE = `${ESC}[K`;
const ERASE_LINE = `${ESC}[2K`;
const CLR_DOWN = `${ESC}[J`;
const CLR_ALL = `${ESC}[2J`;
const HOME = `${ESC}[0;0H`;

// Raw-mode key codes
const KEY_CTRL_C = '\u0003';
const KEY_ESC = ESC;
const KEY_BS = '\u007f';
const KEY_TAB = '\u0009';
const KEY_UP = `${ESC}[A`;
const KEY_DOWN = `${ESC}[B`;
const KEY_RIGHT = `${ESC}[C`;
const KEY_LEFT = `${ESC}[D`;

// ASCII UI glyphs. Prefer these over terminal-specific Unicode symbols.
const GLYPH = {
  pointer: '>',
  selected: '[x]',
  partial: '[-]',
  empty: '[ ]',
  hline: '-',
  vline: '|',
  corner: '+',
  block: '#',
  marker: '^',
  pair: '<->',
  warning: '!',
};

function c(code, text) {
  return code + text + RESET;
}

function bold(text) {
  return c(BOLD, text);
}

function muted(text) {
  return c(GRAY, text);
}

function statusColor(status) {
  if (status === 'ok' || status === 'available' || status === true) return GREEN;
  if (status === 'warn' || status === 'warning') return YELLOW;
  return RED;
}

function status(status, text = String(status)) {
  return c(statusColor(status), text);
}

module.exports = {
  ESC,
  RESET,
  BOLD,
  DIM,
  BLINK,
  GRAY,
  RED,
  GREEN,
  YELLOW,
  BLUE,
  CYAN,
  WHITE,
  B_RED,
  B_GREEN,
  B_YELLOW,
  B_BLUE,
  B_MAGENTA,
  B_CYAN,
  B_WHITE,
  CUR_SAVE,
  CUR_RESTORE,
  CUR_HIDE,
  CUR_SHOW,
  CLR_LINE,
  ERASE_LINE,
  CLR_DOWN,
  CLR_ALL,
  HOME,
  KEY_CTRL_C,
  KEY_ESC,
  KEY_BS,
  KEY_TAB,
  KEY_UP,
  KEY_DOWN,
  KEY_RIGHT,
  KEY_LEFT,
  GLYPH,
  c,
  bold,
  muted,
  status,
  statusColor,
};
