import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useMemo } from 'react';
import { ChecklistItem } from './ChecklistItem.js';
const ChecklistTitleDisplay = ({ title, items, toggleHint }) => {
    const score = useMemo(() => {
        let total = 0;
        let completed = 0;
        for (const item of items) {
            if (item.status !== 'cancelled') {
                total += 1;
                if (item.status === 'completed') {
                    completed += 1;
                }
            }
        }
        return `${completed}/${total} completed`;
    }, [items]);
    return (_jsxs(Box, { flexDirection: "row", columnGap: 2, height: 1, children: [_jsx(Text, { color: theme.text.primary, bold: true, "aria-label": `${title} list`, children: title }), _jsxs(Text, { color: theme.text.secondary, children: [score, toggleHint ? ` (${toggleHint})` : ''] })] }));
};
const ChecklistListDisplay = ({ items, }) => (_jsx(Box, { flexDirection: "column", "aria-role": "list", children: items.map((item, index) => (_jsx(ChecklistItem, { item: item, role: "listitem" }, `${index}-${item.label}`))) }));
export const Checklist = ({ title, items, isExpanded, toggleHint, }) => {
    const inProgress = useMemo(() => items.find((item) => item.status === 'in_progress') || null, [items]);
    const hasActiveItems = useMemo(() => items.some((item) => item.status === 'pending' || item.status === 'in_progress'), [items]);
    if (items.length === 0 || (!isExpanded && !hasActiveItems)) {
        return null;
    }
    return (_jsx(Box, { borderStyle: "single", borderBottom: false, borderRight: false, borderLeft: false, borderColor: theme.border.default, paddingLeft: 1, paddingRight: 1, children: isExpanded ? (_jsxs(Box, { flexDirection: "column", rowGap: 1, children: [_jsx(ChecklistTitleDisplay, { title: title, items: items, toggleHint: toggleHint }), _jsx(ChecklistListDisplay, { items: items })] })) : (_jsxs(Box, { flexDirection: "row", columnGap: 1, height: 1, children: [_jsx(Box, { flexShrink: 0, flexGrow: 0, children: _jsx(ChecklistTitleDisplay, { title: title, items: items, toggleHint: toggleHint }) }), inProgress && (_jsx(Box, { flexShrink: 1, flexGrow: 1, children: _jsx(ChecklistItem, { item: inProgress, wrap: "truncate" }) }))] })) }));
};
//# sourceMappingURL=Checklist.js.map