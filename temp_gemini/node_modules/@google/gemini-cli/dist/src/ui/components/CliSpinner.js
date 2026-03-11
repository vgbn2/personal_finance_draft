import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import Spinner from 'ink-spinner';
import { useEffect } from 'react';
import { debugState } from '../debug.js';
import { useSettings } from '../contexts/SettingsContext.js';
export const CliSpinner = (props) => {
    const settings = useSettings();
    const shouldShow = settings.merged.ui?.showSpinner !== false;
    useEffect(() => {
        if (shouldShow) {
            debugState.debugNumAnimatedComponents++;
            return () => {
                debugState.debugNumAnimatedComponents--;
            };
        }
        return undefined;
    }, [shouldShow]);
    if (!shouldShow) {
        return null;
    }
    return _jsx(Spinner, { ...props });
};
//# sourceMappingURL=CliSpinner.js.map