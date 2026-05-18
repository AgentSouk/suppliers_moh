import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ image: null });

  try {
    // Step 1: get DDG vqd token
    const initRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" } }
    );
    const html = await initRes.text();
    const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
    if (!vqdMatch) return NextResponse.json({ image: null });
    const vqd = vqdMatch[1];

    // Step 2: fetch image results
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,,,&p=1`,
      { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://duckduckgo.com/" } }
    );
    const data = await imgRes.json();
    const first = data?.results?.[0]?.image || null;

    return NextResponse.json({ image: first }, {
      headers: { "Cache-Control": "public, max-age=86400" }
    });
  } catch {
    return NextResponse.json({ image: null });
  }
}
