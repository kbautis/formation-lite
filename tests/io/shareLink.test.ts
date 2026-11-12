import { describe, expect, it } from "vitest";
import {
  SHARE_DECOMPRESSED_MAX_BYTES,
  SHARE_LINK_ENCODING,
  SHARE_LINK_MAX_CHARACTERS,
  ShareLinkTooLargeError,
  bytesToBase64Url,
  base64UrlToBytes,
  decodeShareLink,
  encodeShareLink,
  readLimited,
  readShareFragment,
  streamOf,
} from "../../src/io/shareLink";
import { RoutineFormatError } from "../../src/model/errors";
import { roundPosition } from "../../src/model/stage";
import type { Formation, Routine } from "../../src/model/types";
import { validRoutineInput } from "../fixtures/routines";

const BASE_URL = "https://example.github.io/formation-lite/";

/** A seeded generator so the "random" routines are the same on every run. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function bigRoutine(dancerCount: number, formationCount: number, round: boolean): Routine {
  const random = seededRandom(42);
  const dancers = Array.from({ length: dancerCount }, (_, index) => ({ id: `d-${index}`, name: `Dancer ${index}`, color: "#e4572e" }));
  const formations: Formation[] = Array.from({ length: formationCount }, (_, index) => ({
    id: `f-${index}`,
    name: `Formation ${index}`,
    startSeconds: index * 4,
    holdSeconds: 2,
    stagger: null,
    positions: Object.fromEntries(
      dancers.map((dancer) => {
        const position = { x: random(), y: random() };
        return [dancer.id, round ? roundPosition(position) : position];
      }),
    ),
  }));
  return { ...validRoutineInput(), song: null, dancers, formations };
}

function fragmentOf(link: string): string {
  const fragment = readShareFragment(new URL(link).hash);
  if (fragment === null) throw new Error("no share fragment in link");
  return fragment;
}

/** deflate-raw of arbitrary bytes, as a share fragment, to build crafted links. */
async function craftedFragment(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const compressed = await readLimited(streamOf(bytes).pipeThrough(new CompressionStream("deflate-raw")), Number.POSITIVE_INFINITY);
  return `${SHARE_LINK_ENCODING}.${bytesToBase64Url(compressed)}`;
}

async function rejection(promise: Promise<unknown>): Promise<RoutineFormatError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RoutineFormatError);
    expect((error as RoutineFormatError).path).toBe("link");
    return error as RoutineFormatError;
  }
  throw new Error("expected the link to be rejected");
}

describe("encodeShareLink / decodeShareLink", () => {
  it("round-trips a routine exactly", async () => {
    const routine = validRoutineInput();
    const link = await encodeShareLink(routine, BASE_URL);
    expect(link.startsWith(`${BASE_URL}#share=1.`)).toBe(true);
    expect(await decodeShareLink(fragmentOf(link))).toEqual(routine);
  });

  it("round-trips a 20-dancer, 40-formation routine exactly and fits in a link", async () => {
    const routine = bigRoutine(20, 40, true);
    const link = await encodeShareLink(routine, BASE_URL);
    expect(link.length).toBeLessThan(SHARE_LINK_MAX_CHARACTERS);
    expect(await decodeShareLink(fragmentOf(link))).toEqual(routine);
  });

  it("round-trips unrounded positions bit for bit", async () => {
    const routine = bigRoutine(3, 3, false);
    expect(await decodeShareLink(fragmentOf(await encodeShareLink(routine, BASE_URL)))).toEqual(routine);
  });

  it("round-trips non-ASCII names", async () => {
    const routine = { ...validRoutineInput(), name: "Ñandú — 舞 💃" };
    expect((await decodeShareLink(fragmentOf(await encodeShareLink(routine, BASE_URL)))).name).toBe("Ñandú — 舞 💃");
  });

  it("uses only base64url characters and no padding in the payload", async () => {
    const link = await encodeShareLink(bigRoutine(20, 40, true), BASE_URL);
    expect(fragmentOf(link)).toMatch(/^1\.[A-Za-z0-9_-]+$/);
  });

  it("replaces any fragment already on the base URL", async () => {
    const link = await encodeShareLink(validRoutineInput(), `${BASE_URL}#share=1.old`);
    expect(link.split("#")).toHaveLength(2);
    expect(link.startsWith(`${BASE_URL}#share=1.`)).toBe(true);
  });

  it("refuses a routine too large for a link", async () => {
    const routine = bigRoutine(40, 500, false);
    await expect(encodeShareLink(routine, BASE_URL)).rejects.toBeInstanceOf(ShareLinkTooLargeError);
    await expect(encodeShareLink(routine, BASE_URL)).rejects.toThrow(/use Export/);
  });

  it("refuses to encode an invalid routine", async () => {
    await expect(encodeShareLink({ ...validRoutineInput(), name: "" }, BASE_URL)).rejects.toBeInstanceOf(RoutineFormatError);
  });
});

