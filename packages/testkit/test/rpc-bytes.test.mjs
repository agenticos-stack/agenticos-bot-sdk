import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BYTES_TAG, DECODE_BYTES_SOURCE, encodeBytes } from '../src/rpc-bytes.js';

/**
 * Evaluates the decoder the browser bridges embed, and returns it as a function.
 *
 * `new Function` on a string is a code-injection hazard when the string is
 * anything a caller can influence. This one is a module constant in this same
 * package, authored as source because its destination is an inline script in a
 * sandboxed frame that cannot import — see rpc-bytes.js. Nothing dynamic is
 * concatenated into it, and the test below asserts that: the constant carries
 * no template interpolation of its own.
 *
 * Evaluating it here is the point. A decoder tested only by reading it is a
 * decoder that has never run, and this pair has to agree byte for byte.
 */
function decoder() {
  const make = new Function(`${DECODE_BYTES_SOURCE}\nreturn __botDecodeBytes;`);
  return make();
}

test('the embedded decoder is a fixed constant, not an assembled string', () => {
  const source = readFileSync(new URL('../src/rpc-bytes.js', import.meta.url), 'utf8');
  const literal = source.slice(source.indexOf('export const DECODE_BYTES_SOURCE'));
  // One interpolation is allowed and expected: the tag, itself a constant,
  // JSON-stringified. Anything else would mean a value reaching the evaluator.
  const interpolations = literal.match(/\$\{[^}]*\}/g) ?? [];
  assert.deepEqual(interpolations, ['${JSON.stringify(BYTES_TAG)}']);
});

/** The browser has atob; Node's global does too, but be explicit about the dependency. */
test('the embedded decoder needs only atob and Uint8Array', () => {
  assert.equal(typeof atob, 'function');
  assert.ok(DECODE_BYTES_SOURCE.includes('atob('));
  assert.ok(!/require|import/.test(DECODE_BYTES_SOURCE), 'the decoder is inlined into a sandboxed frame and cannot import');
});

test('bytes survive the round trip exactly', () => {
  const decode = decoder();
  const original = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 255, 217]);
  const back = decode(JSON.parse(JSON.stringify(encodeBytes({ mime: 'image/jpeg', bytes: original }))));
  assert.deepEqual([...back.bytes], [...original]);
  assert.ok(back.bytes instanceof Uint8Array);
  assert.equal(back.mime, 'image/jpeg');
});

test('a long run of bytes survives, past any argument-list limit', () => {
  const decode = decoder();
  // `String.fromCharCode(...bytes)` overflows around here, which is every
  // image a gadget actually carries.
  const original = new Uint8Array(200_000);
  for (let index = 0; index < original.length; index += 1) original[index] = index % 256;
  const back = decode(JSON.parse(JSON.stringify(encodeBytes({ bytes: original }))));
  assert.equal(back.bytes.length, original.length);
  assert.deepEqual([...back.bytes.subarray(0, 8)], [...original.subarray(0, 8)]);
  assert.deepEqual([...back.bytes.subarray(-8)], [...original.subarray(-8)]);
});

/*
 * The point of the exercise: an index-keyed Uint8Array costs about nine
 * characters per byte on this hop, and arrives as an object with one own
 * property per byte for `structuredClone` to walk on every postMessage.
 */
test('the envelope is far smaller than the shape it replaces', () => {
  const bytes = new Uint8Array(60_000).fill(7);
  const indexed = JSON.stringify({ bytes }).length;
  const enveloped = JSON.stringify(encodeBytes({ bytes })).length;
  assert.ok(enveloped * 5 < indexed, `expected a large saving, got ${indexed} -> ${enveloped}`);
  assert.ok(enveloped < bytes.length * 1.4, 'base64 should be about 1.33x the raw bytes');
});

test('a Buffer that lost its type on the way out is still recognised', () => {
  const decode = decoder();
  const flattened = { type: 'Buffer', data: [1, 2, 3, 4] };
  const back = decode(JSON.parse(JSON.stringify(encodeBytes({ bytes: flattened }))));
  assert.deepEqual([...back.bytes], [1, 2, 3, 4]);
});

test('everything that is not binary is handed back unchanged', () => {
  const value = {
    ok: true,
    items: [{ id: 'a', n: 1 }, { id: 'b', n: null }],
    nested: { deep: { text: 'unchanged' } }
  };
  assert.deepEqual(encodeBytes(value), value);
  assert.deepEqual(decoder()(value), value);
});

test('a payload carrying no bytes is untouched by the decoder', () => {
  const decode = decoder();
  assert.equal(decode('plain'), 'plain');
  assert.equal(decode(null), null);
  assert.equal(decode(7), 7);
});

test('the tag is distinctive enough not to collide with gadget data', () => {
  assert.match(BYTES_TAG, /^\$bot_/);
});
