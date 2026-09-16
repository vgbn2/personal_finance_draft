'use strict';

/**
 * Virtual Terminal Screen (VT100 / ANSI Screen Grid Emulator)
 *
 * Accurately parses raw ANSI escape sequences, SGR color codes, cursor
 * positioning, line erasing, and DEC Mode 2026 synchronized update frames.
 * Reconstructs the exact 2D visual screen grid as rendered to a human in a real terminal.
 */

const ANSI_CSI_RE = /\x1b\[([0-9;?]*)([A-Za-z])/g;

class VirtualTerminalScreen {
  constructor(options = {}) {
    this.cols = options.cols || 80;
    this.rows = options.rows || 30;
    this.cursorX = 0;
    this.cursorY = 0;
    this.cursorVisible = true;

    // Active SGR styling
    this.style = {
      fg: null,
      bg: null,
      bold: false,
      dim: false,
      inverse: false,
    };

    // DEC Mode 2026 Synchronized Updates
    this.inSyncUpdate = false;
    this.syncFrames = [];
    this.syncFrameRawBuffers = [];
    this._currentSyncBuffer = '';

    // History of cursor and erase operations
    this.cursorUpMoves = [];
    this.lineClearCount = 0;
    this.displayClearCount = 0;

    this._initGrid();
  }

  _initGrid() {
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this._emptyCell());
      }
      this.grid.push(row);
    }
  }

  _emptyCell() {
    return {
      char: ' ',
      fg: null,
      bg: null,
      bold: false,
      dim: false,
      inverse: false,
    };
  }

  _ensureRow(r) {
    while (this.grid.length <= r) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this._emptyCell());
      }
      this.grid.push(row);
    }
    if (this.grid.length > this.rows) {
      this.rows = this.grid.length;
    }
  }

  /**
   * Feed a chunk of raw terminal stdout data.
   * @param {string|Buffer} chunk
   */
  write(chunk) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (!text) return;

    if (this.inSyncUpdate) {
      this._currentSyncBuffer += text;
    }

    let i = 0;
    const len = text.length;

    while (i < len) {
      const char = text[i];

      // Escape sequence start
      if (char === '\x1b') {
        if (text[i + 1] === '[') {
          // CSI Sequence \x1b[ ... <cmd>
          let j = i + 2;
          while (j < len && !/[A-Za-z~]/.test(text[j])) {
            j++;
          }
          if (j < len) {
            const rawParams = text.slice(i + 2, j);
            const cmd = text[j];
            this._handleCsi(rawParams, cmd);
            i = j + 1;
            continue;
          }
        }
        // Bare ESC or unknown sequence
        i++;
        continue;
      }

      // Control characters
      if (char === '\r') {
        this.cursorX = 0;
        i++;
        continue;
      }
      if (char === '\n') {
        // Standard terminal ONLCR behavior (map NL to CR+NL)
        this.cursorX = 0;
        this.cursorY++;
        this._ensureRow(this.cursorY);
        i++;
        continue;
      }
      if (char === '\b') {
        this.cursorX = Math.max(0, this.cursorX - 1);
        i++;
        continue;
      }
      if (char === '\t') {
        // Tab advance to multiple of 8
        this.cursorX = Math.min(this.cols - 1, (Math.floor(this.cursorX / 8) + 1) * 8);
        i++;
        continue;
      }

      // Printable character
      this._ensureRow(this.cursorY);
      if (this.cursorX >= this.cols) {
        // Line wrap
        this.cursorX = 0;
        this.cursorY++;
        this._ensureRow(this.cursorY);
      }

      this.grid[this.cursorY][this.cursorX] = {
        char,
        fg: this.style.fg,
        bg: this.style.bg,
        bold: this.style.bold,
        dim: this.style.dim,
        inverse: this.style.inverse,
      };

      this.cursorX++;
      i++;
    }
  }

  _handleCsi(params, cmd) {
    // DEC Mode 2026 Synchronized Update (BSU / ESU)
    if (params === '?2026') {
      if (cmd === 'h') {
        this.inSyncUpdate = true;
        this._currentSyncBuffer = '';
        return;
      }
      if (cmd === 'l') {
        this.inSyncUpdate = false;
        this.syncFrames.push(this.getVisualScreen());
        this.syncFrameRawBuffers.push(this._currentSyncBuffer);
        this._currentSyncBuffer = '';
        return;
      }
    }

    // Cursor visibility
    if (params === '?25') {
      if (cmd === 'l') this.cursorVisible = false;
      if (cmd === 'h') this.cursorVisible = true;
      return;
    }

    // Cursor Movement
    if (cmd === 'A') { // Up
      const n = parseInt(params, 10) || 1;
      this.cursorUpMoves.push(n);
      this.cursorY = Math.max(0, this.cursorY - n);
      return;
    }
    if (cmd === 'B') { // Down
      const n = parseInt(params, 10) || 1;
      this.cursorY += n;
      this._ensureRow(this.cursorY);
      return;
    }
    if (cmd === 'C') { // Forward / Right
      const n = parseInt(params, 10) || 1;
      this.cursorX = Math.min(this.cols - 1, this.cursorX + n);
      return;
    }
    if (cmd === 'D') { // Back / Left
      const n = parseInt(params, 10) || 1;
      this.cursorX = Math.max(0, this.cursorX - n);
      return;
    }
    if (cmd === 'G') { // Absolute Column (1-indexed)
      const col = parseInt(params, 10) || 1;
      this.cursorX = Math.max(0, Math.min(this.cols - 1, col - 1));
      return;
    }
    if (cmd === 'H' || cmd === 'f') { // Position row;col (1-indexed)
      const parts = params.split(';');
      const r = (parseInt(parts[0], 10) || 1) - 1;
      const c = (parseInt(parts[1], 10) || 1) - 1;
      this.cursorY = Math.max(0, r);
      this._ensureRow(this.cursorY);
      this.cursorX = Math.max(0, Math.min(this.cols - 1, c));
      return;
    }

    // Erase in Display (\x1b[J)
    if (cmd === 'J') {
      this.displayClearCount++;
      const mode = parseInt(params, 10) || 0;
      if (mode === 0) {
        // Erase from cursor to end of screen
        for (let c = this.cursorX; c < this.cols; c++) {
          if (this.grid[this.cursorY]) this.grid[this.cursorY][c] = this._emptyCell();
        }
        for (let r = this.cursorY + 1; r < this.grid.length; r++) {
          for (let c = 0; c < this.cols; c++) {
            this.grid[r][c] = this._emptyCell();
          }
        }
      } else if (mode === 2) {
        // Erase all
        this._initGrid();
        this.cursorX = 0;
        this.cursorY = 0;
      }
      return;
    }

    // Erase in Line (\x1b[K)
    if (cmd === 'K') {
      this.lineClearCount++;
      const mode = parseInt(params, 10) || 0;
      this._ensureRow(this.cursorY);
      if (mode === 0) {
        // Erase from cursor to end of line
        for (let c = this.cursorX; c < this.cols; c++) {
          this.grid[this.cursorY][c] = this._emptyCell();
        }
      } else if (mode === 2) {
        // Erase entire line
        for (let c = 0; c < this.cols; c++) {
          this.grid[this.cursorY][c] = this._emptyCell();
        }
      }
      return;
    }

    // Select Graphic Rendition (SGR colors & styles)
    if (cmd === 'm') {
      this._handleSgr(params);
      return;
    }
  }

  _handleSgr(params) {
    if (!params || params === '0') {
      this.style = { fg: null, bg: null, bold: false, dim: false, inverse: false };
      return;
    }

    const codes = params.split(';').map(s => parseInt(s, 10) || 0);
    for (let k = 0; k < codes.length; k++) {
      const code = codes[k];
      if (code === 0) {
        this.style = { fg: null, bg: null, bold: false, dim: false, inverse: false };
      } else if (code === 1) {
        this.style.bold = true;
      } else if (code === 2) {
        this.style.dim = true;
      } else if (code === 7) {
        this.style.inverse = true;
      } else if (code === 27) {
        this.style.inverse = false;
      } else if (code >= 30 && code <= 37) {
        const colorNames = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
        this.style.fg = colorNames[code - 30];
      } else if (code === 39) {
        this.style.fg = null;
      } else if (code >= 40 && code <= 47) {
        const colorNames = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
        this.style.bg = colorNames[code - 40];
      } else if (code === 49) {
        this.style.bg = null;
      } else if (code >= 90 && code <= 97) {
        const colorNames = ['bright_black', 'bright_red', 'bright_green', 'bright_yellow', 'bright_blue', 'bright_magenta', 'bright_cyan', 'bright_white'];
        this.style.fg = colorNames[code - 90];
      } else if (code >= 100 && code <= 107) {
        const colorNames = ['bright_black', 'bright_red', 'bright_green', 'bright_yellow', 'bright_blue', 'bright_magenta', 'bright_cyan', 'bright_white'];
        this.style.bg = colorNames[code - 100];
      }
    }
  }

  /**
   * Returns clean plain text string for a visual line, trimming trailing whitespace.
   */
  getVisualLine(row) {
    if (row < 0 || row >= this.grid.length) return '';
    const lineChars = this.grid[row].map(cell => cell.char).join('');
    return lineChars.replace(/\s+$/, '');
  }

  /**
   * Returns full visual screen text (multi-line string).
   */
  getVisualScreen() {
    const lines = [];
    for (let r = 0; r < this.grid.length; r++) {
      lines.push(this.getVisualLine(r));
    }
    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines.join('\n');
  }

  /**
   * Get specific visual cell with styling metadata.
   */
  getCell(row, col) {
    if (row < 0 || row >= this.grid.length) return null;
    if (col < 0 || col >= this.cols) return null;
    return this.grid[row][col];
  }

  /**
   * Check if a visual row contains a selected item pointer ('>') or highlight styling.
   */
  isRowHighlighted(row) {
    if (row < 0 || row >= this.grid.length) return false;
    const text = this.getVisualLine(row);
    if (/^\s*>\s+/.test(text)) return true;
    return this.grid[row].some(cell => cell.inverse || (cell.fg && cell.fg.includes('cyan')));
  }

  /**
   * Find row index matching regex.
   */
  findRowIndex(regex) {
    for (let r = 0; r < this.grid.length; r++) {
      const line = this.getVisualLine(r);
      if (regex.test(line)) return r;
    }
    return -1;
  }
}

module.exports = {
  VirtualTerminalScreen,
};
