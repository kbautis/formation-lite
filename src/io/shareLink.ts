// Architecture note (Task 12 — share links, docs/architecture.md §4.6 and §7 door 6)
// - Pure of the DOM: encodeShareLink(routine, baseUrl) → link, readShareFragment(hash) →
//   fragment | null, decodeShareLink(fragment) → Routine. main.ts and the controller
//   own location, history and delivery; this file only converts.
// - Encoding 1 is a public contract: "#share=1." + base64url (RFC 4648 §5, no padding)
//   of deflate-raw of the compact routine JSON. A new layout gets a new encoding number
//   and encoding 1 keeps decoding. The routine inside versions itself through parseRoutine.
// - Decoding runs cheapest check first and every failure is a RoutineFormatError at path
//   "link": length cap → encoding number → alphabet → inflate, read through readLimited,
//   which cancels the stream once SHARE_DECOMPRESSED_MAX_BYTES is passed (a bomb never
//   fully inflates) → fatal UTF-8 → JSON → parseRoutine. Nothing is returned until all pass.
// - Base64 conversion is chunked, so no large array is ever spread into fromCharCode.
// - Verified 2026-11-12 in MDN's browser-compat-data 8.1.8 (the MDN site was not
//   reachable from the build machine): CompressionStream and DecompressionStream accept
//   "deflate-raw" from Chrome 103, Firefox 113 and Safari 16.4 (desktop and iOS).
// - Verified in the smoke test (Chromium): a cut-off deflate-raw stream makes the reader
//   reject instead of ending quietly, so a truncated link is reported as cut off.
import { RoutineFormatError } from "../model/errors";
import type { Routine } from "../model/types";
import { parseRoutine } from "../model/validate";

/** The link encoding version (not the routine format version). */
export const SHARE_LINK_ENCODING = 1;
/** Links longer than this are refused when made and rejected before any decoding. */
export const SHARE_LINK_MAX_CHARACTERS = 100_000;
/** Above the largest valid routine (~2.7 MB as compact UTF-8); inflating stops past it. */
export const SHARE_DECOMPRESSED_MAX_BYTES = 4 * 1024 * 1024;

const SHARE_FRAGMENT_PREFIX = "#share=";
const ENCODING_SEPARATOR = ".";
const LINK_ERROR_PATH = "link";
const COMPRESSION_FORMAT = "deflate-raw";
const ENCODING_NUMBER_PATTERN = /^[0-9]+$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
/** A base64 string can never have length ≡ 1 (mod 4); such a payload was cut mid-character. */
const BASE64_GROUP_LENGTH = 4;
const BASE64_IMPOSSIBLE_REMAINDER = 1;
/** Bytes per String.fromCharCode call: well under every engine's argument limit. */
const BASE64_CHUNK_BYTES = 0x8000;

const DAMAGED_MESSAGE = "this link is damaged or cut off. Ask for the link again, or for an exported file.";

/** A routine whose link would be longer than SHARE_LINK_MAX_CHARACTERS. */
export class ShareLinkTooLargeError extends Error {
  constructor(length: number) {
    super(`This routine is too large for a link (${length.toLocaleString("en-US")} characters) — use Export to send it as a file.`);
    this.name = "ShareLinkTooLargeError";
  }
}

// ── Making a link ───────────────────────────────────────────────────────────

/** The share link for this routine on the app at baseUrl; throws ShareLinkTooLargeError when too long. */
export async function encodeShareLink(routine: Routine, baseUrl: string): Promise<string> {
  const json = JSON.stringify(parseRoutine(routine));
  const compressed = await compress(new TextEncoder().encode(json));
  const base = baseUrl.split("#")[0];
  const link = `${base}${SHARE_FRAGMENT_PREFIX}${SHARE_LINK_ENCODING}${ENCODING_SEPARATOR}${bytesToBase64Url(compressed)}`;
  if (link.length > SHARE_LINK_MAX_CHARACTERS) throw new ShareLinkTooLargeError(link.length);
  return link;
}

async function compress(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return readLimited(streamOf(bytes).pipeThrough(new CompressionStream(COMPRESSION_FORMAT)), Number.POSITIVE_INFINITY);
}

/** A one-chunk stream of these bytes (not Blob.stream(), which jsdom lacks). */
export function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

// ── Reading a link ──────────────────────────────────────────────────────────

/** The share fragment ("1.<payload>") in a location.hash, or null when the hash is not a share link. */
export function readShareFragment(hash: string): string | null {
  return hash.startsWith(SHARE_FRAGMENT_PREFIX) ? hash.slice(SHARE_FRAGMENT_PREFIX.length) : null;
}

/** The routine in a share fragment. Every failure is a RoutineFormatError at path "link". */
export async function decodeShareLink(fragment: string): Promise<Routine> {
  if (fragment.length > SHARE_LINK_MAX_CHARACTERS) throw linkError("this link is too long to be a formation-lite link.");
  const payload = payloadOf(fragment);
  const compressed = base64UrlToBytes(payload);
  const json = decodeUtf8(await inflate(compressed));
  return parseLinkedRoutine(parseJson(json));
}

/** The base64url payload after a supported encoding number. */
function payloadOf(fragment: string): string {
  const separator = fragment.indexOf(ENCODING_SEPARATOR);
  const encoding = separator < 0 ? "" : fragment.slice(0, separator);
  if (!ENCODING_NUMBER_PATTERN.test(encoding)) throw linkError(DAMAGED_MESSAGE);
  if (Number(encoding) !== SHARE_LINK_ENCODING) {
    throw linkError("this link was made by a newer version of formation-lite. Reload the page to update, then open it again.");
  }
  const payload = fragment.slice(separator + 1);
  if (!BASE64URL_PATTERN.test(payload) || payload.length % BASE64_GROUP_LENGTH === BASE64_IMPOSSIBLE_REMAINDER) {
    throw linkError(DAMAGED_MESSAGE);
  }
  return payload;
}

async function inflate(compressed: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = streamOf(compressed).pipeThrough(new DecompressionStream(COMPRESSION_FORMAT));
  try {
    return await readLimited(stream, SHARE_DECOMPRESSED_MAX_BYTES);
  } catch (error) {
    if (error instanceof RoutineFormatError) throw error;
    // DecompressionStream rejects the read with a TypeError on corrupt or truncated input.
    throw linkError(DAMAGED_MESSAGE);
  }
}

/**
 * Reads a byte stream to the end, cancelling it as soon as more than maxBytes have come
 * out, so a compression bomb is never inflated past the cap.
 */
export async function readLimited(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw linkError("the routine in this link is too large to open.");
    }
    chunks.push(value);
  }
  return concatenate(chunks, total);
}

function concatenate(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw linkError(DAMAGED_MESSAGE);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw linkError(DAMAGED_MESSAGE);
  }
}

function parseLinkedRoutine(data: unknown): Routine {
  try {
    return parseRoutine(data);
  } catch (error) {
    if (!(error instanceof RoutineFormatError)) throw error;
    throw linkError(`the routine in this link isn't valid (${error.message}).`);
  }
}

function linkError(message: string): RoutineFormatError {
  return new RoutineFormatError(LINK_ERROR_PATH, message);
}

// ── base64url (RFC 4648 §5, no padding) ─────────────────────────────────────

export function bytesToBase64Url(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES) {
    parts.push(String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK_BYTES)));
  }
  return btoa(parts.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a payload already checked against the base64url alphabet. */
export function base64UrlToBytes(payload: string): Uint8Array<ArrayBuffer> {
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / BASE64_GROUP_LENGTH) * BASE64_GROUP_LENGTH, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw linkError(DAMAGED_MESSAGE);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