describe("decodeShareLink rejections", () => {
  it("rejects a link over the length cap before decoding", async () => {
    const error = await rejection(decodeShareLink(`1.${"A".repeat(SHARE_LINK_MAX_CHARACTERS)}`));
    expect(error.message).toMatch(/too long/);
  });

  it("rejects an unknown encoding as made by a newer version", async () => {
    const error = await rejection(decodeShareLink("2.AAAA"));
    expect(error.message).toMatch(/newer version of formation-lite/);
  });

  it("rejects a fragment with no encoding number", async () => {
    await rejection(decodeShareLink("AAAA"));
    await rejection(decodeShareLink("x.AAAA"));
    await rejection(decodeShareLink(""));
  });

  it("rejects characters outside the base64url alphabet", async () => {
    const error = await rejection(decodeShareLink("1.AB+/CD=="));
    expect(error.message).toMatch(/damaged/);
  });

  it("rejects an empty payload", async () => {
    await rejection(decodeShareLink("1."));
  });

  it("rejects a cut-off link", async () => {
    const fragment = fragmentOf(await encodeShareLink(bigRoutine(20, 40, true), BASE_URL));
    for (const keep of [0.25, 0.5, 0.9, 0.99]) {
      const error = await rejection(decodeShareLink(fragment.slice(0, Math.floor(fragment.length * keep))));
      expect(error.message).toMatch(/damaged or cut off/);
    }
  });

  it("rejects a tampered payload", async () => {
    const fragment = fragmentOf(await encodeShareLink(validRoutineInput(), BASE_URL));
    const middle = Math.floor(fragment.length / 2);
    const swapped = fragment[middle] === "A" ? "B" : "A";
    await rejection(decodeShareLink(`${fragment.slice(0, middle)}${swapped}${fragment.slice(middle + 1)}`));
  });

  it("rejects bytes that do not inflate", async () => {
    const error = await rejection(decodeShareLink(`1.${bytesToBase64Url(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))}`));
    expect(error.message).toMatch(/damaged or cut off/);
  });

  it("rejects a decompression bomb", async () => {
    const fragment = await craftedFragment(new Uint8Array(SHARE_DECOMPRESSED_MAX_BYTES * 16));
    expect(fragment.length).toBeLessThan(SHARE_LINK_MAX_CHARACTERS);
    const error = await rejection(decodeShareLink(fragment));
    expect(error.message).toMatch(/too large/);
  });

  it("rejects invalid UTF-8", async () => {
    const error = await rejection(decodeShareLink(await craftedFragment(new Uint8Array([0x7b, 0xc3, 0x28, 0x7d]))));
    expect(error.message).toMatch(/damaged/);
  });

  it("rejects text that is not JSON", async () => {
    await rejection(decodeShareLink(await craftedFragment(new TextEncoder().encode("not json"))));
  });

  it("rejects JSON that is not a valid routine, naming the field", async () => {
    const document = { ...validRoutineInput(), dancers: [{ id: "__proto__", name: "x", color: "#000000" }] };
    const error = await rejection(decodeShareLink(await craftedFragment(new TextEncoder().encode(JSON.stringify(document)))));
    expect(error.message).toMatch(/dancers/);
  });

  it("migrates a version 1 routine inside a link", async () => {
    const { formations, ...rest } = validRoutineInput();
    const versionOne = { ...rest, version: 1, formations: formations.map(({ stagger: _stagger, ...formation }) => formation) };
    const routine = await decodeShareLink(await craftedFragment(new TextEncoder().encode(JSON.stringify(versionOne))));
    expect(routine.version).toBe(2);
    expect(routine.formations.every((formation) => formation.stagger === null)).toBe(true);
  });
});

describe("readLimited", () => {
  it("stops pulling from the stream once the cap is passed", async () => {
    let pulls = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readLimited(endless, 10 * 1024)).rejects.toThrow(/too large/);
    expect(pulls).toBeLessThan(20);
    expect(cancelled).toBe(true);
  });

  it("returns every byte when under the cap", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    });
    expect(Array.from(await readLimited(stream, 3))).toEqual([1, 2, 3]);
  });
});

describe("base64url", () => {
  it("round-trips every byte value and large arrays", () => {
    const bytes = new Uint8Array(300_000).map((_, index) => index % 256);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(base64UrlToBytes(encoded)).toEqual(bytes);
  });

  it("drops padding", () => {
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });
});

describe("readShareFragment", () => {
  it("returns the part after #share=", () => {
    expect(readShareFragment("#share=1.abc")).toBe("1.abc");
  });
  it("returns null for any other fragment", () => {
    expect(readShareFragment("")).toBeNull();
    expect(readShareFragment("#")).toBeNull();
    expect(readShareFragment("#section-2")).toBeNull();
    expect(readShareFragment("#shared=1.abc")).toBeNull();
  });
  it("returns an empty payload for a bare #share= so decoding rejects it", () => {
    expect(readShareFragment("#share=")).toBe("");
  });
});
