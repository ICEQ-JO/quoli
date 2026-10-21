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
    if (!["projects", "sessions", "events", "summary", "health", "evidence"].includes(resource))
      return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    const project = q.get("project") ?? "",
      session = q.get("session") ?? "";
    if (resource !== "projects" && resource !== "health" && !/^[a-zA-Z0-9_-]{1,100}$/.test(project))
      return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    if (
      ["events", "summary", "evidence"].includes(resource) &&
      !/^[a-zA-Z0-9_-]{1,100}$/.test(session)
    )
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    let path =
      resource === "health"
        ? "/health"
        : resource === "projects"
          ? "/v1/projects"
          : `/v1/projects/${project}/sessions`;
    if (resource === "summary") path += `/${session}/summary`;
    if (resource === "events") {
      const cursor = q.get("cursor") ?? "0";
      if (!/^\d{1,10}$/.test(cursor))
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      path += `/${session}/events?cursor=${cursor}`;
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
