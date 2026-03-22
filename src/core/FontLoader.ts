import opentype from "opentype.js";

export async function loadFontFromFile(file: File): Promise<opentype.Font> {
  const arrayBuffer = await file.arrayBuffer();
  return opentype.parse(arrayBuffer);
}
