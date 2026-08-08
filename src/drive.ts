// Google Drive backup sync using Google Identity Services (browser-only OAuth,
// no client secret, no server). Stores a single JSON file (via the drive.file
// scope, so this app can only see files it created itself) in the user's own
// Drive.

const CLIENT_ID =
  "1030627223748-dtferlqfodgm5mo25im7jhs95kasu0p4.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const BACKUP_FILENAME = "asset-dashboard-backup.json";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

let accessToken: string | null = null;

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

export async function signIn(): Promise<void> {
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? "로그인에 실패했습니다."));
          return;
        }
        accessToken = resp.access_token;
        resolve();
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

export function signOut() {
  accessToken = null;
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
