import React from 'react';
import '../styles/TopBar.css';

const TopBar: React.FC = () => {
  return (
    <header className="topbar">
      <div className="brand"><div className="brand-dot"></div>Sovereign <em>Trading</em></div>
      <nav className="tabs">
        <button className="tab active">Dashboard</button>
        <button className="tab">Markets</button>
        <button className="tab">Signals</button>
        <button className="tab">Backtests</button>
        <button className="tab">Portfolio</button>
        <button className="tab">Execution</button>
        <button className="tab">Research</button>
      </nav>
      <div className="topbar-right">
        <span className="pill amber">Active Prototype</span>
        <span className="pill cyan">Paper Mode</span>
        <span className="clock">--:--:-- UTC</span>
      </div>
    </header>
  );
};

export default TopBar;
