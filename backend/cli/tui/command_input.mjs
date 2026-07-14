import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, useCursor, useInput, useWindowSize } from 'ink';

const h = React.createElement;
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function splitGraphemes(value) {
  const text = String(value || '');
  return segmenter
    ? [...segmenter.segment(text)].map((entry) => entry.segment)
    : Array.from(text);
}

function isFullwidthCodePoint(codePoint) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329 || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

export function displayWidth(value) {
  return splitGraphemes(value).reduce((total, grapheme) => {
    if (!grapheme || /^[\p{Mark}\u200d\ufe0e\ufe0f]+$/u.test(grapheme)) return total;
    if (/\p{Extended_Pictographic}/u.test(grapheme)) return total + 2;
    const codePoint = grapheme.codePointAt(0);
    return total + (isFullwidthCodePoint(codePoint) ? 2 : 1);
  }, 0);
}

export function editCommandValue(value, cursorOffset, input, key = {}) {
  const chars = splitGraphemes(value);
  let cursor = Math.max(0, Math.min(chars.length, Number(cursorOffset) || 0));

  if (key.leftArrow) return { value: chars.join(''), cursorOffset: Math.max(0, cursor - 1) };
  if (key.rightArrow) return { value: chars.join(''), cursorOffset: Math.min(chars.length, cursor + 1) };
  if (key.home) return { value: chars.join(''), cursorOffset: 0 };
  if (key.end) return { value: chars.join(''), cursorOffset: chars.length };
  if (key.backspace) {
    if (cursor > 0) chars.splice(--cursor, 1);
    return { value: chars.join(''), cursorOffset: cursor };
  }
  if (key.delete) {
    if (cursor < chars.length) chars.splice(cursor, 1);
    return { value: chars.join(''), cursorOffset: cursor };
  }
  if (
    key.upArrow || key.downArrow || key.pageUp || key.pageDown || key.tab
    || key.escape || key.return || key.ctrl || key.meta
  ) {
    return { value: chars.join(''), cursorOffset: cursor };
  }

  const inserted = splitGraphemes(input);
  if (inserted.length > 0) {
    chars.splice(cursor, 0, ...inserted);
    cursor += inserted.length;
  }
  return { value: chars.join(''), cursorOffset: cursor };
}

export function commandInputWindow(value, cursorOffset, maxWidth) {
  const chars = splitGraphemes(value);
  const cursor = Math.max(0, Math.min(chars.length, Number(cursorOffset) || 0));
  const width = Math.max(1, Number(maxWidth) || 1);
  let start = 0;

  while (start < cursor && displayWidth(chars.slice(start, cursor).join('')) > width) start += 1;

  let end = start;
  while (end < chars.length) {
    const candidate = chars.slice(start, end + 1).join('');
    if (displayWidth(candidate) > width) break;
    end += 1;
  }

  return {
    text: chars.slice(start, end).join(''),
    cursorColumn: displayWidth(chars.slice(start, cursor).join('')),
    start,
    end,
  };
}

export function CommandInput({ value, onChange, onSubmit, active, cursorY }) {
  const [cursorOffset, setCursorOffset] = useState(() => splitGraphemes(value).length);
  const previousValue = useRef(value);
  const pendingValue = useRef(null);
  const { columns } = useWindowSize();
  const { setCursorPosition } = useCursor();
  const window = useMemo(
    () => commandInputWindow(value, cursorOffset, Math.max(1, columns - 6)),
    [value, cursorOffset, columns],
  );

  useEffect(() => {
    if (value === previousValue.current) return;
    if (value !== pendingValue.current) setCursorOffset(splitGraphemes(value).length);
    previousValue.current = value;
    pendingValue.current = null;
  }, [value]);

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }
    const next = editCommandValue(value, cursorOffset, input, key);
    setCursorOffset(next.cursorOffset);
    if (next.value !== value) {
      pendingValue.current = next.value;
      onChange(next.value);
    }
  }, { isActive: active });

  useEffect(() => {
    if (!process.stdout.isTTY || !active) {
      setCursorPosition(undefined);
      return;
    }
    setCursorPosition({
      x: Math.max(4, Math.min(Math.max(4, columns - 2), 4 + window.cursorColumn)),
      y: Math.max(0, Number(cursorY) || 0),
    });
    return () => setCursorPosition(undefined);
  }, [active, columns, cursorY, setCursorPosition, window.cursorColumn]);

  return h(Text, null, window.text);
}
