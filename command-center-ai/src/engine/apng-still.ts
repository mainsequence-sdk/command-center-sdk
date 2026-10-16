/**
 * The still of an animated agent icon (ADR 090, amended 2026-10-16).
 *
 * The platform stores an animated color icon as an APNG whose default image is its frame 0. An
 * APNG is a PNG plus `acTL`, `fcTL` and `fdAT` chunks, so dropping those chunks leaves a valid
 * static PNG of that default image. The other chunks keep their bytes and CRCs. No canvas or
 * decoding is involved, so the result is exact and works wherever bytes do.
 */
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const ANIMATION_CHUNKS = new Set(["acTL", "fcTL", "fdAT"]);

function chunkType(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/** A static PNG of the APNG's default image, or null when the bytes are not an APNG. */
export function apngStill(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, PNG_SIGNATURE.length)];
  let animated = false;
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) {
      return null;
    }
    const type = chunkType(bytes, offset + 4);
    if (ANIMATION_CHUNKS.has(type)) {
      animated ||= type === "acTL";
    } else {
      kept.push(bytes.subarray(offset, end));
    }
    offset = end;
    if (type === "IEND") {
      break;
    }
  }
  if (!animated) {
    return null;
  }
  const still = new Uint8Array(kept.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of kept) {
    still.set(part, position);
    position += part.length;
  }
  return still;
}
