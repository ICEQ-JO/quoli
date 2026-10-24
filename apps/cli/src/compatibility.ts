import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Legacy releases declare their maximum schema by their shipped ordered migrations. */
export function releaseStorageVersion(root: string) {
  const versions = readdirSync(join(root, "migrations"))
    .map((name) => {
      if (!/^\d{3}-[a-z0-9-]+\.sql$/.test(name))
        throw new Error("Invalid release migration inventory");
      return Number(name.slice(0, 3));
    })
    .sort((a, b) => a - b);
  if (!versions.length || versions.some((value, index) => value !== index + 1))
    throw new Error("Incomplete release migrations");
  const release = JSON.parse(readFileSync(join(root, "release.json"), "utf8"));
  if (release.storageVersion !== undefined && release.storageVersion !== versions.length)
    throw new Error("Release storage compatibility mismatch");
  return versions.length;
}
export function assertDataCompatibility(root: string, database: string) {
  const maximum = releaseStorageVersion(root);
  if (!existsSync(database)) return;
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const versions = db.prepare("SELECT version FROM migrations ORDER BY version").all();
    if (
      !versions.length ||
      versions.some((row, index) => row.version !== index + 1) ||
      versions.length > maximum
    )
      throw new Error(
        "Database is newer than this release or has unsupported migration history; evidence was not changed. Database downgrades are not supported.",
      );
  } finally {
    db.close();
  }
}
