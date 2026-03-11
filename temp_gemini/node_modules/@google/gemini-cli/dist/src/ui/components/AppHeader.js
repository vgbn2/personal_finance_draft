import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box } from 'ink';
import { Header } from './Header.js';
import { Tips } from './Tips.js';
import { UserIdentity } from './UserIdentity.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { Banner } from './Banner.js';
import { useBanner } from '../hooks/useBanner.js';
import { useTips } from '../hooks/useTips.js';
export const AppHeader = ({ version, showDetails = true }) => {
    const settings = useSettings();
    const config = useConfig();
    const { nightly, terminalWidth, bannerData, bannerVisible } = useUIState();
    const { bannerText } = useBanner(bannerData);
    const { showTips } = useTips();
    if (!showDetails) {
        return (_jsx(Box, { flexDirection: "column", children: _jsx(Header, { version: version, nightly: false }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", children: [!(settings.merged.ui.hideBanner || config.getScreenReader()) && (_jsxs(_Fragment, { children: [_jsx(Header, { version: version, nightly: nightly }), bannerVisible && bannerText && (_jsx(Banner, { width: terminalWidth, bannerText: bannerText, isWarning: bannerData.warningText !== '' }))] })), settings.merged.ui.showUserIdentity !== false && (_jsx(UserIdentity, { config: config })), !(settings.merged.ui.hideTips || config.getScreenReader()) &&
                showTips && _jsx(Tips, { config: config })] }));
};
//# sourceMappingURL=AppHeader.js.map