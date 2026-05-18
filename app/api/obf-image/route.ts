import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ean = req.nextUrl.searchParams.get("ean");
  if (!ean) return new NextResponse("Missing ean", { status: 400 });

  try {
    const resp = await fetch(
      `https://world.openbeautyfacts.org/api/v0/product/${ean}.json`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 86400 } }
    );
    const data = await resp.json();
    const product = data?.product;
    const image = product?.image_url || product?.image_front_url || null;

    return NextResponse.json({ image });
  } catch {
    return NextResponse.json({ image: null });
  }
}
