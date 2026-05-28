import React from 'react';
import '../styles/Global.css';
import '../styles/Layout.css';
import TopBar from './TopBar';
import SideBar from './SideBar';

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      <TopBar />
      <div className="shell">
        <SideBar />
        <main className="main">{children}</main>
      </div>
    </>
  );
};

export default Shell;
