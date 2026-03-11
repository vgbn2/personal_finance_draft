# Mock classes for local development/testing to silence ImportErrors
from datetime import datetime, timedelta
import collections

class Resolution:
    Daily = "Daily"
    Minute = "Minute"
    Hour = "Hour"

class Universe:
    Unchanged = "Unchanged"

class OrderFee:
    def __init__(self, amount):
        pass

class CashAmount:
    def __init__(self, amount, currency):
        pass

class FeeModel:
    pass

class Symbol:
    def __init__(self, value):
        self.Value = value

class Security:
    def __init__(self):
        self.Price = 0
        self.Symbol = Symbol("")
        
    def SetFeeModel(self, model):
        pass
        
    def SetLeverage(self, leverage):
        pass

class RollingWindow(collections.deque):
    def __init__(self, size):
        super().__init__(maxlen=size)
    def IsReady(self):
        return len(self) == self.maxlen
    def Add(self, item):
        self.append(item)

class QCAlgorithm:
    def SetStartDate(self, year, month, day):
        pass
    def SetCash(self, cash):
        pass
    def AddEquity(self, ticker, resolution):
        return Security()
    def AddData(self, type, ticker, resolution):
        return Security()
    def AddUniverse(self, coarse_func, fine_func=None):
        pass
    def SetHoldings(self, symbol, percentage):
        pass
    def Liquidate(self, symbol=None):
        pass
    def Log(self, message):
        print(message)
    def History(self, symbol, period, resolution):
        import pandas as pd
        return pd.DataFrame()
    
    class Time:
        month = 1
        year = 2000
        day = 1
        date = datetime(2000, 1, 1).date
    
    class DateRules:
        def MonthStart(self, symbol): pass
        def MonthEnd(self, symbol): pass
        
    class TimeRules:
        def AfterMarketOpen(self, symbol): pass
        
    class Schedule:
        def On(self, date_rule, time_rule, func): pass

    class Portfolio:
        Invested = False
        def __getitem__(self, key): return None
        class Value:
            Invested = False
            Key = None
            
    class UniverseSettings:
        Resolution = Resolution.Daily

class PythonQuandl:
    pass

class PythonData:
    pass

class SubscriptionDataSource:
    def __init__(self, source, type, format):
        pass

class SubscriptionTransportMedium:
    RemoteFile = "RemoteFile"

class FileFormat:
    Csv = "Csv"

# Helper for VolumeData
class VolumeData:
    def __init__(self, date, volume, was_announcement):
        self.Date = date
        self.Volume = volume
        self.WasAnnouncementMonth = was_announcement
