/** Envelope tag marking a base64-carried binary value on the RPC wire. */
export const BYTES_TAG: "$bot_bytes_b64";

/** Replaces binary values with `{ $bot_bytes_b64 }` envelopes, depth-first. */
export function encodeBytes(input: unknown): unknown;

/** Restores enveloped values to `Uint8Array`; other values pass through. */
export function decodeBytes(value: unknown): unknown;

/** The encoder as source text, for runtimes that cannot import (host.js). */
export const ENCODE_BYTES_SOURCE: string;

/** The decoder as source text, for embedding in a browser bridge. */
export const DECODE_BYTES_SOURCE: string;
