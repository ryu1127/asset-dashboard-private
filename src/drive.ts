// Google Drive backup sync using Google Identity Services (browser-only OAuth,
// no client secret, no server). Stores a single JSON file (via the drive.file
// scope, so this app can only see files it created itself) in the user's own
// Drive.

const CLIENT_ID =
  "1030627223748-dtferlqfodgm5mo25im7jhs95kasu0p4.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const BACKUP_FILENAME = "asset-dashboard-backup.json";
const LAST_SAVED_KEY = "driveLastSavedAt";
const TOKEN_KEY = "driveToken";
const EVER_CONNECTED_KEY = "driveEverConnected";

// 마지막으로 「드라이브에 저장」이 성공한 시각 (이 브라우저 기준)
export function getLastSavedAt(): Date | null {
  const raw = localStorage.getItem(LAST_SAVED_KEY);
  return raw ? new Date(raw) : null;
}

function markSaved() {
  localStorage.setItem(LAST_SAVED_KEY, new Date().toISOString());
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: {
              access_token?: string;
              expires_in?: number;
              error?: string;
            }) => void;
          }): { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

// 액세스 토큰을 로컬 저장소에 남겨서, 유효 기간(보통 1시간) 안에는
// 새로고침해도 다시 로그인할 필요가 없게 한다. 리프레시 토큰은 서버(비밀
// 클라이언트) 없이는 발급받을 수 없어서, 만료 이후에는 다시 연결이 필요함.
function loadStoredToken(): string | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as { accessToken: string; expiresAt: number };
    if (t.expiresAt > Date.now()) return t.accessToken;
  } catch {
    // 저장된 값이 손상된 경우 무시
  }
  return null;
}

function storeToken(token: string, expiresInSec: number) {
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({
      accessToken: token,
      // 만료 60초 전을 기준으로 잡아 경계에서 실패하지 않게 여유를 둠
      expiresAt: Date.now() + expiresInSec * 1000 - 60_000,
    })
  );
  localStorage.setItem(EVER_CONNECTED_KEY, "1");
}

let accessToken: string | null = loadStoredToken();

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("구글 로그인 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

export function isSignedIn(): boolean {
  return accessToken !== null;
}

function requestToken(prompt: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? "로그인에 실패했습니다."));
          return;
        }
        accessToken = resp.access_token;
        storeToken(resp.access_token, resp.expires_in ?? 3600);
        resolve();
      },
    });
    client.requestAccessToken({ prompt });
  });
}

export async function signIn(): Promise<void> {
  await loadGis();
  // 예전에 한 번이라도 연결한 적이 있으면, 동의 화면 없이 조용히 토큰만
  // 다시 받아오는 걸 먼저 시도한다 (이미 허용했다는 걸 구글이 기억함).
  // 실패하면(예: 권한 취소) 원래대로 동의 화면을 띄운다.
  if (localStorage.getItem(EVER_CONNECTED_KEY) === "1") {
    try {
      await requestToken("");
      return;
    } catch {
      // 조용한 재연결 실패 → 아래에서 동의 화면으로 재시도
    }
  }
  await requestToken("consent");
}

export function signOut() {
  accessToken = null;
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  if (!accessToken) throw new Error("구글 계정에 먼저 로그인하세요.");
  return { Authorization: `Bearer ${accessToken}` };
}

async function findBackupFileId(): Promise<string | null> {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error("드라이브 조회에 실패했습니다.");
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

export async function uploadToDrive(json: string): Promise<void> {
  const fileId = await findBackupFileId();
  const metadata = { name: BACKUP_FILENAME, mimeType: "application/json" };
  const boundary = "asset-dashboard-boundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error("드라이브 저장에 실패했습니다.");
  markSaved();
}

export async function downloadFromDrive(): Promise<string> {
  const fileId = await findBackupFileId();
  if (!fileId) throw new Error("드라이브에 저장된 백업이 없습니다. 먼저 저장하세요.");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error("드라이브 불러오기에 실패했습니다.");
  return res.text();
}
