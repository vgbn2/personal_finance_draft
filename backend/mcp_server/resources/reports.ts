import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const REPORT_MAP: Record<string, string> = {
  'backtest': path.join(REPO_ROOT, 'storage', 'data', 'backtests', 'latest_backtest.json'),
  'data-quality': path.join(REPO_ROOT, 'storage', 'data', 'cache', 'data_quality_report.json'),
  'model-comparison': path.join(REPO_ROOT, 'storage', 'data', 'models', 'latest_model_comparison.json'),
  'last-fetch': path.join(REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch.json'),
};

export function getReportResource(reportName: string) {
  const filePath = REPORT_MAP[reportName];
  
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      uri: `sovereign://reports/${reportName}`,
      name: `${reportName} report`,
      mimeType: 'application/json',
      text: content,
    };
  } catch (err) {
    return null;
  }
}

export function listReportResources() {
  return Object.keys(REPORT_MAP).map((name) => ({
    uri: `sovereign://reports/${name}`,
    name: `${name} report`,
    description: `Latest ${name.replace('-', ' ')} JSON artifact`,
    mimeType: 'application/json',
  }));
}
