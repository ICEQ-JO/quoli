import { type NextRequest, NextResponse } from "next/server";
import { validHost, validSite } from "./app/local";
export function proxy(request: NextRequest) {
  if (
    !validHost(request.headers.get("host")) ||
    !validSite(request.headers.get("sec-fetch-site")) ||
    (request.headers.has("origin") &&
      request.headers.get("origin") !== `http://${request.headers.get("host")}`)
  )
    return new NextResponse("Loopback origin required.", { status: 403 });
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
