import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { postDueRecurring, seedIfEmpty } from "./db";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Budget from "./pages/Budget";
import Recurring from "./pages/Recurring";
import Import from "./pages/Import";
import Assets from "./pages/Assets";
import Settings from "./pages/Settings";

export default function App() {
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem("sidebarOpen") !== "0"
  );

  useEffect(() => {
    seedIfEmpty()
      .then(() => postDueRecurring())
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarOpen", sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  if (!ready) {
    return <div className="loading">불러오는 중…</div>;
  }

  return (
    <div className={"app" + (sidebarOpen ? "" : " sidebar-hidden")}>
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-icon">🏠</span>
            <div>
              <div className="brand-title">우리집 자산</div>
              <div className="brand-sub">Asset Dashboard</div>
            </div>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(false)}
              title="메뉴 숨기기"
            >
              «
            </button>
          </div>
          <nav>
            <NavLink to="/dashboard" className="nav-item">
              <span>📊</span> 대시보드
            </NavLink>
            <NavLink to="/transactions" className="nav-item">
              <span>✏️</span> 거래 입력
            </NavLink>
            <NavLink to="/budget" className="nav-item">
              <span>🎯</span> 예산
            </NavLink>
            <NavLink to="/recurring" className="nav-item">
              <span>🔁</span> 반복 거래
            </NavLink>
            <NavLink to="/import" className="nav-item">
              <span>📥</span> 가져오기
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
      )}

      {!sidebarOpen && (
        <button
          className="sidebar-reopen"
          onClick={() => setSidebarOpen(true)}
          title="메뉴 열기"
        >
          ☰
        </button>
      )}

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/import" element={<Import />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
