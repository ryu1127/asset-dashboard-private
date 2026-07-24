import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { seedIfEmpty } from "./db";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Assets from "./pages/Assets";
import Settings from "./pages/Settings";

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedIfEmpty().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="loading">불러오는 중…</div>;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🏠</span>
          <div>
            <div className="brand-title">우리집 자산</div>
            <div className="brand-sub">Asset Dashboard</div>
          </div>
        </div>
        <nav>
          <NavLink to="/dashboard" className="nav-item">
            <span>📊</span> 대시보드
          </NavLink>
          <NavLink to="/transactions" className="nav-item">
            <span>✏️</span> 거래 입력
          </NavLink>
          <NavLink to="/assets" className="nav-item">
            <span>💰</span> 자산 현황
          </NavLink>
          <NavLink to="/settings" className="nav-item">
            <span>⚙️</span> 설정 · 백업
          </NavLink>
        </nav>
        <div className="sidebar-foot">로컬 저장 · 데이터는 이 브라우저에만</div>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
