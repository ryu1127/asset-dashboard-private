import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
// DriveBar(가계부 백업): 데이터 원본이 구글 시트로 바뀐 뒤로는 백업할 게
// 시트 연결 정보뿐이라 상단 바에서는 뺐다. 나중에 기본 시트가 아닌 다른
// 시트로 바꿔 쓰는 기기가 여러 대가 되면 다시 켤 수 있으니 지우지 않고 둠 —
// 정리 대기 목록: DriveBar 자체를 없앨지, 설정 화면 안으로 옮길지 결정하기.
// import DriveBar from "./components/DriveBar";
import Assets from "./pages/Assets";
import Ledger from "./pages/Ledger";
import Settings from "./pages/Settings";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem("sidebarOpen") !== "0"
  );

  useEffect(() => {
    localStorage.setItem("sidebarOpen", sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

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
            <NavLink to="/ledger" className="nav-item">
              <span>📒</span> 가계부
            </NavLink>
            <NavLink to="/assets" className="nav-item">
              <span>📈</span> 자산
            </NavLink>
            <NavLink to="/settings" className="nav-item">
              <span>⚙️</span> 설정
            </NavLink>
          </nav>
          <div className="sidebar-foot">구글 시트 기반 · 읽기 전용</div>
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
          <Route path="/" element={<Navigate to="/ledger" replace />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
