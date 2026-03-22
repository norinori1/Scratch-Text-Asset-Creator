import JSZip from "jszip";

export async function createZipBlob(
  files: Array<{ name: string; data: Uint8Array | string }>
): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.data);
  }
  return zip.generateAsync({ type: "blob" });
}
