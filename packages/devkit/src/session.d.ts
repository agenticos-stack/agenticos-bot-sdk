/** Signing a developer in from a terminal, and the credential that results. */

export declare const DEFAULT_API_ORIGIN: string;
export declare const ACTIVE_ORG_HEADER: string;

export interface StoredCredential {
  /** Better Auth session token, presented as `Authorization: Bearer`. */
  token: string;
  email: string;
  /** Present only when the developer pinned one; otherwise the API resolves their last active organization. */
  orgId?: string;
  signedInAt: string;
}

export interface CredentialEnv {
  XDG_CONFIG_HOME?: string;
  [key: string]: string | undefined;
}

export declare function credentialsPath(env?: CredentialEnv): string;

export declare function readCredential(input?: {
  apiOrigin?: string;
  env?: CredentialEnv;
}): Promise<StoredCredential | null>;

export declare function writeCredential(input: {
  apiOrigin: string;
  token: string;
  email: string;
  orgId?: string;
  env?: CredentialEnv;
}): Promise<string>;

export declare function clearCredential(input?: { apiOrigin?: string; env?: CredentialEnv }): Promise<boolean>;

/** Bearer header, plus the active-organization header when one is pinned. */
export declare function authHeaders(credential: StoredCredential | null | undefined): Record<string, string>;

export declare function requestSignInCode(input: {
  apiOrigin?: string;
  email: string;
  fetcher?: typeof fetch;
}): Promise<{ email: string; apiOrigin: string }>;

export declare function completeSignIn(input: {
  apiOrigin?: string;
  email: string;
  otp: string;
  fetcher?: typeof fetch;
}): Promise<{ token: string; apiOrigin: string }>;

export declare function fetchSession(input: {
  apiOrigin?: string;
  credential: StoredCredential;
  fetcher?: typeof fetch;
}): Promise<{ id: string; email: string } | null>;

export interface DevSession {
  devToken: string;
  workspaceId: string;
  expiresAtMs: number;
  title?: string;
  apiOrigin: string;
}

export declare function startDevSession(input: {
  apiOrigin?: string;
  credential: StoredCredential;
  gadgetKey: string;
  title?: string;
  fetcher?: typeof fetch;
}): Promise<DevSession>;

export declare function devSessionEnv(session: DevSession): Record<string, string>;
