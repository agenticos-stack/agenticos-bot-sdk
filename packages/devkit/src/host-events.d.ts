export interface HostEventsPort {
  postMessage(message: { event: { type: string } }): void;
}

export interface HostEventsSource {
  onopen: (() => void) | null;
  onmessage: ((message: { data: string }) => void) | null;
  close(): void;
}

export interface AttachHostEventsOptions {
  EventSourceImpl: new (url: string) => HostEventsSource;
  url?: string;
  getPort(): HostEventsPort | undefined;
  port: HostEventsPort;
  /** A stream being replaced; closed before the new one attaches. */
  previous?: { close(): void };
}

/**
 * Live feed of host-observed changes for a connected canvas. Every open —
 * including each EventSource reconnection — posts `reconnected`, and the
 * canvas re-reads through its authoritative API.
 */
export function attachHostEvents(options: AttachHostEventsOptions): { close(): void };
