import { browserMapSchema } from "@traceframe/schema/map";
import { type NextRequest, NextResponse } from "next/server";
import { collector, validHost, validSession, validSite } from "../../local";
export async function POST(request: NextRequest) {
  if (!validHost(request.headers.get("host")) || !validSite(request.headers.get("sec-fetch-site")))
    return NextResponse.json({ error: "Local origin required" }, { status: 403 });
  try {
    if (!validSession(request.cookies.get("traceframe-local")?.value))
      return NextResponse.json({ error: "Session expired. Reload to reconnect." }, { status: 401 });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ error: "Use application/json" }, { status: 415 });
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Map query required" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        return NextResponse.json({ error: "Query too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const parsed = browserMapSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) return NextResponse.json({ error: "Invalid map query" }, { status: 400 });
    const { project, session, query } = parsed.data;
    const response = await collector(`/v1/projects/${project}/sessions/${session}/map`, {
      method: "POST",
      body: JSON.stringify(query),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SyntaxError
            ? "Invalid map query JSON"
            : "Change map unavailable. Start the local collector and retry.",
      },
      { status: error instanceof SyntaxError ? 400 : 503 },
    );
  }
}
