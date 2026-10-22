import { credential, runtime } from "../packages/storage/src/runtime";
export async function seed() {
  const res = await fetch(`http://127.0.0.1:${runtime().collectorPort}/v1/demo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credential()}` },
  });
  if (!res.ok)
    throw new Error("Could not import demo. Start the collector and check local storage.");
  const result = (await res.json()) as { accepted: number; duplicates: number };
  console.log(
    `Synthetic demo ready: ${result.accepted} new observations, ${result.duplicates} already present.`,
  );
}
if (process.argv[1]?.endsWith("/seed.ts"))
  seed().catch(() => {
    console.error("Demo import failed. Run pnpm demo to start the local services.");
    process.exitCode = 1;
  });
