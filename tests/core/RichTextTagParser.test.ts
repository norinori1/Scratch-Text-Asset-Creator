import { describe, it, expect } from "vitest";
import {
  parseRichText,
  serializeSegmentsToQueue,
  cssColorToScratchColorEffect,
} from "../../src/core/RichTextTagParser";
import type { RtSegment } from "../../src/core/RichTextTagParser";

describe("parseRichText", () => {
  it("parses plain text as a single segment", () => {
    const result = parseRichText("Hello");
    expect(result).toEqual([{ text: "Hello" }]);
  });

  it("parses <c=...> color tag", () => {
    const result = parseRichText("<c=#FF0000>赤</c>");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("赤");
    expect(result[0].color).toBe("#FF0000");
  });

  it("parses <s=N> size tag", () => {
    const result = parseRichText("<s=200>大きい</s>");
    expect(result).toHaveLength(1);
    expect(result[0].size).toBe(200);
  });

  it("parses <g=N> ghost tag", () => {
    const result = parseRichText("<g=50>半透明</g>");
    expect(result[0].ghost).toBe(50);
  });

  it("parses <b=N> brightness tag", () => {
    const result = parseRichText("<b=-50>暗く</b>");
    expect(result[0].brightness).toBe(-50);
  });

  it("parses <wave> tag (no value)", () => {
    const result = parseRichText("<wave>ゆらゆら</wave>");
    expect(result[0].wave).toBe(true);
  });

  it("parses <shake> tag (no value)", () => {
    const result = parseRichText("<shake>ふるふる</shake>");
    expect(result[0].shake).toBe(true);
  });

  it("parses <sp=N> typeSpeed tag", () => {
    const result = parseRichText("<sp=80>ゆっくり</sp>");
    expect(result[0].typeSpeed).toBe(80);
  });

  it("handles text before and after tag", () => {
    const result = parseRichText("前<c=#00FF00>緑</c>後");
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("前");
    expect(result[1].color).toBe("#00FF00");
    expect(result[2].text).toBe("後");
  });

  it("handles multiple adjacent tags", () => {
    const result = parseRichText("<s=150>大</s><g=30>薄</g>");
    expect(result).toHaveLength(2);
    expect(result[0].size).toBe(150);
    expect(result[1].ghost).toBe(30);
  });

  it("handles unknown tags by ignoring them (plain text passthrough)", () => {
    const result = parseRichText("<unknown>text</unknown>");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("text");
    expect(result[0].color).toBeUndefined();
  });

  it("handles empty string", () => {
    expect(parseRichText("")).toEqual([]);
  });

  it("handles nested tags (inner tag applied first, outer wraps)", () => {
    const result = parseRichText("<s=200><c=#FF0000>赤大</c></s>");
    expect(result).toHaveLength(1);
    expect(result[0].size).toBe(200);
    expect(result[0].color).toBe("#FF0000");
    expect(result[0].text).toBe("赤大");
  });

  it("returns plain text for tag-like strings without closing tag", () => {
    // malformed tag → treated as plain text (tagRegex won't match)
    const result = parseRichText("<c=#FF0000>赤");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("<c=#FF0000>赤");
    expect(result[0].color).toBeUndefined();
  });
});

describe("cssColorToScratchColorEffect", () => {
  it("maps red (#FF0000) to ~0 or 200 (hue=0°)", () => {
    const val = cssColorToScratchColorEffect("#FF0000");
    // hue = 0° → Scratch COLOR = 0 (or near 200)
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(200);
  });

  it("maps green (#00FF00) to ~67 (hue=120° → 120/360*200)", () => {
    const val = cssColorToScratchColorEffect("#00FF00");
    expect(val).toBeCloseTo(67, 0);
  });

  it("maps blue (#0000FF) to ~133 (hue=240° → 240/360*200)", () => {
    const val = cssColorToScratchColorEffect("#0000FF");
    expect(val).toBeCloseTo(133, 0);
  });
});

describe("serializeSegmentsToQueue", () => {
  it("serializes a plain segment into per-character entries", () => {
    const segments: RtSegment[] = [{ text: "AB" }];
    const queue = serializeSegmentsToQueue(segments);
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatch(/^A\|/);
    expect(queue[1]).toMatch(/^B\|/);
  });

  it("serializes wave animation flag correctly", () => {
    const segments: RtSegment[] = [{ text: "W", wave: true }];
    const queue = serializeSegmentsToQueue(segments);
    expect(queue[0]).toContain("|wave|");
  });

  it("serializes shake animation flag correctly", () => {
    const segments: RtSegment[] = [{ text: "S", shake: true }];
    const queue = serializeSegmentsToQueue(segments);
    expect(queue[0]).toContain("|shake|");
  });

  it("uses 'none' for animType when no animation flag is set", () => {
    const segments: RtSegment[] = [{ text: "X" }];
    const queue = serializeSegmentsToQueue(segments);
    expect(queue[0]).toContain("|none|");
  });

  it("applies default values for missing fields", () => {
    const segments: RtSegment[] = [{ text: "A" }];
    const queue = serializeSegmentsToQueue(segments);
    // format: char|size|colorEffect|ghost|brightness|animType|typeSpeed
    const parts = queue[0].split("|");
    expect(parts[1]).toBe("100");  // size default
    expect(parts[2]).toBe("0");    // colorEffect default
    expect(parts[3]).toBe("0");    // ghost default
    expect(parts[4]).toBe("0");    // brightness default
    expect(parts[5]).toBe("none"); // animType default
    expect(parts[6]).toBe("60");   // typeSpeed default
  });

  it("handles empty segments array", () => {
    expect(serializeSegmentsToQueue([])).toEqual([]);
  });

  it("handles multi-char Unicode (iterates code points correctly)", () => {
    const segments: RtSegment[] = [{ text: "あいう" }];
    const queue = serializeSegmentsToQueue(segments);
    expect(queue).toHaveLength(3);
    expect(queue[0]).toMatch(/^あ\|/);
    expect(queue[1]).toMatch(/^い\|/);
    expect(queue[2]).toMatch(/^う\|/);
  });
});
