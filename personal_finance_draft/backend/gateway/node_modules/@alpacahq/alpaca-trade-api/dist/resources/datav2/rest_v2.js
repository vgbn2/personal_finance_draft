"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCorporateActions = exports.getOptionChain = exports.getOptionSnapshots = exports.getLatestOptionQuotes = exports.getLatestOptionTrades = exports.getMultiOptionTradesAsync = exports.getMultiOptionTrades = exports.getMultiOptionBarsAsync = exports.getMultiOptionBars = exports.getNews = exports.Sort = exports.getLatestCryptoOrderbooks = exports.getCryptoSnapshots = exports.getLatestCryptoQuotes = exports.getLatestCryptoTrades = exports.getLatestCryptoBars = exports.getCryptoBars = exports.getCryptoQuotes = exports.getCryptoTrades = exports.getSnapshots = exports.getSnapshot = exports.getLatestBars = exports.getLatestBar = exports.getLatestQuotes = exports.getLatestQuote = exports.getLatestTrades = exports.getLatestTrade = exports.getMultiBarsAsync = exports.getMultiBars = exports.getBars = exports.getMultiQuotesAsync = exports.getMultiQuotes = exports.getQuotes = exports.getMultiTradesAsync = exports.getMultiTrades = exports.getTrades = exports.getMultiDataV2 = exports.getDataV2 = exports.dataV2HttpRequest = exports.TYPE = exports.Adjustment = void 0;
const axios_1 = __importDefault(require("axios"));
const entityv2_1 = require("./entityv2");
// Number of data points to return.
const V2_MAX_LIMIT = 10000;
const V2_NEWS_MAX_LIMIT = 50;
const V1_BETA1_MAX_LIMIT = 1000;
var Adjustment;
(function (Adjustment) {
    Adjustment["RAW"] = "raw";
    Adjustment["DIVIDEND"] = "dividend";
    Adjustment["SPLIT"] = "split";
    Adjustment["ALL"] = "all";
})(Adjustment || (exports.Adjustment = Adjustment = {}));
var TYPE;
(function (TYPE) {
    TYPE["TRADES"] = "trades";
    TYPE["QUOTES"] = "quotes";
    TYPE["BARS"] = "bars";
    TYPE["SNAPSHOTS"] = "snapshots";
})(TYPE || (exports.TYPE = TYPE = {}));
function dataV2HttpRequest(url, queryParams, config) {
    const { dataBaseUrl, keyId, secretKey, oauth } = config;
    const headers = {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
    };
    if (oauth == "") {
        headers["APCA-API-KEY-ID"] = keyId;
        headers["APCA-API-SECRET-KEY"] = secretKey;
    }
    else {
        headers["Authorization"] = "Bearer " + oauth;
    }
    return axios_1.default
        .get(`${dataBaseUrl}${url}`, {
        params: queryParams,
        headers: headers,
    })
        .catch((err) => {
        var _a, _b;
        throw new Error(`code: ${((_a = err.response) === null || _a === void 0 ? void 0 : _a.status) || err.statusCode}, message: ${(_b = err.response) === null || _b === void 0 ? void 0 : _b.data.message}`);
    });
}
exports.dataV2HttpRequest = dataV2HttpRequest;
function getQueryLimit(totalLimit, pageLimit, received) {
    let limit = 0;
    if (pageLimit !== 0) {
        limit = pageLimit;
    }
    if (totalLimit !== 0) {
        const remaining = totalLimit - received;
        if (remaining <= 0) {
            // this should never happen
            return -1;
        }
        if (limit == 0 || limit > remaining) {
            limit = remaining;
        }
    }
    return limit;
}
function getDataV2(endpoint, path, options, config) {
    return __asyncGenerator(this, arguments, function* getDataV2_1() {
        var _a;
        let pageToken = null;
        let received = 0;
        const pageLimit = options.pageLimit
            ? Math.min(options.pageLimit, V2_MAX_LIMIT)
            : V2_MAX_LIMIT;
        delete options.pageLimit;
        options.limit = (_a = options.limit) !== null && _a !== void 0 ? _a : 0;
        while (options.limit > received || options.limit === 0) {
            let limit;
            if (options.limit !== 0) {
                limit = getQueryLimit(options.limit, pageLimit, received);
                if (limit == -1) {
                    break;
                }
            }
            else {
                limit = null;
            }
            const resp = yield __await(dataV2HttpRequest(path, Object.assign(Object.assign({}, options), { limit, page_token: pageToken }), config));
            const items = resp.data[endpoint] || [];
            for (const item of items) {
                yield yield __await(item);
            }
            received += items.length;
            pageToken = resp.data.next_page_token;
            if (!pageToken) {
                break;
            }
        }
    });
}
exports.getDataV2 = getDataV2;
function getMultiDataV2(symbols, url, endpoint, options, config) {
    return __asyncGenerator(this, arguments, function* getMultiDataV2_1() {
        var _a;
        let pageToken = null;
        let received = 0;
        const pageLimit = options.pageLimit
            ? Math.min(options.pageLimit, V2_MAX_LIMIT)
            : V2_MAX_LIMIT;
        delete options.pageLimit;
        options.limit = (_a = options.limit) !== null && _a !== void 0 ? _a : 0;
        while (options.limit > received || options.limit === 0) {
            const limit = getQueryLimit(options.limit, pageLimit, received);
            if (limit == -1) {
                break;
            }
            const params = Object.assign(Object.assign({}, options), { symbols: symbols.join(","), limit: limit, page_token: pageToken });
            const resp = yield __await(dataV2HttpRequest(`${url}${endpoint}`, params, config));
            const items = resp.data[endpoint];
            for (const symbol in items) {
                for (const data of items[symbol]) {
                    received++;
                    yield yield __await({ symbol: symbol, data: data });
                }
            }
            pageToken = resp.data.next_page_token;
            if (!pageToken) {
                break;
            }
        }
    });
}
exports.getMultiDataV2 = getMultiDataV2;
function getTrades(symbol, options, config) {
    return __asyncGenerator(this, arguments, function* getTrades_1() {
        var _a, e_1, _b, _c;
        const trades = getDataV2(TYPE.TRADES, `/v2/stocks/${symbol}/${TYPE.TRADES}`, options, config);
        try {
            for (var _d = true, trades_1 = __asyncValues(trades), trades_1_1; trades_1_1 = yield __await(trades_1.next()), _a = trades_1_1.done, !_a; _d = true) {
                _c = trades_1_1.value;
                _d = false;
                const trade = _c;
                yield yield __await((0, entityv2_1.AlpacaTradeV2)(trade));
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = trades_1.return)) yield __await(_b.call(trades_1));
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
}
exports.getTrades = getTrades;
function getMultiTrades(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_2, _b, _c;
        const multiTrades = getMultiTradesAsync(symbols, options, config);
        const trades = new Map();
        try {
            for (var _d = true, multiTrades_1 = __asyncValues(multiTrades), multiTrades_1_1; multiTrades_1_1 = yield multiTrades_1.next(), _a = multiTrades_1_1.done, !_a; _d = true) {
                _c = multiTrades_1_1.value;
                _d = false;
                const t = _c;
                const items = trades.get(t.Symbol) || new Array();
                trades.set(t.Symbol, [...items, t]);
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiTrades_1.return)) yield _b.call(multiTrades_1);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return trades;
    });
}
exports.getMultiTrades = getMultiTrades;
function getMultiTradesAsync(symbols, options, config) {
    return __asyncGenerator(this, arguments, function* getMultiTradesAsync_1() {
        var _a, e_3, _b, _c;
        const multiTrades = getMultiDataV2(symbols, "/v2/stocks/", TYPE.TRADES, options, config);
        try {
            for (var _d = true, multiTrades_2 = __asyncValues(multiTrades), multiTrades_2_1; multiTrades_2_1 = yield __await(multiTrades_2.next()), _a = multiTrades_2_1.done, !_a; _d = true) {
                _c = multiTrades_2_1.value;
                _d = false;
                const t = _c;
                t.data = Object.assign(Object.assign({}, t.data), { S: t.symbol });
                yield yield __await((0, entityv2_1.AlpacaTradeV2)(t.data));
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiTrades_2.return)) yield __await(_b.call(multiTrades_2));
            }
            finally { if (e_3) throw e_3.error; }
        }
    });
}
exports.getMultiTradesAsync = getMultiTradesAsync;
function getQuotes(symbol, options, config) {
    return __asyncGenerator(this, arguments, function* getQuotes_1() {
        var _a, e_4, _b, _c;
        const quotes = getDataV2(TYPE.QUOTES, `/v2/stocks/${symbol}/${TYPE.QUOTES}`, options, config);
        try {
            for (var _d = true, quotes_1 = __asyncValues(quotes), quotes_1_1; quotes_1_1 = yield __await(quotes_1.next()), _a = quotes_1_1.done, !_a; _d = true) {
                _c = quotes_1_1.value;
                _d = false;
                const quote = _c;
                yield yield __await((0, entityv2_1.AlpacaQuoteV2)(quote));
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = quotes_1.return)) yield __await(_b.call(quotes_1));
            }
            finally { if (e_4) throw e_4.error; }
        }
    });
}
exports.getQuotes = getQuotes;
function getMultiQuotes(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_5, _b, _c;
        const multiQuotes = getMultiQuotesAsync(symbols, options, config);
        const quotes = new Map();
        try {
            for (var _d = true, multiQuotes_1 = __asyncValues(multiQuotes), multiQuotes_1_1; multiQuotes_1_1 = yield multiQuotes_1.next(), _a = multiQuotes_1_1.done, !_a; _d = true) {
                _c = multiQuotes_1_1.value;
                _d = false;
                const q = _c;
                const items = quotes.get(q.Symbol) || new Array();
                quotes.set(q.Symbol, [...items, q]);
            }
        }
        catch (e_5_1) { e_5 = { error: e_5_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiQuotes_1.return)) yield _b.call(multiQuotes_1);
            }
            finally { if (e_5) throw e_5.error; }
        }
        return quotes;
    });
}
exports.getMultiQuotes = getMultiQuotes;
function getMultiQuotesAsync(symbols, options, config) {
    return __asyncGenerator(this, arguments, function* getMultiQuotesAsync_1() {
        var _a, e_6, _b, _c;
        const multiQuotes = getMultiDataV2(symbols, "/v2/stocks/", TYPE.QUOTES, options, config);
        try {
            for (var _d = true, multiQuotes_2 = __asyncValues(multiQuotes), multiQuotes_2_1; multiQuotes_2_1 = yield __await(multiQuotes_2.next()), _a = multiQuotes_2_1.done, !_a; _d = true) {
                _c = multiQuotes_2_1.value;
                _d = false;
                const q = _c;
                q.data = Object.assign(Object.assign({}, q.data), { S: q.symbol });
                yield yield __await((0, entityv2_1.AlpacaQuoteV2)(q.data));
            }
        }
        catch (e_6_1) { e_6 = { error: e_6_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiQuotes_2.return)) yield __await(_b.call(multiQuotes_2));
            }
            finally { if (e_6) throw e_6.error; }
        }
    });
}
exports.getMultiQuotesAsync = getMultiQuotesAsync;
function getBars(symbol, options, config) {
    return __asyncGenerator(this, arguments, function* getBars_1() {
        var _a, e_7, _b, _c;
        const bars = getDataV2(TYPE.BARS, `/v2/stocks/${symbol}/${TYPE.BARS}`, options, config);
        try {
            for (var _d = true, _e = __asyncValues(bars || []), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const bar = _c;
                yield yield __await((0, entityv2_1.AlpacaBarV2)(bar));
            }
        }
        catch (e_7_1) { e_7 = { error: e_7_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
            }
            finally { if (e_7) throw e_7.error; }
        }
    });
}
exports.getBars = getBars;
function getMultiBars(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_8, _b, _c;
        const multiBars = getMultiBarsAsync(symbols, options, config);
        const bars = new Map();
        try {
            for (var _d = true, multiBars_1 = __asyncValues(multiBars), multiBars_1_1; multiBars_1_1 = yield multiBars_1.next(), _a = multiBars_1_1.done, !_a; _d = true) {
                _c = multiBars_1_1.value;
                _d = false;
                const b = _c;
                const items = bars.get(b.Symbol) || new Array();
                bars.set(b.Symbol, [...items, b]);
            }
        }
        catch (e_8_1) { e_8 = { error: e_8_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiBars_1.return)) yield _b.call(multiBars_1);
            }
            finally { if (e_8) throw e_8.error; }
        }
        return bars;
    });
}
exports.getMultiBars = getMultiBars;
function getMultiBarsAsync(symbols, options, config) {
    return __asyncGenerator(this, arguments, function* getMultiBarsAsync_1() {
        var _a, e_9, _b, _c;
        const multiBars = getMultiDataV2(symbols, "/v2/stocks/", TYPE.BARS, options, config);
        try {
            for (var _d = true, multiBars_2 = __asyncValues(multiBars), multiBars_2_1; multiBars_2_1 = yield __await(multiBars_2.next()), _a = multiBars_2_1.done, !_a; _d = true) {
                _c = multiBars_2_1.value;
                _d = false;
                const b = _c;
                b.data = Object.assign(Object.assign({}, b.data), { S: b.symbol });
                yield yield __await((0, entityv2_1.AlpacaBarV2)(b.data));
            }
        }
        catch (e_9_1) { e_9 = { error: e_9_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiBars_2.return)) yield __await(_b.call(multiBars_2));
            }
            finally { if (e_9) throw e_9.error; }
        }
    });
}
exports.getMultiBarsAsync = getMultiBarsAsync;
function getLatestTrade(symbol, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v2/stocks/${symbol}/trades/latest`, {}, config);
        return (0, entityv2_1.AlpacaTradeV2)(resp.data.trade);
    });
}
exports.getLatestTrade = getLatestTrade;
function getLatestTrades(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v2/stocks/${TYPE.TRADES}/latest`, { symbols: symbols.join(",") }, config);
        const multiLatestTrades = resp.data.trades;
        const multiLatestTradesResp = new Map();
        for (const symbol in multiLatestTrades) {
            multiLatestTradesResp.set(symbol, (0, entityv2_1.AlpacaTradeV2)(Object.assign({ S: symbol }, multiLatestTrades[symbol])));
        }
        return multiLatestTradesResp;
    });
}
exports.getLatestTrades = getLatestTrades;
function getLatestQuote(symbol, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v2/stocks/${symbol}/quotes/latest`, {}, config);
        return (0, entityv2_1.AlpacaQuoteV2)(resp.data.quote);
    });
}
exports.getLatestQuote = getLatestQuote;
function getLatestQuotes(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v2/stocks/${TYPE.QUOTES}/latest`, { symbols: symbols.join(",") }, config);
        const multiLatestQuotes = resp.data.quotes;
        const multiLatestQuotesResp = new Map();
        for (const symbol in multiLatestQuotes) {
            multiLatestQuotesResp.set(symbol, (0, entityv2_1.AlpacaQuoteV2)(Object.assign({ S: symbol }, multiLatestQuotes[symbol])));
        }
        return multiLatestQuotesResp;
    });
}
exports.getLatestQuotes = getLatestQuotes;
function getLatestBar(symbol, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v2/stocks/${symbol}/bars/latest`, {}, config);
        return (0, entityv2_1.AlpacaBarV2)(resp.data.bar);
    });
}
exports.getLatestBar = getLatestBar;
function getLatestBars(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v2/stocks/${TYPE.BARS}/latest`, { symbols: symbols.join(",") }, config);
        const multiLatestBars = resp.data.bars;
        const multiLatestBarsResp = new Map();
        for (const symbol in multiLatestBars) {
            multiLatestBarsResp.set(symbol, (0, entityv2_1.AlpacaBarV2)(Object.assign({ S: symbol }, multiLatestBars[symbol])));
        }
        return multiLatestBarsResp;
    });
}
exports.getLatestBars = getLatestBars;
function getSnapshot(symbol, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v2/stocks/${symbol}/snapshot`, {}, config);
        return (0, entityv2_1.AlpacaSnapshotV2)(resp.data);
    });
}
exports.getSnapshot = getSnapshot;
function getSnapshots(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v2/stocks/snapshots?symbols=${symbols.join(",")}`, {}, config);
        const result = Object.entries(resp.data).map(([key, val]) => {
            return (0, entityv2_1.AlpacaSnapshotV2)(Object.assign({ symbol: key }, val));
        });
        return result;
    });
}
exports.getSnapshots = getSnapshots;
function getCryptoTrades(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_10, _b, _c;
        const cryptoTrades = getMultiDataV2(symbols, "/v1beta3/crypto/us/", TYPE.TRADES, options, config);
        const trades = new Map();
        try {
            for (var _d = true, cryptoTrades_1 = __asyncValues(cryptoTrades), cryptoTrades_1_1; cryptoTrades_1_1 = yield cryptoTrades_1.next(), _a = cryptoTrades_1_1.done, !_a; _d = true) {
                _c = cryptoTrades_1_1.value;
                _d = false;
                const t = _c;
                const items = trades.get(t.symbol) || new Array();
                trades.set(t.symbol, [...items, (0, entityv2_1.AlpacaCryptoTrade)(t.data)]);
            }
        }
        catch (e_10_1) { e_10 = { error: e_10_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = cryptoTrades_1.return)) yield _b.call(cryptoTrades_1);
            }
            finally { if (e_10) throw e_10.error; }
        }
        return trades;
    });
}
exports.getCryptoTrades = getCryptoTrades;
function getCryptoQuotes(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_11, _b, _c;
        const cryptoQuotes = getMultiDataV2(symbols, "/v1beta3/crypto/us/", TYPE.QUOTES, options, config);
        const quotes = new Map();
        try {
            for (var _d = true, cryptoQuotes_1 = __asyncValues(cryptoQuotes), cryptoQuotes_1_1; cryptoQuotes_1_1 = yield cryptoQuotes_1.next(), _a = cryptoQuotes_1_1.done, !_a; _d = true) {
                _c = cryptoQuotes_1_1.value;
                _d = false;
                const t = _c;
                const items = quotes.get(t.symbol) || new Array();
                quotes.set(t.symbol, [...items, (0, entityv2_1.AlpacaCryptoQuote)(t.data)]);
            }
        }
        catch (e_11_1) { e_11 = { error: e_11_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = cryptoQuotes_1.return)) yield _b.call(cryptoQuotes_1);
            }
            finally { if (e_11) throw e_11.error; }
        }
        return quotes;
    });
}
exports.getCryptoQuotes = getCryptoQuotes;
function getCryptoBars(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_12, _b, _c;
        const cryptoBars = getMultiDataV2(symbols, "/v1beta3/crypto/us/", TYPE.BARS, options, config);
        const bars = new Map();
        try {
            for (var _d = true, cryptoBars_1 = __asyncValues(cryptoBars), cryptoBars_1_1; cryptoBars_1_1 = yield cryptoBars_1.next(), _a = cryptoBars_1_1.done, !_a; _d = true) {
                _c = cryptoBars_1_1.value;
                _d = false;
                const t = _c;
                const items = bars.get(t.symbol) || new Array();
                bars.set(t.symbol, [...items, (0, entityv2_1.AlpacaCryptoBar)(t.data)]);
            }
        }
        catch (e_12_1) { e_12 = { error: e_12_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = cryptoBars_1.return)) yield _b.call(cryptoBars_1);
            }
            finally { if (e_12) throw e_12.error; }
        }
        return bars;
    });
}
exports.getCryptoBars = getCryptoBars;
function getLatestCryptoBars(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = { symbols: symbols.join(",") };
        const resp = yield dataV2HttpRequest(`/v1beta3/crypto/us/latest/bars`, params, config);
        const multiLatestCryptoBars = resp.data.bars;
        const result = new Map();
        for (const symbol in multiLatestCryptoBars) {
            const bar = multiLatestCryptoBars[symbol];
            result.set(symbol, (0, entityv2_1.AlpacaCryptoBar)(bar));
        }
        return result;
    });
}
exports.getLatestCryptoBars = getLatestCryptoBars;
function getLatestCryptoTrades(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = { symbols: symbols.join(",") };
        const resp = yield dataV2HttpRequest(`/v1beta3/crypto/us/latest/trades`, params, config);
        const multiLatestCryptoTrades = resp.data.trades;
        const result = new Map();
        for (const symbol in multiLatestCryptoTrades) {
            const trade = multiLatestCryptoTrades[symbol];
            result.set(symbol, (0, entityv2_1.AlpacaCryptoTrade)(trade));
        }
        return result;
    });
}
exports.getLatestCryptoTrades = getLatestCryptoTrades;
function getLatestCryptoQuotes(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = { symbols: symbols.join(",") };
        const resp = yield dataV2HttpRequest(`/v1beta3/crypto/us/latest/quotes`, params, config);
        const multiLatestCryptoQuotes = resp.data.quotes;
        const result = new Map();
        for (const symbol in multiLatestCryptoQuotes) {
            const quote = multiLatestCryptoQuotes[symbol];
            result.set(symbol, (0, entityv2_1.AlpacaCryptoQuote)(quote));
        }
        return result;
    });
}
exports.getLatestCryptoQuotes = getLatestCryptoQuotes;
function getCryptoSnapshots(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = { symbols: symbols.join(",") };
        const resp = yield dataV2HttpRequest(`/v1beta3/crypto/us/snapshots`, params, config);
        const snapshots = resp.data.snapshots;
        const result = new Map();
        for (const symbol in snapshots) {
            const snapshot = snapshots[symbol];
            result.set(symbol, (0, entityv2_1.AlpacaCryptoSnapshot)(snapshot));
        }
        return result;
    });
}
exports.getCryptoSnapshots = getCryptoSnapshots;
function getLatestCryptoOrderbooks(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = { symbols: symbols.join(",") };
        const resp = yield dataV2HttpRequest(`/v1beta3/crypto/us/latest/orderbooks`, params, config);
        const orderbooks = resp.data.orderbooks;
        const result = new Map();
        for (const symbol in orderbooks) {
            const orderbook = orderbooks[symbol];
            result.set(symbol, (0, entityv2_1.AlpacaCryptoOrderbook)(orderbook));
        }
        return result;
    });
}
exports.getLatestCryptoOrderbooks = getLatestCryptoOrderbooks;
var Sort;
(function (Sort) {
    Sort["ASC"] = "asc";
    Sort["DESC"] = "desc";
})(Sort || (exports.Sort = Sort = {}));
function getNewsParams(options) {
    var _a;
    const query = {};
    query.symbols = ((_a = options.symbols) === null || _a === void 0 ? void 0 : _a.length) > 0 ? options.symbols.join(",") : null;
    query.start = options.start;
    query.end = options.end;
    query.sort = options.sort;
    query.include_content = options.includeContent;
    query.exclude_contentless = options.excludeContentless;
    return query;
}
function getNews(options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (options.totalLimit && options.totalLimit < 0) {
            throw new Error("negative total limit");
        }
        if (options.pageLimit && options.pageLimit < 0) {
            throw new Error("negative page limit");
        }
        let pageToken = null;
        let received = 0;
        const pageLimit = (options === null || options === void 0 ? void 0 : options.pageLimit)
            ? Math.min(options.pageLimit, V2_NEWS_MAX_LIMIT)
            : V2_NEWS_MAX_LIMIT;
        options === null || options === void 0 ? true : delete options.pageLimit;
        const totalLimit = (_a = options.totalLimit) !== null && _a !== void 0 ? _a : 10;
        const result = [];
        const params = getNewsParams(options);
        let limit;
        for (;;) {
            limit = getQueryLimit(totalLimit, pageLimit, received);
            if (limit < 1) {
                break;
            }
            const resp = yield dataV2HttpRequest("/v1beta1/news", Object.assign(Object.assign({}, params), { limit: limit, page_token: pageToken }), config);
            resp.data.news.forEach((n) => result.push((0, entityv2_1.AlpacaNews)(n)));
            received += resp.data.news.length;
            pageToken = resp.data.next_page_token;
            if (!pageToken) {
                break;
            }
        }
        return result;
    });
}
exports.getNews = getNews;
function getMultiOptionBars(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_13, _b, _c;
        const multiBars = getMultiOptionBarsAsync(symbols, options, config);
        const bars = new Map();
        try {
            for (var _d = true, multiBars_3 = __asyncValues(multiBars), multiBars_3_1; multiBars_3_1 = yield multiBars_3.next(), _a = multiBars_3_1.done, !_a; _d = true) {
                _c = multiBars_3_1.value;
                _d = false;
                const b = _c;
                // symbol will always have a value
                let symbol = b.Symbol ? b.Symbol : "";
                delete b.Symbol;
                const items = bars.get(symbol) || new Array();
                bars.set(symbol, [...items, b]);
            }
        }
        catch (e_13_1) { e_13 = { error: e_13_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiBars_3.return)) yield _b.call(multiBars_3);
            }
            finally { if (e_13) throw e_13.error; }
        }
        return bars;
    });
}
exports.getMultiOptionBars = getMultiOptionBars;
function getMultiOptionBarsAsync(symbols, options, config) {
    return __asyncGenerator(this, arguments, function* getMultiOptionBarsAsync_1() {
        var _a, e_14, _b, _c;
        const multiBars = getMultiDataV2(symbols, "/v1beta1/options/", TYPE.BARS, options, config);
        try {
            for (var _d = true, multiBars_4 = __asyncValues(multiBars), multiBars_4_1; multiBars_4_1 = yield __await(multiBars_4.next()), _a = multiBars_4_1.done, !_a; _d = true) {
                _c = multiBars_4_1.value;
                _d = false;
                const b = _c;
                b.data = Object.assign(Object.assign({}, b.data), { S: b.symbol });
                yield yield __await((0, entityv2_1.AlpacaOptionBarV1Beta1)(b.data));
            }
        }
        catch (e_14_1) { e_14 = { error: e_14_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiBars_4.return)) yield __await(_b.call(multiBars_4));
            }
            finally { if (e_14) throw e_14.error; }
        }
    });
}
exports.getMultiOptionBarsAsync = getMultiOptionBarsAsync;
function getMultiOptionTrades(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_15, _b, _c;
        const multiTrades = getMultiOptionTradesAsync(symbols, options, config);
        const trades = new Map();
        try {
            for (var _d = true, multiTrades_3 = __asyncValues(multiTrades), multiTrades_3_1; multiTrades_3_1 = yield multiTrades_3.next(), _a = multiTrades_3_1.done, !_a; _d = true) {
                _c = multiTrades_3_1.value;
                _d = false;
                const t = _c;
                // symbol will always have a value
                let symbol = t.Symbol ? t.Symbol : "";
                delete t.Symbol;
                const items = trades.get(symbol) || new Array();
                trades.set(symbol, [...items, t]);
            }
        }
        catch (e_15_1) { e_15 = { error: e_15_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiTrades_3.return)) yield _b.call(multiTrades_3);
            }
            finally { if (e_15) throw e_15.error; }
        }
        return trades;
    });
}
exports.getMultiOptionTrades = getMultiOptionTrades;
function getMultiOptionTradesAsync(symbols, options, config) {
    return __asyncGenerator(this, arguments, function* getMultiOptionTradesAsync_1() {
        var _a, e_16, _b, _c;
        const multiBars = getMultiDataV2(symbols, "/v1beta1/options/", TYPE.TRADES, options, config);
        try {
            for (var _d = true, multiBars_5 = __asyncValues(multiBars), multiBars_5_1; multiBars_5_1 = yield __await(multiBars_5.next()), _a = multiBars_5_1.done, !_a; _d = true) {
                _c = multiBars_5_1.value;
                _d = false;
                const b = _c;
                b.data = Object.assign(Object.assign({}, b.data), { S: b.symbol });
                yield yield __await((0, entityv2_1.AlpacaOptionTradeV1Beta1)(b.data));
            }
        }
        catch (e_16_1) { e_16 = { error: e_16_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = multiBars_5.return)) yield __await(_b.call(multiBars_5));
            }
            finally { if (e_16) throw e_16.error; }
        }
    });
}
exports.getMultiOptionTradesAsync = getMultiOptionTradesAsync;
function getLatestOptionTrades(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v1beta1/options/${TYPE.TRADES}/latest`, { symbols: symbols.join(",") }, config);
        const multiLatestTrades = resp.data.trades;
        const multiLatestTradesResp = new Map();
        for (const symbol in multiLatestTrades) {
            multiLatestTradesResp.set(symbol, (0, entityv2_1.AlpacaOptionTradeV1Beta1)(Object.assign({}, multiLatestTrades[symbol])));
        }
        return multiLatestTradesResp;
    });
}
exports.getLatestOptionTrades = getLatestOptionTrades;
function getLatestOptionQuotes(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v1beta1/options/${TYPE.QUOTES}/latest`, { symbols: symbols.join(",") }, config);
        const multiLatestQuotes = resp.data.quotes;
        const multiLatestQuotesResp = new Map();
        for (const symbol in multiLatestQuotes) {
            multiLatestQuotesResp.set(symbol, (0, entityv2_1.AlpacaOptionQuoteV1Beta1)(Object.assign({}, multiLatestQuotes[symbol])));
        }
        return multiLatestQuotesResp;
    });
}
exports.getLatestOptionQuotes = getLatestOptionQuotes;
function getOptionSnapshots(symbols, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield dataV2HttpRequest(`/v1beta1/options/snapshots?symbols=${symbols.join(",")}`, {}, config);
        const result = Object.entries(resp.data.snapshots).map(([key, val]) => {
            return (0, entityv2_1.AlpacaOptionSnapshotV1Beta1)(Object.assign({ Symbol: key }, val));
        });
        return result;
    });
}
exports.getOptionSnapshots = getOptionSnapshots;
function getOptionChain(underlyingSymbol, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (options.totalLimit && options.totalLimit < 0) {
            throw new Error("negative total limit");
        }
        if (options.pageLimit && options.pageLimit < 0) {
            throw new Error("negative page limit");
        }
        let pageToken = null;
        let received = 0;
        const pageLimit = (options === null || options === void 0 ? void 0 : options.pageLimit)
            ? Math.min(options.pageLimit, V1_BETA1_MAX_LIMIT)
            : V1_BETA1_MAX_LIMIT;
        delete options.pageLimit;
        const totalLimit = (_a = options === null || options === void 0 ? void 0 : options.totalLimit) !== null && _a !== void 0 ? _a : 10000;
        delete options.totalLimit;
        const result = [];
        let limit;
        for (;;) {
            limit = getQueryLimit(totalLimit, pageLimit, received);
            if (limit < 1) {
                break;
            }
            const resp = yield dataV2HttpRequest(`/v1beta1/options/snapshots/${underlyingSymbol}`, Object.assign(Object.assign({}, options), { limit: limit, page_token: pageToken }), config);
            const res = Object.entries(resp.data.snapshots).map(([key, val]) => {
                return (0, entityv2_1.AlpacaOptionSnapshotV1Beta1)(Object.assign({ Symbol: key }, val));
            });
            received = received + res.length;
            result.push(...res);
            pageToken = resp.data.next_page_token;
            if (!pageToken) {
                break;
            }
        }
        return result;
    });
}
exports.getOptionChain = getOptionChain;
function getCorporateActions(symbols, options, config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (options.totalLimit && options.totalLimit < 0) {
            throw new Error("negative total limit");
        }
        if (options.pageLimit && options.pageLimit < 0) {
            throw new Error("negative page limit");
        }
        let pageToken = null;
        let received = 0;
        const pageLimit = (options === null || options === void 0 ? void 0 : options.pageLimit)
            ? Math.min(options.pageLimit, V1_BETA1_MAX_LIMIT)
            : V1_BETA1_MAX_LIMIT;
        options === null || options === void 0 ? true : delete options.pageLimit;
        const totalLimit = (_a = options === null || options === void 0 ? void 0 : options.totalLimit) !== null && _a !== void 0 ? _a : V2_MAX_LIMIT;
        delete options.totalLimit;
        let result = {};
        const types = (_b = options === null || options === void 0 ? void 0 : options.types) === null || _b === void 0 ? void 0 : _b.join(",");
        const params = Object.assign(Object.assign({}, options), { symbols, types });
        let limit;
        for (;;) {
            limit = getQueryLimit(totalLimit, pageLimit, received);
            if (limit < 1) {
                break;
            }
            const resp = yield dataV2HttpRequest(`/v1beta1/corporate-actions`, Object.assign(Object.assign({}, params), { limit: limit, page_token: pageToken }), config);
            const cas = (0, entityv2_1.convertCorporateActions)(resp.data.corporate_actions);
            result = (0, entityv2_1.mergeCorporateActions)(result, cas);
            received += (0, entityv2_1.getCorporateActionsSize)(cas);
            pageToken = resp.data.next_page_token;
            if (!pageToken) {
                break;
            }
        }
        return result;
    });
}
exports.getCorporateActions = getCorporateActions;
