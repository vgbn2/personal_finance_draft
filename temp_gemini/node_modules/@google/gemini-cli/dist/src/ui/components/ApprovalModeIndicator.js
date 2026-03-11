import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { ApprovalMode } from '@google/gemini-cli-core';
export const APPROVAL_MODE_TEXT = {
    AUTO_EDIT: 'auto-accept edits',
    PLAN: 'plan',
    YOLO: 'YOLO',
    HINT_SWITCH_TO_PLAN_MODE: 'shift+tab to plan',
    HINT_SWITCH_TO_MANUAL_MODE: 'shift+tab to manual',
    HINT_SWITCH_TO_AUTO_EDIT_MODE: 'shift+tab to accept edits',
    HINT_SWITCH_TO_YOLO_MODE: 'ctrl+y',
};
export const ApprovalModeIndicator = ({ approvalMode, allowPlanMode, }) => {
    let textColor = '';
    let textContent = '';
    let subText = '';
    switch (approvalMode) {
        case ApprovalMode.AUTO_EDIT:
            textColor = theme.status.warning;
            textContent = APPROVAL_MODE_TEXT.AUTO_EDIT;
            subText = allowPlanMode
                ? APPROVAL_MODE_TEXT.HINT_SWITCH_TO_PLAN_MODE
                : APPROVAL_MODE_TEXT.HINT_SWITCH_TO_MANUAL_MODE;
            break;
        case ApprovalMode.PLAN:
            textColor = theme.status.success;
            textContent = APPROVAL_MODE_TEXT.PLAN;
            subText = APPROVAL_MODE_TEXT.HINT_SWITCH_TO_MANUAL_MODE;
            break;
        case ApprovalMode.YOLO:
            textColor = theme.status.error;
            textContent = APPROVAL_MODE_TEXT.YOLO;
            subText = APPROVAL_MODE_TEXT.HINT_SWITCH_TO_YOLO_MODE;
            break;
        case ApprovalMode.DEFAULT:
        default:
            textColor = theme.text.accent;
            textContent = '';
            subText = APPROVAL_MODE_TEXT.HINT_SWITCH_TO_AUTO_EDIT_MODE;
            break;
    }
    return (_jsx(Box, { children: _jsxs(Text, { color: textColor, children: [textContent ? textContent : null, subText ? (_jsxs(Text, { color: theme.text.secondary, children: [textContent ? ' ' : '', subText] })) : null] }) }));
};
//# sourceMappingURL=ApprovalModeIndicator.js.map