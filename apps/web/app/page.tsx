import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "./components/landing/landing-page";
import Dashboard from "./dashboard";
import { validSession } from "./local";
import { readLocation, reviewUrl } from "./review";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.view === "landing" || params.landing !== undefined) {
    return <LandingPage />;
  }

  let authorized = false;
  try {
    authorized = validSession((await cookies()).get("traceframe-local")?.value);
  } catch {}
  if (!authorized) {
    const query = new URLSearchParams();
    for (const key of ["project", "session", "view", "event", "before", "after", "file"]) {
      const value = params[key];
      if (typeof value === "string") query.set(key, value);
    }
    const target = reviewUrl(readLocation(new URL(`http://localhost/?${query}`)));
    redirect(`/connect${target.slice(1)}`);
  }
  return <Dashboard />;
}
