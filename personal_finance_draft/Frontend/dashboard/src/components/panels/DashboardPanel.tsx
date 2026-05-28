import React from 'react';
import '../../styles/Components.css';

const DashboardPanel: React.FC = () => {
  return (
    <div className="panel active">
      <div className="banner banner-amber">
        <span><strong>Active prototype.</strong> Local ingestion, validation, research, and dashboard review are wired in, while live execution remains gated.</span>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-title">Current Focus</span></div>
        <div className="card-body">
          The repo now favors real CLI, web, deployment, and research seams over empty shells.
        </div>
      </div>
    </div>
  );
};

export default DashboardPanel;
