import { Link } from "react-router-dom";

export default function ConnectSheetPrompt({
  loading,
  error,
  onConnect,
}: {
  loading: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  return (
    <div className="card">
      <h3>구글 시트에 연결해주세요</h3>
      <p className="muted">
        거래내역·예산설정·자산현황을 관리하는 가계부 구글 시트에 연결하면 대시보드가
        자동으로 채워집니다.
      </p>
      {error && <p className="error-text">{error}</p>}
      <div className="row-btns">
        <button className="btn-primary" disabled={loading} onClick={onConnect}>
          {loading ? "연결 중…" : "구글 계정 연결"}
        </button>
        <Link className="btn-secondary" to="/settings">
          다른 시트로 연결하기
        </Link>
      </div>
    </div>
  );
}
