// bot-shell client — the one module that calls the gadget's server.
//
// Every RPC a canvas makes goes through `createRpc`, so a contract change on
// the server side touches the bot's own method list rather than every view
// module that happens to need a row. Each member is a thin pass-through to
// `globalThis.gadget.<method>` — nothing here decides anything; that is the
// facet's job on the data this returns.

/**
 * Wraps the sandbox's `globalThis.gadget` stub — the capnweb RpcStub the host
 * handshake produced — with one caller per declared method name.
 *
 * The method list is the bot's own: the package cannot know which facet it is
 * talking to, and an unlisted method stays unreachable so a typo in a view
 * fails loudly instead of dispatching anyway.
 */
export function createRpc(gadget, methods) {
  if (!gadget) throw new Error("createRpc requires the sandboxed gadget stub.");
  if (!Array.isArray(methods) || !methods.length) throw new Error("createRpc requires the bot's method list.");
  const api = {};
  for (const name of methods) {
    if (typeof name !== "string" || !name) throw new Error("createRpc method names must be non-empty strings.");
    api[name] = (...args) => gadget[name](...args);
  }
  return api;
}

/**
 * One chunk's bytes, in whichever shape they survived the trip.
 *
 * `new Uint8Array(value)` on a plain object silently yields an EMPTY array
 * rather than failing, so a Buffer that crossed as `{ type: "Buffer", data:
 * [...] }` produced an empty blob and a broken image — with nothing anywhere
 * saying the bytes had been lost. Both sides of the RPC need the same care:
 * the bytes cross two boundaries and each one can flatten them.
 */
export function chunkBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (!value || typeof value !== "object") return new Uint8Array(0);
  // A Node Buffer that was serialised: `{ type: "Buffer", data: [...] }`.
  if (Array.isArray(value.data)) return new Uint8Array(value.data);
  /*
   * A `Uint8Array` that was serialised.
   *
   * JSON has no typed arrays, so one arrives as a plain object keyed by index
   * — `{"0":137,"1":80,...}` — with no `length` and no `data`. `new
   * Uint8Array(thatObject)` yields an EMPTY array rather than failing, so the
   * blob came out zero bytes and the image was simply broken, with nothing
   * anywhere reporting that the bytes had been dropped.
   *
   * Read by index up to the count of keys rather than by `Object.values`,
   * because key order is not part of the contract.
   */
  const length = Object.keys(value).length;
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    const byte = value[index];
    if (typeof byte !== "number") return new Uint8Array(0);
    bytes[index] = byte;
  }
  return bytes;
}

/**
 * Assembles a chunked facet response into a caller-owned `blob:` URL.
 *
 * `fetchChunk(chunk)` is one RPC page — `getMedia`, `getGeneratedImage`, or
 * whatever the facet calls its chunked read — invoked with the chunk index.
 * Pages follow the shared envelope: `{ ok?, code?, message?, mime?, chunks?,
 * total?, bytes }`. A facet answers an expired/missing source with
 * `{ ok: false }` rather than a rejected promise (a throw from a facet method
 * breaks the Durable Object's output gate); it is re-thrown here, at the
 * browser boundary, so `.catch()` callers keep working. `code` travels with
 * the error — a stage chooses its recovery from `code`, never by reading the
 * message.
 *
 * COUNT WHAT ARRIVED against what the server said it was sending. Every way
 * these bytes can be lost loses them quietly: a shape `chunkBytes` cannot
 * read yields an empty array, a dropped chunk simply is not there, and
 * `new Blob()` accepts all of it without complaint. The caller then gets a
 * perfectly valid `blob:` URL for a broken picture, which renders as nothing
 * at all — indistinguishable from media that does not exist.
 *
 * The caller owns the returned URL and must `URL.revokeObjectURL` it when the
 * preview closes or the item changes. `total` travels with the URL because a
 * drawer states the size of the frame an owner is looking at, and this is
 * the only place that knows it.
 */
export async function assembleChunkedBlobUrl(fetchChunk, unavailableMessage = "This media is not available.") {
  const parts = [];
  let mime = "application/octet-stream";
  let expectedChunks = 1;
  let expectedTotal = null;
  let chunk = 0;
  do {
    const page = await fetchChunk(chunk);
    if (!page) break;
    if (page.ok === false) {
      throw Object.assign(new Error(page.message || unavailableMessage), { code: page.code ?? null });
    }
    if (page.mime) mime = page.mime;
    if (typeof page.chunks === "number" && page.chunks > 0) expectedChunks = page.chunks;
    if (typeof page.total === "number" && expectedTotal === null) expectedTotal = page.total;
    parts.push(chunkBytes(page.bytes));
    chunk += 1;
  } while (chunk < expectedChunks);
  const assembled = parts.reduce((sum, part) => sum + part.byteLength, 0);
  if (expectedTotal !== null && assembled !== expectedTotal) {
    throw new Error(`This media arrived as ${assembled} of ${expectedTotal} bytes.`);
  }
  const blob = new Blob(parts, { type: mime });
  return { url: URL.createObjectURL(blob), mime, total: assembled };
}
