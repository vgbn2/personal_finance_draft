//+------------------------------------------------------------------+
//|                                         SovereignTradeBridge.mq5 |
//|                                  Sovereign Core Architecture     |
//|                   High-Performance Native Client Socket Bridge   |
//+------------------------------------------------------------------+
#property copyright "Sovereign Platform"
#property link      "https://github.com/vgbn2/personal_finance_draft"
#property version   "1.00"
#property strict

input string InpHost = "127.0.0.1";
input int    InpPort = 8282;
input int    InpTimerMs = 50;
input double InpMaxLot = 2.0;

int      g_socket = INVALID_HANDLE;
string   g_rxBuffer = "";
datetime g_lastConnectAttempt = 0;

int OnInit() {
   EventSetMillisecondTimer(InpTimerMs);
   ConnectBridge();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
   EventKillTimer();
   CloseSocket();
}

void CloseSocket() {
   if(g_socket != INVALID_HANDLE) {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
   }
}

void ConnectBridge() {
   if(g_socket != INVALID_HANDLE && SocketIsConnected(g_socket)) return;
   if(TimeCurrent() - g_lastConnectAttempt < 2) return;
   g_lastConnectAttempt = TimeCurrent();

   CloseSocket();
   g_socket = SocketCreate();
   if(g_socket == INVALID_HANDLE) return;

   SocketTimeouts(g_socket, 50, 50);
   if(!SocketConnect(g_socket, InpHost, InpPort, 500)) {
      CloseSocket();
      return;
   }

   SendRegistration();
}

void SendRegistration() {
   string marginMode = "RETAIL_HEDGING";
   ENUM_ACCOUNT_MARGIN_MODE mode = (ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   if(mode == ACCOUNT_MARGIN_MODE_RETAIL_NETTING) marginMode = "RETAIL_NETTING";
   else if(mode == ACCOUNT_MARGIN_MODE_EXCHANGE) marginMode = "EXCHANGE";

   string reg = StringFormat(
      "{\"type\":\"REGISTER\",\"terminalId\":\"mt5_%d\",\"account\":%d,\"server\":\"%s\",\"company\":\"%s\",\"marginMode\":\"%s\",\"currency\":\"%s\",\"leverage\":%d,\"tradeAllowed\":%s}\n",
      (int)AccountInfoInteger(ACCOUNT_LOGIN),
      (int)AccountInfoInteger(ACCOUNT_LOGIN),
      AccountInfoString(ACCOUNT_SERVER),
      AccountInfoString(ACCOUNT_COMPANY),
      marginMode,
      AccountInfoString(ACCOUNT_CURRENCY),
      (int)AccountInfoInteger(ACCOUNT_LEVERAGE),
      AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) ? "true" : "false"
   );

   SendRaw(reg);
}

void OnTimer() {
   if(g_socket == INVALID_HANDLE || !SocketIsConnected(g_socket)) {
      ConnectBridge();
      return;
   }

   while(SocketIsReadable(g_socket) > 0) {
      uchar chunk[1024];
      int read = SocketRead(g_socket, chunk, 1024, 10);
      if(read > 0) {
         string text = CharArrayToString(chunk, 0, read);
         g_rxBuffer += text;
         ProcessBuffer();
      } else {
         break;
      }
   }
}

void ProcessBuffer() {
   int nl = StringFind(g_rxBuffer, "\n");
   while(nl >= 0) {
      string line = StringSubstr(g_rxBuffer, 0, nl);
      g_rxBuffer = StringSubstr(g_rxBuffer, nl + 1);
      DispatchCommand(line);
      nl = StringFind(g_rxBuffer, "\n");
   }
}

void DispatchCommand(string line) {
   StringTrimLeft(line);
   StringTrimRight(line);
   if(StringLen(line) == 0) return;

   if(StringFind(line, "\"ORDER_SUBMIT\"") >= 0) {
      ExecuteOrderSubmit(line);
   } else if(StringFind(line, "\"ORDER_CANCEL\"") >= 0) {
      ExecuteOrderCancel(line);
   } else if(StringFind(line, "\"POSITIONS_GET\"") >= 0) {
      ExecutePositionsGet(line);
   } else if(StringFind(line, "\"ACCOUNT_GET\"") >= 0) {
      ExecuteAccountGet(line);
   } else if(StringFind(line, "\"QUOTE_GET\"") >= 0) {
      ExecuteQuoteGet(line);
   }
}

