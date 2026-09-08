export declare const GADGET_TRANSPORT_PROTOCOL: "agenticos.gadget.transport.v1";

export interface GadgetSelectedRecord {
  type: string;
  id: string;
  revision?: number;
}

export interface GadgetHostContext {
  protocolVersion: typeof GADGET_TRANSPORT_PROTOCOL;
  gadgetId?: string;
  revision?: number;
  selected?: readonly GadgetSelectedRecord[];
}

export interface GadgetCallRequest {
  protocolVersion: string;
  method: string;
  args?: readonly unknown[];
  context?: GadgetHostContext;
}

export interface GadgetCallSuccess<T = unknown> {
  ok: true;
  value?: T;
  /** Non-negative safe integer when supplied. */
  revision?: number;
  changedSinceSeen?: unknown;
}

export interface GadgetCallRefusal {
  ok: false;
  code: string;
  message: string;
  retryable?: boolean;
  pending?: boolean;
  /** Non-empty host receipt identifier when supplied. */
  correlationId?: string;
  [key: string]: unknown;
}

export type GadgetCallResult<T = unknown> = GadgetCallSuccess<T> | GadgetCallRefusal;
export type GadgetFixtureHandler = (
  args: readonly unknown[],
  context: GadgetHostContext,
  request: GadgetCallRequest
) => GadgetCallResult | Promise<GadgetCallResult>;

export interface GadgetFixtureTransport {
  readonly mode: "fixture";
  call(request: GadgetCallRequest, options?: { signal?: AbortSignal }): Promise<GadgetCallResult>;
  subscribe(listener: (event: unknown) => void): () => void;
  emit(event: unknown): void;
  close(): void;
  readonly closed: boolean;
}

export interface GadgetTransport {
  call(request: GadgetCallRequest, options?: { signal?: AbortSignal }): Promise<GadgetCallResult>;
  subscribe(listener: (event: unknown) => void): () => void;
  close(): void;
  readonly closed: boolean;
}

export interface FixtureTransportOptions {
  handlers?: Map<string, GadgetFixtureHandler> | Record<string, GadgetFixtureHandler>;
}

export declare function createFixtureTransport(options?: FixtureTransportOptions): GadgetFixtureTransport;

/** Host-resolved identity, never an authorization grant. One adapter per identity. */
export interface GadgetChatContext {
  readonly workspaceId: string;
  readonly conversationId: string;
}

export interface GadgetChatSendInput {
  text: string;
  /** Non-empty idempotency/receipt identifier when supplied; the host owns its semantics. */
  clientMessageId?: string;
  selected?: readonly GadgetSelectedRecord[];
}

export interface GadgetChatAnswerInput {
  actionId: string;
  approve: boolean;
}

export interface GadgetChatAdapter {
  readonly context: GadgetChatContext;
  readonly closed: boolean;
  /** Cursor must be non-empty; limit must be a positive safe integer. Hosts must refuse unsupported pagination. */
  loadHistory(input?: { cursor?: string; limit?: number }, options?: { signal?: AbortSignal }): Promise<GadgetCallResult>;
  /** A success receipt must come from the host, not inferred from a void return. */
  send(input: GadgetChatSendInput, options?: { signal?: AbortSignal }): Promise<GadgetCallResult>;
  stop(options?: { signal?: AbortSignal }): Promise<GadgetCallResult>;
  answer(input: GadgetChatAnswerInput, options?: { signal?: AbortSignal }): Promise<GadgetCallResult>;
  subscribe(listener: (event: unknown) => void): () => void;
  close(): void;
}

export interface GadgetFixtureChatAdapter extends GadgetChatAdapter {
  readonly mode: "fixture";
  emit(event: unknown): void;
}

export type GadgetFixtureChatHandler = (
  input: unknown,
  identity: GadgetChatContext,
  context: GadgetHostContext
) => GadgetCallResult | Promise<GadgetCallResult>;

export declare function createFixtureChatAdapter(options: {
  context: GadgetChatContext;
  handlers?: Partial<Record<"loadHistory" | "send" | "stop" | "answer", GadgetFixtureChatHandler>>;
}): GadgetFixtureChatAdapter;
