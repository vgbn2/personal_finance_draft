import { jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
const DEFAULT_HEIGHT = 24;
export const AnsiOutputText = ({ data, availableTerminalHeight, width, maxLines, disableTruncation, }) => {
    const availableHeightLimit = availableTerminalHeight && availableTerminalHeight > 0
        ? availableTerminalHeight
        : undefined;
    const numLinesRetained = availableHeightLimit !== undefined && maxLines !== undefined
        ? Math.min(availableHeightLimit, maxLines)
        : (availableHeightLimit ?? maxLines ?? DEFAULT_HEIGHT);
    const lastLines = disableTruncation ? data : data.slice(-numLinesRetained);
    return (_jsx(Box, { flexDirection: "column", width: width, flexShrink: 0, overflow: "hidden", children: lastLines.map((line, lineIndex) => (_jsx(Box, { height: 1, overflow: "hidden", children: _jsx(AnsiLineText, { line: line }) }, lineIndex))) }));
};
export const AnsiLineText = ({ line }) => (_jsx(Text, { children: line.length > 0
        ? line.map((token, tokenIndex) => (_jsx(Text, { color: token.fg, backgroundColor: token.bg, inverse: token.inverse, dimColor: token.dim, bold: token.bold, italic: token.italic, underline: token.underline, children: token.text }, tokenIndex)))
        : null }));
//# sourceMappingURL=AnsiOutput.js.map