import { describe, it, expect } from "vitest";
import { ascii } from "../../src/data/charsets/ascii";
import { hiragana } from "../../src/data/charsets/hiragana";
import { katakana } from "../../src/data/charsets/katakana";
import { alphabet_fullwidth } from "../../src/data/charsets/alphabet";
import {
  kyoiku_kanji_grade1,
  kyoiku_kanji_grade2,
  kyoiku_kanji_grade3,
  kyoiku_kanji_grade4,
  kyoiku_kanji_grade5,
  kyoiku_kanji_grade6,
} from "../../src/data/charsets/kyoiku_kanji";

describe("charset definitions", () => {
  it("ascii has correct count", () => {
    expect(Array.from(ascii.chars).length).toBe(ascii.count);
  });

  it("hiragana has correct count", () => {
    expect(Array.from(hiragana.chars).length).toBe(hiragana.count);
  });

  it("katakana has correct count", () => {
    expect(Array.from(katakana.chars).length).toBe(katakana.count);
  });

  it("alphabet_fullwidth has correct count", () => {
    expect(Array.from(alphabet_fullwidth.chars).length).toBe(alphabet_fullwidth.count);
  });

  it("grade 1 kanji has correct count", () => {
    expect(Array.from(kyoiku_kanji_grade1.chars).length).toBe(kyoiku_kanji_grade1.count);
  });

  it("grade 2 kanji has correct count", () => {
    expect(Array.from(kyoiku_kanji_grade2.chars).length).toBe(kyoiku_kanji_grade2.count);
  });

  it("grade 3 kanji has correct count", () => {
    expect(Array.from(kyoiku_kanji_grade3.chars).length).toBe(kyoiku_kanji_grade3.count);
  });

  it("grade 4 kanji has correct count", () => {
    expect(Array.from(kyoiku_kanji_grade4.chars).length).toBe(kyoiku_kanji_grade4.count);
  });

  it("grade 5 kanji has correct count", () => {
    expect(Array.from(kyoiku_kanji_grade5.chars).length).toBe(kyoiku_kanji_grade5.count);
  });

  it("grade 6 kanji has correct count", () => {
    expect(Array.from(kyoiku_kanji_grade6.chars).length).toBe(kyoiku_kanji_grade6.count);
  });

  it("all charsets have unique IDs", () => {
    const charsets = [ascii, hiragana, katakana, alphabet_fullwidth,
      kyoiku_kanji_grade1, kyoiku_kanji_grade2, kyoiku_kanji_grade3,
      kyoiku_kanji_grade4, kyoiku_kanji_grade5, kyoiku_kanji_grade6];
    const ids = charsets.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
