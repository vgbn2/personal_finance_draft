import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { configureExtension, configureSpecificSetting, configureAllExtensions, } from '../../commands/extensions/utils.js';
import { ExtensionSettingScope, } from '../../config/extensions/extensionSettings.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { DialogFooter } from './shared/DialogFooter.js';
import { useKeypress } from '../hooks/useKeypress.js';
export const ConfigExtensionDialog = ({ extensionManager, onClose, extensionName, settingKey, scope = ExtensionSettingScope.USER, configureAll, loggerAdapter, }) => {
    const [state, setState] = useState({ type: 'IDLE' });
    const [logMessages, setLogMessages] = useState([]);
    // Buffers for input
    const settingBuffer = useTextBuffer({
        initialText: '',
        viewport: { width: 80, height: 1 },
        singleLine: true,
        escapePastedPaths: true,
    });
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const addLog = useCallback((msg) => {
        setLogMessages((prev) => [...prev, msg].slice(-5)); // Keep last 5
        loggerAdapter.log(msg);
    }, [loggerAdapter]);
    const requestSetting = useCallback(async (setting) => new Promise((resolve) => {
        if (!mounted.current)
            return;
        settingBuffer.setText(''); // Clear buffer
        setState({
            type: 'ASK_SETTING',
            setting,
            resolve: (val) => {
                resolve(val);
                setState({ type: 'BUSY', message: 'Updating...' });
            },
        });
    }), [settingBuffer]);
    const requestConfirmation = useCallback(async (message) => new Promise((resolve) => {
        if (!mounted.current)
            return;
        setState({
            type: 'ASK_CONFIRMATION',
            message,
            resolve: (val) => {
                resolve(val);
                setState({ type: 'BUSY', message: 'Processing...' });
            },
        });
    }), []);
    useEffect(() => {
        async function run() {
            try {
                setState({ type: 'BUSY', message: 'Initializing...' });
                // Wrap logger to capture logs locally too
                const localLogger = {
                    log: (msg) => {
                        addLog(msg);
                    },
                    error: (msg) => {
                        addLog('Error: ' + msg);
                        loggerAdapter.error(msg);
                    },
                };
                if (configureAll) {
                    await configureAllExtensions(extensionManager, scope, localLogger, requestSetting, requestConfirmation);
                }
                else if (extensionName && settingKey) {
                    await configureSpecificSetting(extensionManager, extensionName, settingKey, scope, localLogger, requestSetting);
                }
                else if (extensionName) {
                    await configureExtension(extensionManager, extensionName, scope, localLogger, requestSetting, requestConfirmation);
                }
                if (mounted.current) {
                    setState({ type: 'DONE' });
                    // Delay close slightly to show done
                    setTimeout(onClose, 1000);
                }
            }
            catch (err) {
                if (mounted.current) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    setState({ type: 'ERROR', error });
                    loggerAdapter.error(error.message);
                }
            }
        }
        // Only run once
        if (state.type === 'IDLE') {
            void run();
        }
    }, [
        extensionManager,
        extensionName,
        settingKey,
        scope,
        configureAll,
        loggerAdapter,
        requestSetting,
        requestConfirmation,
        addLog,
        onClose,
        state.type,
    ]);
    // Handle Input Submission
    const handleSettingSubmit = (val) => {
        if (state.type === 'ASK_SETTING') {
            state.resolve(val);
        }
    };
    // Handle Keys for Confirmation
    useKeypress((key) => {
        if (state.type === 'ASK_CONFIRMATION') {
            if (key.name === 'y' || key.name === 'return') {
                state.resolve(true);
                return true;
            }
            if (key.name === 'n' || key.name === 'escape') {
                state.resolve(false);
                return true;
            }
        }
        if (state.type === 'DONE' || state.type === 'ERROR') {
            if (key.name === 'return' || key.name === 'escape') {
                onClose();
                return true;
            }
        }
        return false;
    }, {
        isActive: state.type === 'ASK_CONFIRMATION' ||
            state.type === 'DONE' ||
            state.type === 'ERROR',
    });
    if (state.type === 'BUSY' || state.type === 'IDLE') {
        return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: theme.border.default, paddingX: 1, children: [_jsx(Text, { color: theme.text.secondary, children: state.type === 'BUSY' ? state.message : 'Starting...' }), logMessages.map((msg, i) => (_jsx(Text, { children: msg }, i)))] }));
    }
    if (state.type === 'ASK_SETTING') {
        return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: theme.border.default, paddingX: 1, children: [_jsxs(Text, { bold: true, color: theme.text.primary, children: ["Configure ", state.setting.name] }), _jsx(Text, { color: theme.text.secondary, children: state.setting.description || state.setting.envVar }), _jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { color: theme.text.accent, children: '> ' }), _jsx(TextInput, { buffer: settingBuffer, onSubmit: handleSettingSubmit, focus: true, placeholder: `Enter value for ${state.setting.name}` })] }), _jsx(DialogFooter, { primaryAction: "Enter to submit" })] }));
    }
    if (state.type === 'ASK_CONFIRMATION') {
        return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: theme.border.default, paddingX: 1, children: [_jsx(Text, { color: theme.status.warning, bold: true, children: "Confirmation Required" }), _jsx(Text, { children: state.message }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: theme.text.secondary, children: ["Press", ' ', _jsx(Text, { color: theme.text.accent, bold: true, children: "Y" }), ' ', "to confirm or", ' ', _jsx(Text, { color: theme.text.accent, bold: true, children: "N" }), ' ', "to cancel"] }) })] }));
    }
    if (state.type === 'ERROR') {
        return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: theme.status.error, paddingX: 1, children: [_jsx(Text, { color: theme.status.error, bold: true, children: "Error" }), _jsx(Text, { children: state.error.message }), _jsx(DialogFooter, { primaryAction: "Enter to close" })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: theme.status.success, paddingX: 1, children: [_jsx(Text, { color: theme.status.success, bold: true, children: "Configuration Complete" }), _jsx(DialogFooter, { primaryAction: "Enter to close" })] }));
};
//# sourceMappingURL=ConfigExtensionDialog.js.map