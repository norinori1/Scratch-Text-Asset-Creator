import { describe, it, expect } from "vitest";
import { resolveCharList } from "../../src/core/CharSetResolver";

describe("resolveCharList", () => {
  it("returns chars for a single charset", () => {
    const result = resolveCharList(["ascii"], "");
    expect(result.length).toBeGreaterThan(0);
    expect(result.includes("A")).toBe(true);
  });

  it("deduplicates characters", () => {
    const result = resolveCharList(["ascii"], "AAABBB");
    const aCount = result.filter((c) => c === "A").length;
    expect(aCount).toBe(1);
  });

  it("includes custom chars", () => {
    const result = resolveCharList([], "abc");
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
  });

  it("handles empty inputs", () => {
    const result = resolveCharList([], "");
    expect(result).toEqual([]);
  });

  it("combines multiple charsets", () => {
    const result = resolveCharList(["ascii", "hiragana"], "");
    expect(result.includes("A")).toBe(true);
    expect(result.includes("あ")).toBe(true);
  });
});
