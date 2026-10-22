import { browserQuerySchema } from "@traceframe/schema";
import { type NextRequest, NextResponse } from "next/server";
import { collector, validHost, validSession, validSite } from "../../local";
export async function GET(request: NextRequest) {
  if (!validHost(request.headers.get("host")) || !validSite(request.headers.get("sec-fetch-site")))
    return NextResponse.json({ error: "Local origin required" }, { status: 403 });
  try {
    if (!validSession(request.cookies.get("traceframe-local")?.value))
      return NextResponse.json(
        { error: "Local session expired. Reload to reconnect." },
        { status: 401 },
      );
    const q = request.nextUrl.searchParams;
    const resource = q.get("resource") ?? "projects";
    if (
      ![
        "projects",
        "sessions",
        "session-counts",
        "events",
        "summary",
        "health",
        "evidence",
        "snapshots",
        "observation",
        "repository-history",
      ].includes(resource)
    )
      return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    const project = q.get("project") ?? "",
      session = q.get("session") ?? "";
    if (resource !== "projects" && resource !== "health" && !/^[a-zA-Z0-9_-]{1,100}$/.test(project))
      return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    if (
      ["events", "summary", "evidence", "snapshots", "repository-history"].includes(resource) &&
      !/^[a-zA-Z0-9_-]{1,100}$/.test(session)
    )
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    let path =
      resource === "health"
        ? "/health"
        : resource === "projects"
          ? "/v1/projects"
          : `/v1/projects/${project}/sessions`;
    if (resource === "session-counts") path = `/v1/projects/${project}/session-counts`;
    if (resource === "observation") path = `/v1/projects/${project}/observation`;
    if (resource === "summary") path += `/${session}/summary`;
    if (resource === "repository-history") path += `/${session}/repository-history`;
    if (resource === "events" || resource === "snapshots") {
      const cursor = q.get("cursor") ?? "0";
      if (!/^\d{1,10}$/.test(cursor))
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      path += `/${session}/${resource}?cursor=${cursor}`;
      if (resource === "snapshots") {
        const order = q.get("order") ?? "receipt";
        if (order !== "receipt" && order !== "latest")
          return NextResponse.json({ error: "Invalid capture order" }, { status: 400 });
        path += `&order=${order}`;
      }
    }
    if (resource === "evidence") {
      const id = q.get("event") ?? "";
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
        return NextResponse.json({ error: "Invalid evidence" }, { status: 400 });
      path += `/${session}/events?event=${id}`;
    }
    const response = await collector(path);
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Collector unavailable. Start pnpm demo, then retry." },
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
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ error: "Use application/json" }, { status: 415 });
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Query body required" }, { status: 400 });
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
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const parsed = browserQuerySchema.safeParse(input);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid session query" }, { status: 400 });
    const { project, session, query } = parsed.data;
    const response = await collector(`/v1/projects/${project}/sessions/${session}/events/query`, {
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
            ? "Invalid query JSON"
            : "Collector unavailable. Retry to reconnect.",
      },
      { status: error instanceof SyntaxError ? 400 : 503 },
    );
  }
}
