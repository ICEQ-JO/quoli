import { NextResponse } from "next/server";
import { collector } from "../../local";
export async function GET() {
  try {
    const response = await collector("/health");
    return NextResponse.json(
      { status: response.ok ? "ready" : "degraded", mode: "local-preview" },
      { status: response.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "collector-unavailable" }, { status: 503 });
  }
}
