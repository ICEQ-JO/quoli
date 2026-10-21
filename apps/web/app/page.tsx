import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "./dashboard";
import { validSession } from "./local";
export const dynamic = "force-dynamic";
export default async function Page() {
  let authorized = false;
  try {
    authorized = validSession((await cookies()).get("traceframe-local")?.value);
  } catch {}
  if (!authorized) redirect("/connect");
  return <Dashboard />;
}
