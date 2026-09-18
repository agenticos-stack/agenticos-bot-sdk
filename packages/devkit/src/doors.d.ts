/** A refusal is a known answer before any effect; everything else is unknown. */
export class DoorRefusal extends Error {
  constructor(message: string, code?: string);
  code: string;
  certainty: "refused";
}

export function refuse(message: string, code?: string): DoorRefusal;
export function isRefusal(error: unknown): error is DoorRefusal;

/** 409 refused only for a refusal; 502 unknown otherwise. */
export function doorFailureResponse(error: unknown, fallback: string): Response;

export interface DoorRuntimeAgent {
  grantDoor(input: unknown, credential: unknown): Promise<{ requirementKey: string; [key: string]: unknown }>;
  grantedDoorKeys(): Promise<unknown>;
}

export interface DoorRuntime {
  grant(input: unknown, credential: unknown): Promise<Record<string, unknown>>;
  activate(input: unknown): Promise<{ requirementKey: string; runtime: unknown }>;
}

/** Consent and activation as separate answers; recovery never writes a grant. */
export function createDoorRuntime(options: {
  agent: DoorRuntimeAgent;
  activateRuntime(force: boolean, requirementKey: string): Promise<unknown>;
}): DoorRuntime;

export type GrantReceiptOutcome =
  | { outcome: "denied"; message: string }
  | { outcome: "activated"; message?: string }
  | { outcome: "activation_failed"; message?: string }
  | { outcome: "unconfirmed"; message: string };

/** Strict reading of a grant/activation receipt: only an explicit runtime answer is an answer. */
export function grantReceiptOutcome(response: { ok?: boolean; status?: number; bodyText?: string }): GrantReceiptOutcome;
