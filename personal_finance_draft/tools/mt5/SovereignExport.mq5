#property strict
#property script_show_inputs

input string SymbolsCsv = "EURUSD,GBPUSD,USDJPY,XAUUSD,USOIL,BTCUSD";
input int M1Bars = 5;
input int CalendarLookbackHours = 24;
input int CalendarLookaheadHours = 72;
input string OutputFile = "headway_mt5_quotes.json";

string Trim(string value)
{
   StringTrimLeft(value);
   StringTrimRight(value);
   return value;
}

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   return value;
}

void WriteStringField(int handle, string name, string value, bool comma = true)
{
   FileWriteString(handle, "\"" + name + "\":\"" + JsonEscape(value) + "\"");
   if(comma) FileWriteString(handle, ",");
}

void WriteNumberField(int handle, string name, double value, bool comma = true)
{
   FileWriteString(handle, "\"" + name + "\":" + DoubleToString(value, 8));
   if(comma) FileWriteString(handle, ",");
}

void WriteLongField(int handle, string name, long value, bool comma = true)
{
   FileWriteString(handle, "\"" + name + "\":" + IntegerToString(value));
   if(comma) FileWriteString(handle, ",");
}

void WriteQuote(int handle, string symbol, bool &first)
{
   if(!SymbolSelect(symbol, true)) return;

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick)) return;

   if(!first) FileWriteString(handle, ",");
   first = false;

   FileWriteString(handle, "{");
   WriteStringField(handle, "family", "");
   WriteStringField(handle, "provider", "headway_mt5");
   WriteStringField(handle, "symbol", symbol);
   WriteStringField(handle, "timeframe", "tick");
   WriteStringField(handle, "timestamp", TimeToString((datetime)tick.time, TIME_DATE | TIME_SECONDS));
   WriteNumberField(handle, "bid", tick.bid);
   WriteNumberField(handle, "ask", tick.ask);
   WriteNumberField(handle, "last", tick.last);
   WriteNumberField(handle, "close", tick.last > 0.0 ? tick.last : (tick.bid + tick.ask) / 2.0);
   WriteNumberField(handle, "volume", (double)tick.volume, false);
   FileWriteString(handle, "}");
}

void WriteBars(int handle, string symbol, bool &first)
{
   if(!SymbolSelect(symbol, true)) return;

   MqlRates rates[];
   int copied = CopyRates(symbol, PERIOD_M1, 0, M1Bars, rates);
   if(copied <= 0) return;

   ArraySetAsSeries(rates, false);
   for(int index = 0; index < copied; index++)
   {
      MqlRates bar = rates[index];
      if(!first) FileWriteString(handle, ",");
      first = false;

      FileWriteString(handle, "{");
      WriteStringField(handle, "family", "");
      WriteStringField(handle, "provider", "headway_mt5");
      WriteStringField(handle, "symbol", symbol);
      WriteStringField(handle, "timeframe", "1m");
      WriteStringField(handle, "timestamp", TimeToString(bar.time, TIME_DATE | TIME_SECONDS));
      WriteNumberField(handle, "open", bar.open);
      WriteNumberField(handle, "high", bar.high);
      WriteNumberField(handle, "low", bar.low);
      WriteNumberField(handle, "close", bar.close);
      WriteNumberField(handle, "volume", (double)bar.tick_volume, false);
      FileWriteString(handle, "}");
   }
}

void WriteCalendarEvents(int handle)
{
   FileWriteString(handle, "\"events\":[");

   MqlCalendarValue values[];
   datetime from = TimeCurrent() - CalendarLookbackHours * 3600;
   datetime to = TimeCurrent() + CalendarLookaheadHours * 3600;
   int count = CalendarValueHistory(values, from, to);
   int written = 0;

   for(int index = 0; index < count && written < 100; index++)
   {
      MqlCalendarEvent event;
      MqlCalendarCountry country;
      if(!CalendarEventById(values[index].event_id, event)) continue;
      CalendarCountryById(event.country_id, country);

      if(written > 0) FileWriteString(handle, ",");
      written++;

      FileWriteString(handle, "{");
      WriteStringField(handle, "provider", "headway_mt5_calendar");
      WriteStringField(handle, "timestamp", TimeToString(values[index].time, TIME_DATE | TIME_SECONDS));
      WriteStringField(handle, "country", country.code);
      WriteStringField(handle, "currency", country.currency);
      WriteStringField(handle, "name", event.name);
      WriteLongField(handle, "importance", event.importance);
      WriteLongField(handle, "actual", values[index].actual_value);
      WriteLongField(handle, "forecast", values[index].forecast_value);
      WriteLongField(handle, "previous", values[index].prev_value, false);
      FileWriteString(handle, "}");
   }

   FileWriteString(handle, "]");
}

void OnStart()
{
   int handle = FileOpen(OutputFile, FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      Print("SovereignExport failed to open output: ", OutputFile, " error=", GetLastError());
      return;
   }

   string symbols[];
   int symbolCount = StringSplit(SymbolsCsv, ',', symbols);

   FileWriteString(handle, "{");
   WriteStringField(handle, "schema_version", "1");
   WriteStringField(handle, "source", "mt5");
   WriteStringField(handle, "provider", "headway_mt5");
   WriteStringField(handle, "generated_at", TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS));
   FileWriteString(handle, "\"quotes\":[");

   bool first = true;
   for(int i = 0; i < symbolCount; i++)
   {
      string symbol = Trim(symbols[i]);
      if(symbol == "") continue;
      WriteQuote(handle, symbol, first);
      WriteBars(handle, symbol, first);
   }

   FileWriteString(handle, "],");
   WriteCalendarEvents(handle);
   FileWriteString(handle, "}");
   FileClose(handle);
   Print("SovereignExport wrote ", OutputFile);
}
