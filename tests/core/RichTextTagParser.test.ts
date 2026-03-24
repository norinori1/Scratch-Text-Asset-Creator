import { describe, it, expect } from "vitest";
import {
  parseRichText,
  serializeSegmentsToQueue,
  cssColorToScratchColorEffect,
  parseConsoleScript,
  stripTags,
} from "../../src/core/RichTextTagParser";
import type { RtSegment } from "../../src/core/RichTextTagParser";

describe("parseRichText", () => {
  it("parses plain text as a single segment", () => {
    const result = parseRichText("Hello");
    expect(result).toEqual([{ text: "Hello" }]);
  });

  it("parses <c=N> color tag (direct Scratch COLOR value)", () => {
    const result = parseRichText("<c=100>赤</c>");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("赤");
    expect(result[0].colorEffect).toBe(100);
  });

  it("parses <ch=#RRGGBB> color tag (CSS hex → colorEffect)", () => {
    const result = parseRichText("<ch=#00FF00>緑</ch>");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("緑");
    // green hue=120° → (120/360)*200 ≈ 67
    expect(result[0].colorEffect).toBeCloseTo(67, 0);
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

  it("parses <sp=N> typeDelay tag", () => {
    const result = parseRichText("<sp=80>ゆっくり</sp>");
    expect(result[0].typeDelay).toBe(80);
  });

  it("parses <br> as a newline within the text", () => {
    const result = parseRichText("前<br>後");
    // <br> is replaced with \n, producing a single plain text segment
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("前\n後");
  });

  it("<br/> is also handled as newline", () => {
    const result = parseRichText("A<br/>B");
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("\n");
  });

  it("handles text before and after tag", () => {
    const result = parseRichText("前<c=100>緑</c>後");
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("前");
    expect(result[1].colorEffect).toBe(100);
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
    expect(result[0].colorEffect).toBeUndefined();
  });

  it("handles empty string", () => {
    expect(parseRichText("")).toEqual([]);
  });

  it("handles nested tags (inner tag applied first, outer wraps)", () => {
    const result = parseRichText("<s=200><c=50>大カラー</c></s>");
    expect(result).toHaveLength(1);
    expect(result[0].size).toBe(200);
    expect(result[0].colorEffect).toBe(50);
    expect(result[0].text).toBe("大カラー");
  });

  it("returns plain text for tag-like strings without closing tag", () => {
    // malformed tag → treated as plain text (tagRegex won't match)
    const result = parseRichText("<c=100>赤");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("<c=100>赤");
    expect(result[0].colorEffect).toBeUndefined();
  });

  it("RtSegment has no 'color' string field (uses colorEffect number)", () => {
    const result = parseRichText("<c=100>test</c>");
    expect("color" in result[0]).toBe(false);
    expect(typeof result[0].colorEffect).toBe("number");
  });

  it("RtSegment has typeDelay (not typeSpeed)", () => {
    const result = parseRichText("<sp=80>slow</sp>");
    expect(result[0].typeDelay).toBe(80);
    expect("typeSpeed" in result[0]).toBe(false);
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

  it("produces 11 fields per entry", () => {
    const segments: RtSegment[] = [{ text: "A" }];
    const queue = serializeSegmentsToQueue(segments);
    const parts = queue[0].split("|");
    expect(parts).toHaveLength(11);
  });

  it("applies default x/y coordinates when not specified", () => {
    const segments: RtSegment[] = [{ text: "A" }];
    const queue = serializeSegmentsToQueue(segments);
    const parts = queue[0].split("|");
    expect(parts[1]).toBe("0"); // x default
    expect(parts[2]).toBe("0"); // y default
  });

  it("uses provided startX/startY", () => {
    const segments: RtSegment[] = [{ text: "A" }];
    const queue = serializeSegmentsToQueue(segments, -100, 50);
    const parts = queue[0].split("|");
    expect(parts[1]).toBe("-100");
    expect(parts[2]).toBe("50");
  });

  it("advances x using provided advance widths", () => {
    const segments: RtSegment[] = [{ text: "AB" }];
    const advances = { A: 30, B: 25 };
    const queue = serializeSegmentsToQueue(segments, 0, 0, advances);
    const xA = Number(queue[0].split("|")[1]);
    const xB = Number(queue[1].split("|")[1]);
    expect(xA).toBe(0);
    expect(xB).toBe(30); // A's advance width
  });

  it("applies letterSpacing in x advancement", () => {
    const segments: RtSegment[] = [{ text: "AB" }];
    const advances = { A: 30, B: 25 };
    const queue = serializeSegmentsToQueue(segments, 0, 0, advances, { letterSpacing: 5 });
    const xB = Number(queue[1].split("|")[1]);
    expect(xB).toBe(35); // 30 + 5
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

  it("uses empty string for animType when no animation flag is set", () => {
    const segments: RtSegment[] = [{ text: "X" }];
    const queue = serializeSegmentsToQueue(segments);
    // animType field (index 7) should be empty
    const parts = queue[0].split("|");
    expect(parts[7]).toBe("");
  });

  it("applies default values for missing fields", () => {
    const segments: RtSegment[] = [{ text: "A" }];
    const queue = serializeSegmentsToQueue(segments);
    // format: char|x|y|size|colorEffect|ghost|brightness|animType|animAmp|animSpd|typeDelay
    const parts = queue[0].split("|");
    expect(parts[3]).toBe("100");  // size default
    expect(parts[4]).toBe("0");    // colorEffect default
    expect(parts[5]).toBe("0");    // ghost default
    expect(parts[6]).toBe("0");    // brightness default
    expect(parts[7]).toBe("");     // animType default (empty)
    expect(parts[8]).toBe("0");    // animAmp default
    expect(parts[9]).toBe("0");    // animSpd default
    expect(parts[10]).toBe("0");   // typeDelay default
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

  it("handles newline character as a special marker", () => {
    const segments: RtSegment[] = [{ text: "A\nB" }];
    const queue = serializeSegmentsToQueue(segments);
    // should have 3 entries: A, newline marker, B
    expect(queue).toHaveLength(3);
    expect(queue[1]).toMatch(/^\n\|/);
  });

  it("resets x to startX after newline", () => {
    const segments: RtSegment[] = [{ text: "A\nB" }];
    const advances = { A: 40, B: 30 };
    const queue = serializeSegmentsToQueue(segments, 10, 0, advances);
    const xB = Number(queue[2].split("|")[1]);
    expect(xB).toBe(10); // reset to startX
  });
});

describe("parseConsoleScript", () => {
  it("parses a minimal text block", () => {
    const result = parseConsoleScript("text:Hello");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello");
  });

  it("parses multiple key:value pairs", () => {
    const script = `text:こんにちは\nx:10\ny:-20\nsize:150`;
    const result = parseConsoleScript(script);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("こんにちは");
    expect(result[0].x).toBe(10);
    expect(result[0].y).toBe(-20);
    expect(result[0].size).toBe(150);
  });

  it("ignores comment lines starting with //", () => {
    const script = `// comment\ntext:test`;
    const result = parseConsoleScript(script);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("test");
  });

  it("ignores blank lines", () => {
    const script = `\n\ntext:test\n\n`;
    const result = parseConsoleScript(script);
    expect(result).toHaveLength(1);
  });

  it("separates blocks with ---", () => {
    const script = `text:A\n---\ntext:B`;
    const result = parseConsoleScript(script);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("A");
    expect(result[1].text).toBe("B");
  });

  it("flushes last block without trailing ---", () => {
    const script = `text:last`;
    const result = parseConsoleScript(script);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("last");
  });

  it("converts colorHex key via cssColorToScratchColorEffect", () => {
    const script = `text:X\ncolorHex:#00FF00`;
    const result = parseConsoleScript(script);
    expect(result[0].colorEffect).toBeCloseTo(67, 0);
  });

  it("sets color key as direct numeric COLOR effect", () => {
    const script = `text:X\ncolor:100`;
    const result = parseConsoleScript(script);
    expect(result[0].colorEffect).toBe(100);
  });

  it("handles all supported keys", () => {
    const script = [
      "text:test",
      "x:10", "y:-20", "size:120",
      "color:50", "ghost:30", "brightness:-40",
      "align:center", "anim:wave", "animAmp:6", "animSpeed:3",
      "typeDelay:80", "maxWidth:400", "letterSpacing:2",
      "layer:2", "lineHeight:80",
    ].join("\n");
    const result = parseConsoleScript(script);
    expect(result[0].x).toBe(10);
    expect(result[0].y).toBe(-20);
    expect(result[0].size).toBe(120);
    expect(result[0].colorEffect).toBe(50);
    expect(result[0].ghost).toBe(30);
    expect(result[0].brightness).toBe(-40);
    expect(result[0].align).toBe("center");
    expect(result[0].animType).toBe("wave");
    expect(result[0].animAmp).toBe(6);
    expect(result[0].animSpeed).toBe(3);
    expect(result[0].typeDelay).toBe(80);
    expect(result[0].maxWidth).toBe(400);
    expect(result[0].letterSpacing).toBe(2);
    expect(result[0].layer).toBe(2);
    expect(result[0].lineHeight).toBe(80);
  });

  it("values containing colon are preserved (first : is separator)", () => {
    // text:12:30 → key="text", val="12:30"
    const script = `text:12:30`;
    const result = parseConsoleScript(script);
    expect(result[0].text).toBe("12:30");
  });

  it("ignores unknown keys", () => {
    const script = `text:test\nunknownKey:someValue`;
    expect(() => parseConsoleScript(script)).not.toThrow();
    const result = parseConsoleScript(script);
    expect(result[0].text).toBe("test");
  });

  it("returns empty array for empty script", () => {
    expect(parseConsoleScript("")).toEqual([]);
  });

  it("skips --- block separator that appears before any text content", () => {
    const script = `---\ntext:valid`;
    const result = parseConsoleScript(script);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("valid");
  });

  it("uses default values for unspecified fields", () => {
    const result = parseConsoleScript("text:X");
    expect(result[0].x).toBe(0);
    expect(result[0].y).toBe(0);
    expect(result[0].size).toBe(100);
    expect(result[0].colorEffect).toBe(0);
    expect(result[0].ghost).toBe(0);
    expect(result[0].brightness).toBe(0);
    expect(result[0].align).toBe("left");
    expect(result[0].animType).toBe("");
    expect(result[0].animAmp).toBe(8);
    expect(result[0].animSpeed).toBe(5);
    expect(result[0].typeDelay).toBe(0);
    expect(result[0].letterSpacing).toBe(0);
    expect(result[0].layer).toBe(1);
  });
});

describe("stripTags", () => {
  it("returns plain text unchanged", () => {
    expect(stripTags("Hello")).toBe("Hello");
  });

  it("strips a simple open/close tag pair", () => {
    expect(stripTags("<c=100>赤</c>")).toBe("赤");
  });

  it("strips size tag", () => {
    expect(stripTags("<s=200>大きい</s>")).toBe("大きい");
  });

  it("strips sp tag (typewriter speed)", () => {
    expect(stripTags("<sp=80>ゆっくり</sp>")).toBe("ゆっくり");
  });

  it("strips wave/shake animation tags", () => {
    expect(stripTags("<wave>ゆらゆら</wave>")).toBe("ゆらゆら");
    expect(stripTags("<shake>ふるふる</shake>")).toBe("ふるふる");
  });

  it("strips tags but preserves surrounding plain text", () => {
    expect(stripTags("前<c=100>緑</c>後")).toBe("前緑後");
  });

  it("strips multiple adjacent tags", () => {
    expect(stripTags("<s=150>大</s><g=30>薄</g>")).toBe("大薄");
  });

  it("strips nested tags", () => {
    expect(stripTags("<s=200><c=50>大カラー</c></s>")).toBe("大カラー");
  });

  it("converts <br> to newline", () => {
    expect(stripTags("前<br>後")).toBe("前\n後");
    expect(stripTags("A<br/>B")).toBe("A\nB");
  });

  it("returns empty string for empty input", () => {
    expect(stripTags("")).toBe("");
  });

  it("handles text with no tags", () => {
    expect(stripTags("abc 123")).toBe("abc 123");
  });

  it("strips tag-like markup even without a closing tag (malformed)", () => {
    // A malformed tag like <c=100>赤 – the tag chars are skipped, content passes through
    expect(stripTags("<c=100>赤")).toBe("赤");
  });

  it("does not include tag delimiters < or > in output", () => {
    const result = stripTags("<c=100>test</c>");
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  it("preserves a stray '>' that appears outside any tag", () => {
    // "2 > 1" contains no open tag, so ">" is a literal character
    expect(stripTags("2 > 1")).toBe("2 > 1");
  });

  it("handles an unclosed '<' at end of string (partial tag)", () => {
    // "<incomplete" — '<' opens a tag that never closes; the rest is skipped
    expect(stripTags("<incomplete")).toBe("");
  });

  it("handles stray '>' brackets when not inside a tag", () => {
    // Multiple stray ">" should all pass through as literal characters
    expect(stripTags("a > b > c")).toBe("a > b > c");
  });
});

