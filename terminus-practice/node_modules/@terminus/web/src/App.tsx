import React, { useEffect, useState } from 'react';
import { useMarketDataStore } from './stores/marketDataStore';

const App: React.FC = () => {
  const { marketData, updateMarketData } = useMarketDataStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mocking some data updates for now
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    symbols.forEach((symbol, index) => {
      updateMarketData(symbol, {
        price: 50000 + index * 1000,
        change24h: (Math.random() * 10 - 5)
      });
    });
    setLoading(false);
  }, [updateMarketData]);

  return (
    <div className="app-container">
      <header>
        <h1>Terminus Practice</h1>
        <div className="status">Status: {loading ? 'Loading...' : 'Connected'}</div>
      </header>
      <main>
        <div className="market-grid">
          {Object.values(marketData).map((data) => (
            <div key={data.symbol} className="market-card">
              <h3>{data.symbol}</h3>
              <p className="price">${data.price.toLocaleString()}</p>
              <p className={`change ${data.change24h >= 0 ? 'bull' : 'bear'}`}>
                {data.change24h.toFixed(2)}%
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default App;
