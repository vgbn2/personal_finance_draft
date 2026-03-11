/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { configureAllExtensions, configureExtension, configureSpecificSetting, getExtensionManager, } from './utils.js';
import { loadSettings } from '../../config/settings.js';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
export const configureCommand = {
    command: 'config [name] [setting]',
    describe: 'Configure extension settings.',
    builder: (yargs) => yargs
        .positional('name', {
        describe: 'Name of the extension to configure.',
        type: 'string',
    })
        .positional('setting', {
        describe: 'The specific setting to configure (name or env var).',
        type: 'string',
    })
        .option('scope', {
        describe: 'The scope to set the setting in.',
        type: 'string',
        choices: ['user', 'workspace'],
        default: 'user',
    }),
    handler: async (args) => {
        const { name, setting, scope } = args;
        const settings = loadSettings(process.cwd()).merged;
        if (!(settings.experimental?.extensionConfig ?? true)) {
            coreEvents.emitFeedback('error', 'Extension configuration is currently disabled. Enable it by setting "experimental.extensionConfig" to true.');
            await exitCli();
            return;
        }
        if (name) {
            if (name.includes('/') || name.includes('\\') || name.includes('..')) {
                debugLogger.error('Invalid extension name. Names cannot contain path separators or "..".');
                return;
            }
        }
        const extensionManager = await getExtensionManager();
        // Case 1: Configure specific setting for an extension
        if (name && setting) {
            await configureSpecificSetting(extensionManager, name, setting, 
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            scope);
        }
        // Case 2: Configure all settings for an extension
        else if (name) {
            await configureExtension(extensionManager, name, 
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            scope);
        }
        // Case 3: Configure all extensions
        else {
            await configureAllExtensions(extensionManager, 
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            scope);
        }
        await exitCli();
    },
};
//# sourceMappingURL=configure.js.map