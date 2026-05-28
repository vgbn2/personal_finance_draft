import React from 'react';
import '../styles/Layout.css';

const SideBar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div className="sb-group">
        <span className="sb-label">Market Data</span>
        <div className="sb-item active">Overview</div>
        <div className="sb-item">Equities <span className="sb-tag tag-off">off</span></div>
        <div className="sb-item">Crypto <span className="sb-tag tag-off">off</span></div>
        <div className="sb-item">FX / Macro <span className="sb-tag tag-off">off</span></div>
        <div className="sb-item">Indices <span className="sb-tag tag-off">off</span></div>
      </div>
      <div className="sb-group">
        <span className="sb-label">Research</span>
        <div className="sb-item">CNN Signals <span className="sb-tag tag-sc">p3</span></div>
        <div className="sb-item">Backtester <span className="sb-tag tag-sc">p3</span></div>
        <div className="sb-item">Hypotheses <span className="sb-tag tag-sc">live</span></div>
      </div>
      <div className="sb-group">
        <span className="sb-label">Execution</span>
        <div className="sb-item">Paper Trade <span className="sb-tag tag-off">off</span></div>
        <div className="sb-item">Broker API <span className="sb-tag tag-off">off</span></div>
        <div className="sb-item">Kill Switch <span className="sb-tag tag-sc">p5</span></div>
      </div>
      <div className="sb-group">
        <span className="sb-label">Monitoring</span>
        <div className="sb-item">Portfolio <span className="sb-tag tag-sc">p5</span></div>
        <div className="sb-item">Risk Gates <span className="sb-tag tag-sc">p5</span></div>
        <div className="sb-item">Exposure <span className="sb-tag tag-sc">p5</span></div>
      </div>
      <div className="sb-group">
        <span className="sb-label">System</span>
        <div className="sb-item">Config</div>
        <div className="sb-item">Docs</div>
      </div>
    </aside>
  );
};

export default SideBar;
