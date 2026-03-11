/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SettingScope, isLoadableSettingScope, } from '../config/settings.js';
/**
 * Enables an agent by ensuring it is enabled in any writable scope (User and Workspace).
 * It sets `agents.overrides.<agentName>.enabled` to `true`.
 */
export function enableAgent(settings, agentName) {
    const writableScopes = [SettingScope.Workspace, SettingScope.User];
    const foundInDisabledScopes = [];
    const alreadyEnabledScopes = [];
    for (const scope of writableScopes) {
        if (isLoadableSettingScope(scope)) {
            const scopePath = settings.forScope(scope).path;
            const agentOverrides = settings.forScope(scope).settings.agents?.overrides;
            const isEnabled = agentOverrides?.[agentName]?.enabled === true;
            if (!isEnabled) {
                foundInDisabledScopes.push({ scope, path: scopePath });
            }
            else {
                alreadyEnabledScopes.push({ scope, path: scopePath });
            }
        }
    }
    if (foundInDisabledScopes.length === 0) {
        return {
            status: 'no-op',
            agentName,
            action: 'enable',
            modifiedScopes: [],
            alreadyInStateScopes: alreadyEnabledScopes,
        };
    }
    const modifiedScopes = [];
    for (const { scope, path } of foundInDisabledScopes) {
        if (isLoadableSettingScope(scope)) {
            // Explicitly enable it.
            settings.setValue(scope, `agents.overrides.${agentName}.enabled`, true);
            modifiedScopes.push({ scope, path });
        }
    }
    return {
        status: 'success',
        agentName,
        action: 'enable',
        modifiedScopes,
        alreadyInStateScopes: alreadyEnabledScopes,
    };
}
/**
 * Disables an agent by setting `agents.overrides.<agentName>.enabled` to `false` in the specified scope.
 */
export function disableAgent(settings, agentName, scope) {
    if (!isLoadableSettingScope(scope)) {
        return {
            status: 'error',
            agentName,
            action: 'disable',
            modifiedScopes: [],
            alreadyInStateScopes: [],
            error: `Invalid settings scope: ${scope}`,
        };
    }
    const scopePath = settings.forScope(scope).path;
    const agentOverrides = settings.forScope(scope).settings.agents?.overrides;
    const isEnabled = agentOverrides?.[agentName]?.enabled !== false;
    if (!isEnabled) {
        return {
            status: 'no-op',
            agentName,
            action: 'disable',
            modifiedScopes: [],
            alreadyInStateScopes: [{ scope, path: scopePath }],
        };
    }
    // Check if it's already disabled in the other writable scope
    const otherScope = scope === SettingScope.Workspace
        ? SettingScope.User
        : SettingScope.Workspace;
    const alreadyDisabledInOther = [];
    if (isLoadableSettingScope(otherScope)) {
        const otherOverrides = settings.forScope(otherScope).settings.agents?.overrides;
        if (otherOverrides?.[agentName]?.enabled === false) {
            alreadyDisabledInOther.push({
                scope: otherScope,
                path: settings.forScope(otherScope).path,
            });
        }
    }
    settings.setValue(scope, `agents.overrides.${agentName}.enabled`, false);
    return {
        status: 'success',
        agentName,
        action: 'disable',
        modifiedScopes: [{ scope, path: scopePath }],
        alreadyInStateScopes: alreadyDisabledInOther,
    };
}
//# sourceMappingURL=agentSettings.js.map