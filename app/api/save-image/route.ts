import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, productId } = await req.json();
    if (!imageBase64 || !productId) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Add watermark using sharp
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width || 500;
    const h = meta.height || 500;

    const fontSize = Math.max(20, Math.min(w, h) / 12);
    const svgWatermark = `
      <svg width="${w}" height="${h}">
        <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial" font-size="${fontSize}" font-weight="bold"
          fill="white" opacity="0.35">${"Re-Check photo"}</text>
      </svg>`;

    const watermarked = await img
      .composite([{ input: Buffer.from(svgWatermark), blend: "over" }])
      .jpeg({ quality: 88 })
      .toBuffer();

    const filename = `${productId}.jpg`;
    const savePath = path.join(process.cwd(), "public", "product-images", filename);
    await writeFile(savePath, watermarked);

    const photoUrl = `/product-images/${filename}`;

    // Update loreal_products.json on disk
    const jsonPaths = [
      path.join(process.cwd(), "loreal_products.json"),
      path.join(process.cwd(), "public", "loreal_products.json"),
      path.join(process.cwd(), "app", "api", "loreal", "products.json"),
    ];
    for (const jsonPath of jsonPaths) {
      try {
        const products = JSON.parse(await readFile(jsonPath, "utf-8"));
        const updated = products.map((p: any) =>
          p.id === productId ? { ...p, photo: photoUrl } : p
        );
        await writeFile(jsonPath, JSON.stringify(updated, null, 2));
      } catch { /* file may not exist */ }
    }

    return NextResponse.json({ url: photoUrl });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