string ExtractJsonField(string json, string field) {
   string tag = "\"" + field + "\":";
   int start = StringFind(json, tag);
   if(start < 0) return "";
   start += StringLen(tag);
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\"')) start++;
   int end = start;
   while(end < StringLen(json) && StringGetCharacter(json, end) != '\"' && StringGetCharacter(json, end) != ',' && StringGetCharacter(json, end) != '}') end++;
   return StringSubstr(json, start, end - start);
}

void SendRaw(string msg) {
   if(g_socket == INVALID_HANDLE || !SocketIsConnected(g_socket)) return;
   uchar data[];
   StringToCharArray(msg, data, 0, StringLen(msg));
   SocketSend(g_socket, data, ArraySize(data));
}

void ExecuteOrderSubmit(string line) {
   string nonce = ExtractJsonField(line, "nonce");
   string symbol = ExtractJsonField(line, "symbol");
   string side = ExtractJsonField(line, "side");
   double rawQty = StringToDouble(ExtractJsonField(line, "quantity"));
   string magicStr = ExtractJsonField(line, "magic");
   ulong magic = (ulong)StringToInteger(magicStr);
   double sl = StringToDouble(ExtractJsonField(line, "sl"));
   double tp = StringToDouble(ExtractJsonField(line, "tp"));

   if(!SymbolSelect(symbol, true)) {
      SendRaw(StringFormat("{\"type\":\"ORDER_RESULT\",\"nonce\":\"%s\",\"ok\":false,\"retcode\":10013,\"error\":\"Invalid symbol\"}\n", nonce));
      return;
   }

   double contractSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   double volumeStep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double volumeMin = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double volumeMax = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);

   double lots = rawQty;
   if(contractSize > 0.0 && rawQty >= contractSize) {
      lots = rawQty / contractSize;
   }
   if(volumeStep > 0.0) {
      lots = MathFloor(lots / volumeStep) * volumeStep;
   }
   lots = MathMax(volumeMin, MathMin(volumeMax, lots));
   if(lots > InpMaxLot) lots = InpMaxLot;

   MqlTradeRequest req = {};
   MqlTradeResult  res = {};

   req.action = TRADE_ACTION_DEAL;
   req.symbol = symbol;
   req.volume = lots;
   req.type = (side == "buy" || side == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   req.magic = magic;

   // Dynamic filling mode
   uint fill = (uint)SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   if((fill & SYMBOL_FILLING_IOC) != 0) req.type_filling = ORDER_FILLING_IOC;
   else if((fill & SYMBOL_FILLING_FOK) != 0) req.type_filling = ORDER_FILLING_FOK;
   else req.type_filling = ORDER_FILLING_RETURN;

   MqlTick tick;
   SymbolInfoTick(symbol, tick);
   req.price = (req.type == ORDER_TYPE_BUY) ? tick.ask : tick.bid;

   ENUM_SYMBOL_TRADE_EXECUTION execMode = (ENUM_SYMBOL_TRADE_EXECUTION)SymbolInfoInteger(symbol, SYMBOL_TRADE_EXEMODE);
   bool isMarketExec = (execMode == SYMBOL_TRADE_EXECUTION_MARKET);

   if(!isMarketExec) {
      if(sl > 0) req.sl = NormalizeDouble(sl, digits);
      if(tp > 0) req.tp = NormalizeDouble(tp, digits);
   }

   if(!OrderSend(req, res)) {
      SendRaw(StringFormat(
         "{\"type\":\"ORDER_RESULT\",\"nonce\":\"%s\",\"ok\":false,\"retcode\":%d,\"retcodeDescription\":\"%s\"}\n",
         nonce, res.retcode, res.comment
      ));
      return;
   }

   // ECN two-step SL/TP modification after fill
   if(isMarketExec && (sl > 0 || tp > 0)) {
      MqlTradeRequest sltpReq = {};
      MqlTradeResult  sltpRes = {};
      sltpReq.action = TRADE_ACTION_SLTP;
      sltpReq.position = res.order;
      sltpReq.symbol = symbol;
      if(sl > 0) sltpReq.sl = NormalizeDouble(sl, digits);
      if(tp > 0) sltpReq.tp = NormalizeDouble(tp, digits);
      OrderSend(sltpReq, sltpRes);
   }

   SendRaw(StringFormat(
      "{\"type\":\"ORDER_RESULT\",\"nonce\":\"%s\",\"ok\":true,\"ticket\":%d,\"deal\":%d,\"symbol\":\"%s\",\"volume\":%.2f,\"fillPrice\":%.5f,\"retcode\":%d,\"timestamp\":\"%s\"}\n",
      nonce, (int)res.order, (int)res.deal, symbol, res.volume, res.price, res.retcode, TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
   ));
}

