import { Notice, Platform, Plugin, requestUrl } from "obsidian";
import { SecretStore } from "../core/secrets";
import { t } from "../core/i18n";

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
  // Client secret and tokens go to Obsidian's secret storage when available
  // (see SecretStore); older Obsidian versions keep them in data.json.
  private readonly secrets: SecretStore;

  constructor(private plugin: Plugin) {
    this.secrets = new SecretStore(plugin);
  }

  async getCredentials(): Promise<OAuthCredentials | null> {
    return await this.secrets.get<OAuthCredentials>("google_credentials");
  }

  async setCredentials(creds: OAuthCredentials): Promise<void> {
    await this.secrets.set("google_credentials", creds);
  }

  async getTokens(): Promise<StoredTokens | null> {
    return await this.secrets.get<StoredTokens>("google_tokens");
  }

  async setTokens(tokens: StoredTokens): Promise<void> {
    await this.secrets.set("google_tokens", tokens);
  }

  async clearTokens(): Promise<void> {
    await this.secrets.set("google_tokens", null);
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
    if (!tokens) throw new Error(t().googleOAuthNotAuthenticatedAuthenticateFromThe);
    // Refresh if less than 60s remaining
    if (Date.now() < tokens.expires_at - 60_000) {
      return tokens.access_token;
    }
    return await this.refresh(tokens);
  }

  private async refresh(tokens: StoredTokens): Promise<string> {
    const creds = await this.getCredentials();
    if (!creds) throw new Error(t().googleOAuthOauthCredentialsAreNotConfigured);
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
      throw new Error(t().googleOAuthOauthAuthenticationIsOnlySupported);
    }
    const creds = await this.getCredentials();
    if (!creds) {
      throw new Error(t().googleOAuthConfigureOauthCredentialsFirst);
    }

    // Lazy require Node http/url to avoid pulling them into the mobile bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- Node http is desktop-only; lazy require keeps it out of the mobile bundle
    const http = require("http") as typeof import("http");
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- Node url is desktop-only; lazy require keeps it out of the mobile bundle
    const url = require("url") as typeof import("url");

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
    new Notice(t().googleOAuthOpeningGoogleAuthenticationInYour);
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
        t().googleOAuthNoRefreshTokenReturnedAdd
      );
    }
    await this.setTokens({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + json.expires_in * 1000,
      scope: json.scope,
    });
    new Notice(t().googleOAuthGoogleAuthenticationComplete);
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
          res.end(t().googleOAuthH1OauthErrorH1P(String(q.error)));
          rejectCode(new Error(`OAuth error: ${String(q.error)}`));
          return;
        }
        if (q.state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(t().googleOAuthH1StateMismatchH1);
          rejectCode(new Error("OAuth state mismatch"));
          return;
        }
        if (typeof q.code !== "string") {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(t().googleOAuthH1MissingAuthorizationCodeH1);
          rejectCode(new Error("OAuth code missing"));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          t().googleOAuthDoctypeHtmlHtmlHeadTitle
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
        rejectCode(new Error(t().googleOAuthAuthenticationTimedOut5Minutes));
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
