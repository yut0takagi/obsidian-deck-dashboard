import { Notice, Platform, Plugin, requestUrl } from "obsidian";

export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
}

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
}

interface PluginData {
  google_credentials?: OAuthCredentials;
  google_tokens?: StoredTokens;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;
const SCOPE = SCOPES.join(" ");

export function hasScope(stored: StoredTokens | null, requiredScope: string): boolean {
  if (!stored) return false;
  return stored.scope.split(/\s+/).includes(requiredScope);
}

export const REQUIRED_SCOPES = SCOPES;

export class GoogleOAuth {
  constructor(private plugin: Plugin) {}

  async getCredentials(): Promise<OAuthCredentials | null> {
    const data = (await this.plugin.loadData()) as PluginData | null;
    return data?.google_credentials ?? null;
  }

  async setCredentials(creds: OAuthCredentials): Promise<void> {
    const data = ((await this.plugin.loadData()) ?? {}) as PluginData;
    data.google_credentials = creds;
    await this.plugin.saveData(data);
  }

  async getTokens(): Promise<StoredTokens | null> {
    const data = (await this.plugin.loadData()) as PluginData | null;
    return data?.google_tokens ?? null;
  }

  async setTokens(tokens: StoredTokens): Promise<void> {
    const data = ((await this.plugin.loadData()) ?? {}) as PluginData;
    data.google_tokens = tokens;
    await this.plugin.saveData(data);
  }

  async clearTokens(): Promise<void> {
    const data = ((await this.plugin.loadData()) ?? {}) as PluginData;
    delete data.google_tokens;
    await this.plugin.saveData(data);
  }

  async isAuthenticated(): Promise<boolean> {
    return (await this.getTokens()) !== null;
  }

  /**
   * Returns a valid access_token, refreshing if needed.
   * Throws if not authenticated or refresh fails.
   */
  async getAccessToken(): Promise<string> {
    const tokens = await this.getTokens();
    if (!tokens) throw new Error("認証されていません。コマンドパレットで認証してください。");
    // Refresh if less than 60s remaining
    if (Date.now() < tokens.expires_at - 60_000) {
      return tokens.access_token;
    }
    return await this.refresh(tokens);
  }

  private async refresh(tokens: StoredTokens): Promise<string> {
    const creds = await this.getCredentials();
    if (!creds) throw new Error("OAuth credentials が未設定です。");
    const body = new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }).toString();
    const res = await requestUrl({
      url: TOKEN_URL,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.status >= 400) {
      throw new Error(`Token refresh failed: HTTP ${res.status} ${res.text}`);
    }
    const json = res.json as {
      access_token: string;
      expires_in: number;
      scope: string;
    };
    const next: StoredTokens = {
      access_token: json.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + json.expires_in * 1000,
      scope: json.scope ?? tokens.scope,
    };
    await this.setTokens(next);
    return next.access_token;
  }

  /**
   * Start OAuth loopback flow.
   * Opens browser, spins up local HTTP server, captures code, exchanges for tokens.
   * Desktop only.
   */
  async authenticate(): Promise<void> {
    if (!Platform.isDesktop) {
      throw new Error("OAuth認証はデスクトップ版のみ対応です。");
    }
    const creds = await this.getCredentials();
    if (!creds) {
      throw new Error("先にOAuth credentials を設定してください。");
    }

    // Lazy require Node http/url to avoid pulling them into the mobile bundle.
    /* eslint-disable @typescript-eslint/no-require-imports, import/no-nodejs-modules, no-undef -- Node http/url are desktop-only; lazy require keeps them out of the mobile bundle */
    const http = require("http") as typeof import("http");
    const url = require("url") as typeof import("url");
    /* eslint-enable @typescript-eslint/no-require-imports, import/no-nodejs-modules, no-undef */

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomString(16);

    const { port, codePromise, close } = await startLoopbackServer(http, url, state);
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const authParams = new URLSearchParams({
      client_id: creds.client_id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    const authUrl = `${AUTH_URL}?${authParams.toString()}`;
    new Notice("ブラウザでGoogle認証を開きます…");
    window.open(authUrl, "_blank");

    let code: string;
    try {
      code = await codePromise;
    } finally {
      close();
    }

    // Exchange code for tokens
    const body = new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString();
    const res = await requestUrl({
      url: TOKEN_URL,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.status >= 400) {
      throw new Error(`Token exchange failed: HTTP ${res.status} ${res.text}`);
    }
    const json = res.json as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };
    if (!json.refresh_token) {
      throw new Error(
        "refresh_token が返ってきません。Google Cloud Console で「OAuth 同意画面」のテストユーザーに自分を追加して再試行してください。"
      );
    }
    await this.setTokens({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + json.expires_in * 1000,
      scope: json.scope,
    });
    new Notice("✅ Google Calendar 認証完了");
  }
}

interface LoopbackResult {
  port: number;
  codePromise: Promise<string>;
  close: () => void;
}

async function startLoopbackServer(
  http: typeof import("http"),
  url: typeof import("url"),
  expectedState: string
): Promise<LoopbackResult> {
  return new Promise((resolve, reject) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const codePromise = new Promise<string>((rc, rj) => {
      resolveCode = rc;
      rejectCode = rj;
    });

    const server = http.createServer((req, res) => {
      try {
        const parsed = url.parse(req.url ?? "", true);
        if (parsed.pathname !== "/callback") {
          res.writeHead(404);
          res.end();
          return;
        }
        const q = parsed.query;
        if (q.error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>OAuth エラー</h1><p>${String(q.error)}</p>`);
          rejectCode(new Error(`OAuth error: ${String(q.error)}`));
          return;
        }
        if (q.state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>state 不一致</h1>`);
          rejectCode(new Error("OAuth state mismatch"));
          return;
        }
        if (typeof q.code !== "string") {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>code がありません</h1>`);
          rejectCode(new Error("OAuth code missing"));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><html><head><title>認証完了</title></head><body style="font-family:system-ui;padding:40px;text-align:center;"><h1>✅ 認証完了</h1><p>このタブを閉じてObsidianに戻ってください。</p></body></html>`
        );
        resolveCode(q.code);
      } catch (e) {
        rejectCode(e as Error);
      }
    });

    server.on("error", (e) => reject(e));

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "string" || addr === null) {
        reject(new Error("Failed to determine loopback port"));
        return;
      }
      // Timeout after 5 min
      const timer: number = window.setTimeout(() => {
        rejectCode(new Error("認証がタイムアウトしました (5分)。"));
      }, 5 * 60 * 1000);
      const close = () => {
        window.clearTimeout(timer);
        server.close();
      };
      resolve({ port: addr.port, codePromise, close });
    });
  });
}

function randomString(len: number): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCodeVerifier(): string {
  return randomString(32);
}

async function sha256Base64Url(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
