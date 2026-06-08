import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore
import { REPO_ROOT } from '../../../shared/lib/paths';

const SETTINGS_PATH = process.env.SOVEREIGN_USER_SETTINGS_PATH
  || path.join(REPO_ROOT, 'storage', 'data', 'user_settings.json');

export function isAgentTradingEnabled(): boolean {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const settings = JSON.parse(raw);
    return Boolean(settings?.feature_flags?.ai_agent_trading);
  } catch {
    return false;
  }
}

export function agentTradingGate(): { allowed: true } | { allowed: false; error: string } {
  if (isAgentTradingEnabled()) return { allowed: true };
  return {
    allowed: false,
    error: 'AI agent trading is disabled. Enable with: sovereign settings flags --flag ai_agent_trading --value true',
  };
}
