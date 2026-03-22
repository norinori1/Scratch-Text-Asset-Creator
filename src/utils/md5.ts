// Pure TypeScript MD5 implementation (RFC 1321)

function safeAdd(x: number, y: number): number {
  const lsw = (x & 0xffff) + (y & 0xffff);
  return (((x >>> 16) + (y >>> 16) + (lsw >>> 16)) << 16) | (lsw & 0xffff);
}

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

function F(b: number, c: number, d: number): number { return (b & c) | (~b & d); }
function G(b: number, c: number, d: number): number { return (b & d) | (c & ~d); }
function H(b: number, c: number, d: number): number { return b ^ c ^ d; }
function I(b: number, c: number, d: number): number { return c ^ (b | ~d); }

function step(
  fn: (b: number, c: number, d: number) => number,
  a: number, b: number, c: number, d: number,
  x: number, t: number, s: number
): number {
  return safeAdd(rotl(safeAdd(safeAdd(a, fn(b, c, d)), safeAdd(x, t)), s), b);
}

export function md5Hex(data: Uint8Array): string {
  // Ensure we hash exactly the right bytes (handles Uint8Array views into larger buffers)
  const bytes =
    data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
      ? data
      : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

  const msgLen = bytes.length;
  const bitLen = msgLen * 8;

  // Padding: 0x80, zeros, then 64-bit little-endian length
  const padLen = (((msgLen + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[msgLen] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padLen - 8, bitLen >>> 0, true);
  dv.setUint32(padLen - 4, Math.floor(bitLen / 0x100000000), true);

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  for (let i = 0; i < padLen; i += 64) {
    const m: number[] = [];
    for (let j = 0; j < 16; j++) m.push(dv.getUint32(i + j * 4, true));

    const [a0, b0, c0, d0] = [a, b, c, d];

    // Round 1
    a = step(F, a,b,c,d, m[0],  0xd76aa478, 7);  d = step(F, d,a,b,c, m[1],  0xe8c7b756, 12);
    c = step(F, c,d,a,b, m[2],  0x242070db, 17); b = step(F, b,c,d,a, m[3],  0xc1bdceee, 22);
    a = step(F, a,b,c,d, m[4],  0xf57c0faf, 7);  d = step(F, d,a,b,c, m[5],  0x4787c62a, 12);
    c = step(F, c,d,a,b, m[6],  0xa8304613, 17); b = step(F, b,c,d,a, m[7],  0xfd469501, 22);
    a = step(F, a,b,c,d, m[8],  0x698098d8, 7);  d = step(F, d,a,b,c, m[9],  0x8b44f7af, 12);
    c = step(F, c,d,a,b, m[10], 0xffff5bb1, 17); b = step(F, b,c,d,a, m[11], 0x895cd7be, 22);
    a = step(F, a,b,c,d, m[12], 0x6b901122, 7);  d = step(F, d,a,b,c, m[13], 0xfd987193, 12);
    c = step(F, c,d,a,b, m[14], 0xa679438e, 17); b = step(F, b,c,d,a, m[15], 0x49b40821, 22);

    // Round 2
    a = step(G, a,b,c,d, m[1],  0xf61e2562, 5);  d = step(G, d,a,b,c, m[6],  0xc040b340, 9);
    c = step(G, c,d,a,b, m[11], 0x265e5a51, 14); b = step(G, b,c,d,a, m[0],  0xe9b6c7aa, 20);
    a = step(G, a,b,c,d, m[5],  0xd62f105d, 5);  d = step(G, d,a,b,c, m[10], 0x02441453, 9);
    c = step(G, c,d,a,b, m[15], 0xd8a1e681, 14); b = step(G, b,c,d,a, m[4],  0xe7d3fbc8, 20);
    a = step(G, a,b,c,d, m[9],  0x21e1cde6, 5);  d = step(G, d,a,b,c, m[14], 0xc33707d6, 9);
    c = step(G, c,d,a,b, m[3],  0xf4d50d87, 14); b = step(G, b,c,d,a, m[8],  0x455a14ed, 20);
    a = step(G, a,b,c,d, m[13], 0xa9e3e905, 5);  d = step(G, d,a,b,c, m[2],  0xfcefa3f8, 9);
    c = step(G, c,d,a,b, m[7],  0x676f02d9, 14); b = step(G, b,c,d,a, m[12], 0x8d2a4c8a, 20);

    // Round 3
    a = step(H, a,b,c,d, m[5],  0xfffa3942, 4);  d = step(H, d,a,b,c, m[8],  0x8771f681, 11);
    c = step(H, c,d,a,b, m[11], 0x6d9d6122, 16); b = step(H, b,c,d,a, m[14], 0xfde5380c, 23);
    a = step(H, a,b,c,d, m[1],  0xa4beea44, 4);  d = step(H, d,a,b,c, m[4],  0x4bdecfa9, 11);
    c = step(H, c,d,a,b, m[7],  0xf6bb4b60, 16); b = step(H, b,c,d,a, m[10], 0xbebfbc70, 23);
    a = step(H, a,b,c,d, m[13], 0x289b7ec6, 4);  d = step(H, d,a,b,c, m[0],  0xeaa127fa, 11);
    c = step(H, c,d,a,b, m[3],  0xd4ef3085, 16); b = step(H, b,c,d,a, m[6],  0x04881d05, 23);
    a = step(H, a,b,c,d, m[9],  0xd9d4d039, 4);  d = step(H, d,a,b,c, m[12], 0xe6db99e5, 11);
    c = step(H, c,d,a,b, m[15], 0x1fa27cf8, 16); b = step(H, b,c,d,a, m[2],  0xc4ac5665, 23);

    // Round 4
    a = step(I, a,b,c,d, m[0],  0xf4292244, 6);  d = step(I, d,a,b,c, m[7],  0x432aff97, 10);
    c = step(I, c,d,a,b, m[14], 0xab9423a7, 15); b = step(I, b,c,d,a, m[5],  0xfc93a039, 21);
    a = step(I, a,b,c,d, m[12], 0x655b59c3, 6);  d = step(I, d,a,b,c, m[3],  0x8f0ccc92, 10);
    c = step(I, c,d,a,b, m[10], 0xffeff47d, 15); b = step(I, b,c,d,a, m[1],  0x85845dd1, 21);
    a = step(I, a,b,c,d, m[8],  0x6fa87e4f, 6);  d = step(I, d,a,b,c, m[15], 0xfe2ce6e0, 10);
    c = step(I, c,d,a,b, m[6],  0xa3014314, 15); b = step(I, b,c,d,a, m[13], 0x4e0811a1, 21);
    a = step(I, a,b,c,d, m[4],  0xf7537e82, 6);  d = step(I, d,a,b,c, m[11], 0xbd3af235, 10);
    c = step(I, c,d,a,b, m[2],  0x2ad7d2bb, 15); b = step(I, b,c,d,a, m[9],  0xeb86d391, 21);

    a = safeAdd(a, a0); b = safeAdd(b, b0);
    c = safeAdd(c, c0); d = safeAdd(d, d0);
  }

  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a, true);
  out.setUint32(4, b, true);
  out.setUint32(8, c, true);
  out.setUint32(12, d, true);
  return Array.from(new Uint8Array(out.buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
