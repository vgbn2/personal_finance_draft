import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { checkExhaustive } from '@google/gemini-cli-core';
const ChecklistStatusDisplay = ({ status, }) => {
    switch (status) {
        case 'completed':
            return (_jsx(Text, { color: theme.status.success, "aria-label": "Completed", children: "\u2713" }));
        case 'in_progress':
            return (_jsx(Text, { color: theme.text.accent, "aria-label": "In Progress", children: "\u00BB" }));
        case 'pending':
            return (_jsx(Text, { color: theme.text.secondary, "aria-label": "Pending", children: "\u2610" }));
        case 'cancelled':
            return (_jsx(Text, { color: theme.status.error, "aria-label": "Cancelled", children: "\u2717" }));
        default:
            checkExhaustive(status);
    }
};
export const ChecklistItem = ({ item, wrap, role: ariaRole, }) => {
    const textColor = (() => {
        switch (item.status) {
            case 'in_progress':
                return theme.text.accent;
            case 'completed':
            case 'cancelled':
                return theme.text.secondary;
            case 'pending':
                return theme.text.primary;
            default:
                checkExhaustive(item.status);
        }
    })();
    const strikethrough = item.status === 'cancelled';
    return (_jsxs(Box, { flexDirection: "row", columnGap: 1, "aria-role": ariaRole, children: [_jsx(ChecklistStatusDisplay, { status: item.status }), _jsx(Box, { flexShrink: 1, children: _jsx(Text, { color: textColor, wrap: wrap, strikethrough: strikethrough, children: item.label }) })] }));
};
//# sourceMappingURL=ChecklistItem.js.map