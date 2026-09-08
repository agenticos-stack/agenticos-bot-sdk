import * as Y from "yjs";
const ARCHIVE_MAGIC = 0xec2e2d3a2300e317n;
const ARCHIVE_VERSION = 1;
const PREFIX_BYTES = 24;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_CONTENT_BYTES = 32 * 1024 * 1024;
async function readBlueprintArchive(bytes) {
  if (bytes.byteLength < PREFIX_BYTES) {
    throw new Error("blueprint archive is shorter than its own prefix");
  }
  const view = new DataView(bytes);
  if (view.getBigUint64(0) !== ARCHIVE_MAGIC) {
    throw new Error("not a .gadget archive (bad magic)");
  }
  const version = view.getUint32(8);
  if (version !== ARCHIVE_VERSION) {
    throw new Error(`unsupported .gadget archive version ${version}`);
  }
  const metadataLength = view.getUint32(12);
  const contentLength = Number(view.getBigUint64(16));
  if (metadataLength > MAX_METADATA_BYTES) throw new Error("blueprint metadata too large");
  if (contentLength > MAX_CONTENT_BYTES) throw new Error("blueprint content too large");
  if (PREFIX_BYTES + metadataLength + contentLength > bytes.byteLength) {
    throw new Error("blueprint archive is truncated");
  }
  const metadata = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, PREFIX_BYTES, metadataLength))
  );
  const compressed = new Uint8Array(bytes, PREFIX_BYTES + metadataLength, contentLength);
  const update = await gunzip(compressed);
  const document_ = new Y.Doc();
  Y.applyUpdateV2(document_, update);
  const files = {};
  for (const [name, text] of document_.getMap()) {
    if (name.includes("/") || name.includes("\\") || name.startsWith(".")) {
      throw new Error(`refusing archive entry ${JSON.stringify(name)}`);
    }
    files[name] = text.toString();
  }
  if (Object.keys(files).length === 0) {
    throw new Error("blueprint archive decoded to zero files");
  }
  return { metadata, files };
}
async function gunzip(compressed) {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(compressed);
      controller.close();
    }
  });
  const decompressed = source.pipeThrough(
    new DecompressionStream("gzip")
  );
  return new Uint8Array(await new Response(decompressed).arrayBuffer());
}
async function writeBlueprintArchive(input) {
  const names = Object.keys(input.files);
  if (names.length === 0) throw new Error("refusing to write an archive with no files");
  for (const name of names) {
    if (name.includes("/") || name.includes("\\") || name.startsWith(".")) {
      throw new Error(`refusing archive entry ${JSON.stringify(name)}`);
    }
  }
  const document_ = new Y.Doc();
  document_.clientID = 0;
  const map = document_.getMap();
  for (const name of names.sort()) {
    const text = new Y.Text();
    text.insert(0, input.files[name] ?? "");
    map.set(name, text);
  }
  const update = Y.encodeStateAsUpdateV2(document_);
  const content = await gzip(update);
  const metadataBytes = new TextEncoder().encode(JSON.stringify(input.metadata));
  if (metadataBytes.byteLength > MAX_METADATA_BYTES) throw new Error("blueprint metadata too large");
  if (content.byteLength > MAX_CONTENT_BYTES) throw new Error("blueprint content too large");
  const out = new Uint8Array(PREFIX_BYTES + metadataBytes.byteLength + content.byteLength);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, ARCHIVE_MAGIC);
  view.setUint32(8, ARCHIVE_VERSION);
  view.setUint32(12, metadataBytes.byteLength);
  view.setBigUint64(16, BigInt(content.byteLength));
  out.set(metadataBytes, PREFIX_BYTES);
  out.set(content, PREFIX_BYTES + metadataBytes.byteLength);
  return out.buffer;
}
async function gzip(bytes) {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
  const compressed = source.pipeThrough(
    new CompressionStream("gzip")
  );
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}
export {
  readBlueprintArchive,
  writeBlueprintArchive
};
