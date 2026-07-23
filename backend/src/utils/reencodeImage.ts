import sharp from "sharp";

const MAX_DIMENSION = 1024;

// The only trustworthy way to know an uploaded/fetched file is really an
// image (as opposed to an HTML/SVG polyglot wearing a spoofed
// Content-Type/extension) is to decode it as pixels and re-encode from
// scratch — sharp throws on anything it can't actually decode. Re-encoding
// to WebP also strips any embedded scripts/metadata the original carried.
export async function reencodeToWebp(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}