void ExecuteOrderCancel(string line) {
   string nonce = ExtractJsonField(line, "nonce");
   ulong ticket = (ulong)StringToInteger(ExtractJsonField(line, "ticket"));

   MqlTradeRequest req = {};
   MqlTradeResult  res = {};
   req.action = TRADE_ACTION_REMOVE;
   req.order = ticket;

   bool ok = OrderSend(req, res);
   SendRaw(StringFormat("{\"type\":\"CANCEL_RESULT\",\"nonce\":\"%s\",\"ok\":%s,\"retcode\":%d}\n",
      nonce, ok ? "true" : "false", res.retcode
   ));
}

void ExecutePositionsGet(string line) {
   string nonce = ExtractJsonField(line, "nonce");
   string json = StringFormat("{\"type\":\"POSITIONS_RESULT\",\"nonce\":\"%s\",\"ok\":true,\"positions\":[", nonce);
   int total = PositionsTotal();
   bool first = true;
   for(int i = 0; i < total; i++) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!first) json += ",";
      first = false;

      string sym = PositionGetString(POSITION_SYMBOL);
      double vol = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double curPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
      double profit = PositionGetDouble(POSITION_PROFIT);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      string side = (posType == POSITION_TYPE_BUY) ? "buy" : "sell";
      ulong magic = PositionGetInteger(POSITION_MAGIC);

      json += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.2f,\"openPrice\":%.5f,\"currentPrice\":%.5f,\"unrealizedPl\":%.2f,\"magic\":\"%I64u\"}",
         (int)ticket, sym, side, vol, openPrice, curPrice, profit, magic
      );
   }
   json += "]}\n";
   SendRaw(json);
}

void ExecuteAccountGet(string line) {
   string nonce = ExtractJsonField(line, "nonce");
   string json = StringFormat(
      "{\"type\":\"ACCOUNT_RESULT\",\"nonce\":\"%s\",\"ok\":true,\"balance\":%.2f,\"equity\":%.2f,\"freeMargin\":%.2f}\n",
      nonce,
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      AccountInfoDouble(ACCOUNT_MARGIN_FREE)
   );
   SendRaw(json);
}

void ExecuteQuoteGet(string line) {
   string nonce = ExtractJsonField(line, "nonce");
   string symbol = ExtractJsonField(line, "symbol");
   if(!SymbolSelect(symbol, true)) {
      SendRaw(StringFormat("{\"type\":\"QUOTE_RESULT\",\"nonce\":\"%s\",\"ok\":false,\"price\":0.0}\n", nonce));
      return;
   }
   MqlTick tick;
   if(SymbolInfoTick(symbol, tick)) {
      SendRaw(StringFormat("{\"type\":\"QUOTE_RESULT\",\"nonce\":\"%s\",\"ok\":true,\"price\":%.5f}\n", nonce, tick.ask));
   } else {
      SendRaw(StringFormat("{\"type\":\"QUOTE_RESULT\",\"nonce\":\"%s\",\"ok\":false,\"price\":0.0}\n", nonce));
   }
}
