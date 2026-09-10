/**
 * How binary values cross the development host's HTTP hop.
 *
 * The browser talks to a local gadget over JSON, and JSON has no typed arrays.
 * A `Uint8Array` therefore serialises as an object keyed by index —
 * `{"0":137,"1":80,…}` — which costs about nine characters per byte and
 * arrives as an object with one own property per byte. Measured on a 137,523
 * byte image from a real gadget:
 *
 *     as index-keyed JSON   1,612,773 chars   11.7x
 *     as base64               183,364 chars    1.33x
 *
 *     stringify 24ms · parse 11ms · rebuild loop 13ms · structuredClone 20ms
 *
 * That last figure is the sharp one: `structuredClone` of an object with
 * 137,523 own properties takes 20ms, against 0ms for the same bytes as a
 * string — and the value is cloned again on every `postMessage` hop between
 * the host page and the sandboxed canvas. A gadget that shows a grid of
 * pictures pays all of it, per picture, twice.
 *
 * `new Uint8Array(thatObject)` also returns an EMPTY array rather than
 * failing, so a decoder that forgets the shape loses the bytes silently. An
 * envelope that says what it is cannot be misread that way.
 *
 * PRODUCTION DOES NOT USE THIS. capnweb carries typed arrays natively; this
 * exists because the development host is plain HTTP + `postMessage`. Nor does
 * STORAGE use it: a gadget's SQLite binds media as raw BLOB parameters
 * precisely so a 1 MiB value does not inflate to 1.33 MiB of TEXT against the
 * 2 MB row ceiling. Base64 is for the wire, and only this wire.
 */

/** The envelope key. Distinctive enough that no gadget payload collides with it. */
export const BYTES_TAG = "$bot_bytes_b64";

function isBytes(value) {
  return value instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(value));
}

/** A Node Buffer that already lost its type crossing the isolate boundary. */
function serialisedBuffer(value) {
  return value && typeof value === "object" && value.type === "Buffer" && Array.isArray(value.data);
}

function toBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length).toString("base64");
  // Chunked: `String.fromCharCode(...bytes)` overflows the argument list on
  // anything of interesting size, which is every image this carries.
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/**
 * Replaces every binary value in `input` with its envelope, leaving the rest
 * of the structure alone. Depth-first over plain objects and arrays only —
 * anything with a prototype is handed back untouched, because rewriting a
 * class instance is not this function's business.
 */
export function encodeBytes(input) {
  if (isBytes(input)) return { [BYTES_TAG]: toBase64(input) };
  if (serialisedBuffer(input)) return { [BYTES_TAG]: toBase64(Uint8Array.from(input.data)) };
  if (Array.isArray(input)) return input.map(encodeBytes);
  if (!input || typeof input !== "object") return input;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return input;
  const out = {};
  for (const [key, value] of Object.entries(input)) out[key] = encodeBytes(value);
  return out;
}

/**
 * The matching decoder, as source, for embedding in a browser bridge.
 *
 * Shipped as a string rather than a module because the bridges that need it
 * are assembled into an inline `<script>` for a sandboxed frame that cannot
 * import anything. Kept here so both halves of the wire format live in one
 * file: an encoder and a decoder maintained in separate repositories is a
 * format with no owner.
 */
export const DECODE_BYTES_SOURCE = `
function __botDecodeBytes(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(__botDecodeBytes);
  var encoded = value[${JSON.stringify(BYTES_TAG)}];
  if (typeof encoded === 'string') {
    var binary = atob(encoded);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  var out = {};
  for (var key in value) if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = __botDecodeBytes(value[key]);
  return out;
}`;
