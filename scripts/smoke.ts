import { credential, runtime } from "../packages/storage/src/runtime";

const config = runtime();
const collector = await fetch(`http://127.0.0.1:${config.collectorPort}/health`, {
  headers: { Authorization: `Bearer ${credential()}` },
});
const url = `http://127.0.0.1:${config.webPort}`;
const connect = await fetch(`${url}/connect`, { redirect: "manual" });
const cookie = connect.headers.get("set-cookie")?.split(";")[0] ?? "";
const web = await fetch(url, { headers: { Cookie: cookie }, redirect: "manual" });
if (!collector.ok || !web.ok) throw new Error("Local smoke check failed");
console.log("PASS: authenticated collector and dashboard are reachable on loopback.");
