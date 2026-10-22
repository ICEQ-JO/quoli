import { type NextRequest, NextResponse } from "next/server";
import { sessionToken, validHost, validSite } from "../local";
import { readLocation, reviewUrl } from "../review";
export function GET(request: NextRequest) {
  if (!validHost(request.headers.get("host")) || !validSite(request.headers.get("sec-fetch-site")))
    return new NextResponse("Open Quoli directly on loopback.", { status: 403 });
  const response = NextResponse.redirect(
    // Next may normalize request.url to localhost. Preserve the allowlisted Host
    // so IP connections keep their separate browser cookie namespace.
    new URL(reviewUrl(readLocation(new URL(request.url))), `http://${request.headers.get("host")}`),
  );
  response.cookies.set("traceframe-local", sessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
