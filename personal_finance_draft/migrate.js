const fs = require('fs');
const path = require('path');

const cliPath = path.join(__dirname, 'scripts', 'cli', 'sovereign_cli.js');
const source = fs.readFileSync(cliPath, 'utf8');

function extractFunction(source, funcName, isAsync = false) {
  const keyword = isAsync ? 'async function ' + funcName : 'function ' + funcName;
  const startIdx = source.indexOf(keyword);
  if (startIdx === -1) return null;
  
  let braceCount = 0;
  let inString = false;
  let stringChar = null;
  let idx = startIdx + keyword.length;
  
  while (idx < source.length && source[idx] !== '{') idx++;
  
  const fnStartIdx = startIdx;
  
  for (; idx < source.length; idx++) {
    const char = source[idx];
    const prevChar = source[idx - 1];
    
    if (inString) {
      if (char === stringChar && prevChar !== '\\') inString = false;
    } else {
      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
      } else if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return source.substring(fnStartIdx, idx + 1);
        }
      }
    }
  }
  return null;
}

const functionsToExtract = [
  { name: 'usage', async: false },
  { name: 'helpText', async: false },
  { name: 'pageText', async: false },
  { name: 'optionValue', async: false },
  { name: 'hasFlag', async: false },
  { name: 'printPayload', async: false },
  { name: 'currentPhaseLabel', async: false },
  { name: 'slugifyStrategyName', async: false },
  { name: 'get_Current_Universe_Symbols', async: false },
  { name: 'buildStrategyPlan', async: false },
  { name: 'readStrategyRegistry', async: false },
  { name: 'parseScalarFromYaml', async: false },
  { name: 'strategySectionPresent', async: false },
  { name: 'inspectStrategyFile', async: false },
  { name: 'strategyRegistryReport', async: false },
  { name: 'writeStrategyRegistry', async: false },
  { name: 'locateBackendBinary', async: false },
  { name: 'runBackendCommand', async: false },
  { name: 'runBackendStatus', async: false },
  { name: 'runBackendStats', async: false },
  { name: 'runBackendPortfolio', async: false },
  { name: 'runBackendDataSummary', async: false },
  { name: 'runBackendCorrelation', async: false },
  { name: 'runBackendUniverse', async: false },
  { name: 'reportSnapshotIntegrity', async: false },
  { name: 'runBackendIntegrity', async: false },
  { name: 'formatHumanNumber', async: false },
  { name: 'formatHumanPayload', async: false },
  { name: 'renderHumanValue', async: false },
  { name: 'safeReadJson', async: false },
  { name: 'labelState', async: false },
  { name: 'summarizeModelCard', async: false },
  { name: 'summarizeBacktestCard', async: false },
  { name: 'summarizeStatusCard', async: false },
  { name: 'summarizeFeaturesCard', async: false },
  { name: 'summarizePortfolioCard', async: false },
  { name: 'buildCockpitModel', async: false },
  { name: 'quoteProviderHeaderState', async: true },
  { name: 'renderCockpit', async: false },
  { name: 'cockpitInspectPayload', async: false },
  { name: 'backendAvailability', async: false },
  { name: 'numericOption', async: false },
  { name: 'periodOptionsFromArgs', async: false },
  { name: 'historicalWindowFromArgs', async: false },
  { name: 'filterCandlesByWindow', async: false },
  { name: 'cryptoLimitForWindow', async: false },
  { name: 'loadUsableSources', async: false },
  { name: 'candlesToSources', async: false },
  { name: 'recordBackfillSummary', async: false },
  { name: 'loadHistoricalSources', async: true },
  { name: 'loadPredictionMarketHistory', async: true },
  { name: 'dateFilterOptionsFromArgs', async: false },
  { name: 'commandIngest', async: true },
  { name: 'commandBackfill', async: true },
  { name: 'commandValidate', async: false },
  { name: 'backtestDataQualityError', async: false },
  { name: 'rejectDegradedResearchInput', async: false },
  { name: 'commandIndicators', async: false },
  { name: 'commandModelCompare', async: false },
  { name: 'commandBacktest', async: true },
  { name: 'commandStatus', async: false },
  { name: 'quoteProviderEnvConfigured', async: false },
  { name: 'quoteProviderPathLabel', async: false },
  { name: 'commandQuotes', async: true },
  { name: 'commandBackend', async: false },
  { name: 'commandStrategy', async: false },
  { name: 'commandOptimize', async: true },
  { name: 'commandDemo', async: true },
  { name: 'promptTradeDeskArgs', async: true },
  { name: 'commandTrade', async: true },
  { name: 'commandWatch', async: true },
  { name: 'handleCommand', async: true },
  { name: 'main', async: true },
  { name: 'buildTradeGatewayLaunch', async: false },
  { name: 'commandCockpit', async: true }
];

const extracted = {};
for (const fn of functionsToExtract) {
  const code = extractFunction(source, fn.name, fn.async);
  if (code) {
    extracted[fn.name] = code;
  } else {
    console.log('Could not find', fn.name);
  }
}

fs.writeFileSync('extracted_functions.json', JSON.stringify(extracted, null, 2));
console.log(`Extracted ${Object.keys(extracted).length} functions.`);
