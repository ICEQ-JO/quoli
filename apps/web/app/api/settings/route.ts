import { settingsUpdateSchema } from "@traceframe/schema/lifecycle";
import { type NextRequest, NextResponse } from "next/server";
import { collector, validHost, validSession, validSite } from "../../local";

const project = (request: NextRequest) => {
  const value = request.nextUrl.searchParams.get("project") ?? "";
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
};

export async function GET(request: NextRequest) {
  if (!validHost(request.headers.get("host")) || !validSite(request.headers.get("sec-fetch-site")))
    return NextResponse.json({ error: "Local origin required" }, { status: 403 });
  try {
    if (!validSession(request.cookies.get("traceframe-local")?.value))
      return NextResponse.json({ error: "Session expired. Reload to reconnect." }, { status: 401 });
    const id = project(request);
    if (!id) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    const response = await collector(`/v1/projects/${id}/settings`);
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Settings unavailable. Start the local collector and retry." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!validHost(request.headers.get("host")) || !validSite(request.headers.get("sec-fetch-site")))
    return NextResponse.json({ error: "Local origin required" }, { status: 403 });
  try {
    if (!validSession(request.cookies.get("traceframe-local")?.value))
      return NextResponse.json({ error: "Session expired. Reload to reconnect." }, { status: 401 });
    const id = project(request);
    if (!id) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ error: "Use application/json" }, { status: 415 });
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Settings body required" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        return NextResponse.json({ error: "Body too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const purge = body?.action === "purge";
    if (!purge && !settingsUpdateSchema.safeParse(body).success)
      return NextResponse.json({ error: "Invalid settings update" }, { status: 400 });
    const response = await collector(`/v1/projects/${id}/${purge ? "purge" : "settings"}`, {
      method: "POST",
      body: JSON.stringify(purge ? {} : body),
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
            ? "Invalid settings JSON"
            : "Settings unavailable. Start the local collector and retry.",
      },
      { status: error instanceof SyntaxError ? 400 : 503 },
    );
  }
}
