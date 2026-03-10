
import pandas as pd
import numpy as np
from datetime import datetime
import logging

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    import lightgbm as lgb
except ImportError:
    pass # Libraries might not be installed yet

# ==========================================
# 📊 STRATEGY ANALYZER
# ==========================================
# Purpose: Helper tools for a Discretionary Trader to find edge.
# 1. Correlation Matrix
# 2. Volatility Regime Detection
# 3. "Digital Assistant" Predictions

class MarketAnalyzer:
    def __init__(self, data: pd.DataFrame):
        """
        Expects a DataFrame with index=Datetime and columns=['close', 'volume', 'returns', ...]
        """
        self.data = data.copy()
        
    def calculate_correlations(self, other_assets: dict):
        """
        Checks correlation between current asset and others (e.g., BTC vs ETH vs SPY).
        other_assets: dict of {'asset_name': pd.Series}
        """
        stats = {}
        for name, series in other_assets.items():
            corr = self.data['close'].corr(series)
            stats[name] = corr
        return stats

    def detect_regime(self, window=20):
        """
        Classifies market into 'Trending' or 'Mean Reverting' based on Hurst Exponent or ADX.
        Simple proxy: Ratio of rolling std dev (Volatility)
        """
        self.data['volatility'] = self.data['close'].pct_change().rolling(window).std()
        self.data['regime'] = np.where(
            self.data['volatility'] > self.data['volatility'].quantile(0.8), 
            'High_Vol', 
            'Low_Vol'
        )
        return self.data['regime'].iloc[-1]

    def train_ml_assistant(self, target_horizon=1):
        """
        Trains a simple 'Assistant' model to predict if price will be UP or DOWN in 'target_horizon' periods.
        Uses: Returns, Volatility, Volume patterns.
        """
        # Feature Engineering
        df = self.data.copy()
        df['ret_1'] = df['close'].pct_change()
        df['ret_5'] = df['close'].pct_change(5)
        df['vol_20'] = df['ret_1'].rolling(20).std()
        
        # Target: 1 if next return > 0, else 0
        df['target'] = (df['close'].shift(-target_horizon) > df['close']).astype(int)
        df.dropna(inplace=True)
        
        features = ['ret_1', 'ret_5', 'vol_20']
        
        # Split & Train
        X = df[features]
        y = df['target']
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)
        
        model = RandomForestClassifier(n_estimators=100, max_depth=3)
        model.fit(X_train, y_train)
        
        accuracy = model.score(X_test, y_test)
        print(f"🤖 ML Assistant Trained. Accuracy on recent unseen data: {accuracy:.2%}")
        
        return model

# Usage Example
if __name__ == "__main__":
    # Create Dummy Data
    dates = pd.date_range(end=datetime.today(), periods=500, freq='H')
    dummy_prices = np.cumprod(1 + np.random.normal(0, 0.001, 500))
    df = pd.DataFrame({'close': dummy_prices}, index=dates)
    
    analyzer = MarketAnalyzer(df)
    
    print("Current Market Regime:", analyzer.detect_regime())
    analyzer.train_ml_assistant()
