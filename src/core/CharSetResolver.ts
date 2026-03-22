import type { CharsetId } from "../types";
import { ascii } from "../data/charsets/ascii";
import { hiragana } from "../data/charsets/hiragana";
import { katakana } from "../data/charsets/katakana";
import { alphabet_fullwidth } from "../data/charsets/alphabet";
import {
  kyoiku_kanji_grade1,
  kyoiku_kanji_grade2,
  kyoiku_kanji_grade3,
  kyoiku_kanji_grade4,
  kyoiku_kanji_grade5,
  kyoiku_kanji_grade6,
} from "../data/charsets/kyoiku_kanji";

const CHARSET_MAP: Record<CharsetId, string> = {
  ascii: ascii.chars,
  hiragana: hiragana.chars,
  katakana: katakana.chars,
  alphabet_fullwidth: alphabet_fullwidth.chars,
  kyoiku_kanji_grade1: kyoiku_kanji_grade1.chars,
  kyoiku_kanji_grade2: kyoiku_kanji_grade2.chars,
  kyoiku_kanji_grade3: kyoiku_kanji_grade3.chars,
  kyoiku_kanji_grade4: kyoiku_kanji_grade4.chars,
  kyoiku_kanji_grade5: kyoiku_kanji_grade5.chars,
  kyoiku_kanji_grade6: kyoiku_kanji_grade6.chars,
};

export function resolveCharList(
  selectedCharsetIds: CharsetId[],
  customChars: string
): string[] {
  const combined = selectedCharsetIds.map((id) => CHARSET_MAP[id]).join("") + customChars;
  const normalized = combined.normalize("NFC");
  const chars = Array.from(normalized).filter((ch) => ch.trim() !== "");
  return Array.from(new Set(chars));
}
