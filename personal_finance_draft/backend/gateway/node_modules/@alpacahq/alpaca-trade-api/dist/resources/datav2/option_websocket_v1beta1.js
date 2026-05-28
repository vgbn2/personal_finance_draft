"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlpacaOptionClient = void 0;
const entityv2_1 = require("./entityv2");
const websocket_1 = require("./websocket");
class AlpacaOptionClient extends websocket_1.AlpacaWebsocket {
    constructor(options) {
        const url = "wss" + options.url.substr(options.url.indexOf(":")) + "/v1beta1/" + options.feed;
        options.url = url;
        options.subscriptions = {
            trades: [],
            quotes: [],
        };
        super(options);
    }
    subscribeForTrades(trades) {
        this.session.subscriptions.trades.push(...trades);
        this.subscribe({ trades });
    }
    subscribeForQuotes(quotes) {
        this.session.subscriptions.quotes.push(...quotes);
        this.subscribe({ quotes });
    }
    subscribe(symbols) {
        var _a, _b;
        const subMsg = {
            action: "subscribe",
            trades: (_a = symbols.trades) !== null && _a !== void 0 ? _a : [],
            quotes: (_b = symbols.quotes) !== null && _b !== void 0 ? _b : [],
        };
        this.conn.send(this.msgpack.encode(subMsg));
    }
    subscribeAll() {
        this.subscribe(this.session.subscriptions);
    }
    unsubscribeFromTrades(trades) {
        this.session.subscriptions.trades = this.session.subscriptions.trades.filter((trade) => !trades.includes(trade));
        this.unsubscribe({ trades });
    }
    unsubscribeFromQuotes(quotes) {
        this.session.subscriptions.quotes = this.session.subscriptions.quotes.filter((quote) => !quotes.includes(quote));
        this.unsubscribe({ quotes });
    }
    unsubscribe(symbols) {
        var _a, _b;
        const unsubMsg = {
            action: "unsubscribe",
            trades: (_a = symbols.trades) !== null && _a !== void 0 ? _a : [],
            quotes: (_b = symbols.quotes) !== null && _b !== void 0 ? _b : [],
        };
        this.conn.send(this.msgpack.encode(unsubMsg));
    }
    updateSubscriptions(msg) {
        this.log(`listening to streams:
          trades: ${msg.trades},
          quotes: ${msg.quotes}`);
        this.session.subscriptions = {
            trades: msg.trades,
            quotes: msg.quotes,
        };
    }
    onOptionTrade(fn) {
        this.on(websocket_1.EVENT.TRADES, (trade) => fn(trade));
    }
    onOptionQuote(fn) {
        this.on(websocket_1.EVENT.QUOTES, (quote) => fn(quote));
    }
    dataHandler(data) {
        data.forEach((element) => {
            if ("T" in element) {
                switch (element.T) {
                    case "t":
                        this.emit(websocket_1.EVENT.TRADES, (0, entityv2_1.AlpacaOptionTradeV1Beta1)(element));
                        break;
                    case "q":
                        this.emit(websocket_1.EVENT.QUOTES, (0, entityv2_1.AlpacaOptionQuoteV1Beta1)(element));
                        break;
                    default:
                        this.emit(websocket_1.EVENT.CLIENT_ERROR, websocket_1.ERROR.UNEXPECTED_MESSAGE);
                }
            }
        });
    }
}
exports.AlpacaOptionClient = AlpacaOptionClient;
