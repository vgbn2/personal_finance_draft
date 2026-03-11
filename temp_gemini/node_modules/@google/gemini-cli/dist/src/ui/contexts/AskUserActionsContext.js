import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo } from 'react';
export const AskUserActionsContext = createContext(null);
export const useAskUserActions = () => {
    const context = useContext(AskUserActionsContext);
    if (!context) {
        throw new Error('useAskUserActions must be used within an AskUserActionsProvider');
    }
    return context;
};
/**
 * Provides ask_user dialog state and actions to child components.
 *
 * State is managed by AppContainer (which subscribes to the message bus)
 * and passed here as props. This follows the same pattern as ToolActionsProvider.
 */
export const AskUserActionsProvider = ({ children, request, onSubmit, onCancel, }) => {
    const value = useMemo(() => ({
        request,
        submit: onSubmit,
        cancel: onCancel,
    }), [request, onSubmit, onCancel]);
    return (_jsx(AskUserActionsContext.Provider, { value: value, children: children }));
};
//# sourceMappingURL=AskUserActionsContext.js.map