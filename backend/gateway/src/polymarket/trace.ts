import * as fs from 'node:fs';

export function csvSplit(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

export function parseCsvTable(text: string): Array<Record<string, string>> {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const headers = csvSplit(lines[0]).map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = csvSplit(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] || '').trim();
    });
    return row;
  });
}

function normalizeAddress(value: any): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase();
}

export interface TraceSummary {
  rootAddress: string;
  rowCount: number;
  inflowCount: number;
  outflowCount: number;
  upstream: any[];
  downstream: any[];
  recommendedProbeAddresses: string[];
}

export function summarizeTraceRows(rows: Array<Record<string, string>>, rootAddress: string): TraceSummary {
  const root = normalizeAddress(rootAddress);
  const inflows: any[] = [];
  const outflows: any[] = [];
  const downstreamMap = new Map<string, any>();
  const upstreamMap = new Map<string, any>();

  for (const row of rows) {
    const from = normalizeAddress(row.From);
    const to = normalizeAddress(row.To);
    const entry = {
      chain: row['Chain Name'] || '',
      hash: row.Hash || '',
      status: row.Status || '',
      action: row.Action || '',
      token: row.Token || '',
      from: row.From || '',
      to: row.To || '',
      fromInfo: row['From Info'] || '',
      toInfo: row['To Info'] || '',
    };
    if (to === root) {
      inflows.push(entry);
      const key = `${to}:${from}`;
      const existing = upstreamMap.get(key) || { address: entry.from, info: entry.fromInfo, chains: new Set(), count: 0, tokens: new Set() };
      existing.chains.add(entry.chain);
      existing.tokens.add(entry.token || entry.action);
      existing.count += 1;
      upstreamMap.set(key, existing);
    }
    if (from === root) {
      outflows.push(entry);
      const key = `${from}:${to}`;
      const existing = downstreamMap.get(key) || { address: entry.to, info: entry.toInfo, chains: new Set(), count: 0, tokens: new Set(), actions: new Set() };
      existing.chains.add(entry.chain);
      existing.tokens.add(entry.token || '');
      existing.actions.add(entry.action || '');
      existing.count += 1;
      downstreamMap.set(key, existing);
    }
  }

  const downstream = Array.from(downstreamMap.values())
    .map((entry) => ({
      address: entry.address,
      info: entry.info,
      chains: Array.from(entry.chains.values()),
      count: entry.count,
      tokens: Array.from(entry.tokens.values()).filter(Boolean),
      actions: Array.from(entry.actions.values()).filter(Boolean),
      likely_role: String(entry.info || '').toLowerCase().includes('solver')
        ? 'solver_or_bridge'
        : String(entry.info || '').toLowerCase().includes('bundler')
          ? 'bundler_or_aa'
          : 'downstream_candidate',
    }))
    .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));

  const upstream = Array.from(upstreamMap.values())
    .map((entry) => ({
      address: entry.address,
      info: entry.info,
      chains: Array.from(entry.chains.values()),
      count: entry.count,
      tokens: Array.from(entry.tokens.values()).filter(Boolean),
    }))
    .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));

  return {
    rootAddress,
    rowCount: rows.length,
    inflowCount: inflows.length,
    outflowCount: outflows.length,
    upstream,
    downstream,
    recommendedProbeAddresses: downstream.map((entry) => entry.address),
  };
}

export function traceCsvFile(csvPath: string, rootAddress: string): TraceSummary {
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsvTable(text);
  return summarizeTraceRows(rows, rootAddress);
}
