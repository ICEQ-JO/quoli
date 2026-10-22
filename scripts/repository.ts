import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { captureRepository } from "../packages/repository/src/index";
import { defaultPolicy, safeId } from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";
import { runtime } from "../packages/storage/src/runtime";

const usage = `Traceframe repository capture

pnpm repository register /path/to/repository --name "Project" [--capture-code] [--include-untracked]
pnpm repository snapshot PROJECT_ID [--session REVIEW_ID]
pnpm repository list

Registration defaults to metadata-only. --capture-code enables sanitized code persistence.
Untracked files require separate consent. No Git writes or recorded commands are performed.
Use the same --session value for before/after observations. The first capture is the baseline.`;

async function canonicalLocation(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) throw new Error("Path unavailable");
    return join(await canonicalLocation(parent), basename(path));
  }
}
function inside(path: string, root: string): boolean {
  const value = relative(root, path);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      name: { type: "string" },
      "capture-code": { type: "boolean", default: false },
      "include-untracked": { type: "boolean", default: false },
      session: { type: "string", default: "manual-review" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help || !positionals.length) {
    console.log(usage);
    return;
  }
  const [command, target] = positionals;
  if (!["list", "register", "snapshot"].includes(command) || positionals.length > 2)
    throw new Error("Invalid operation");
  if (
    command !== "register" &&
    (values["capture-code"] || values["include-untracked"] || values.name)
  )
    throw new Error("Capture consent is set during registration");
  const config = runtime();
  const registeredRoot = command === "register" && target ? await realpath(resolve(target)) : null;
  if (registeredRoot) {
    const privateData = await canonicalLocation(config.dataDir);
    if (inside(privateData, registeredRoot) || inside(registeredRoot, privateData))
      throw new Error("Repository and private storage must not overlap");
  }
  const store = new Store(config.dbFile);
  try {
    if (command === "list") {
      if (target) throw new Error("List takes no target");
      for (const project of store.projects()) {
        if (!project.synthetic && store.repository(project.id))
          console.log(
            `${project.id}\t${project.name}\tcode ${project.policy.code ? "enabled" : "disabled"}`,
          );
      }
      return;
    }
    if (!target) throw new Error("Target required");
    if (command === "register") {
      const root = registeredRoot;
      if (!root) throw new Error("Repository path required");
      if (!(await stat(root)).isDirectory()) throw new Error("Directory required");
      // Preflight only: metadata consent, and no snapshot body persisted by registration.
      await captureRepository(root, defaultPolicy, {
        maxFiles: 1,
        maxFileBytes: 64,
        maxTotalBytes: 64,
      });
      const id = `repo_${randomUUID().replaceAll("-", "")}`;
      store.registerLocalRepository(
        id,
        values.name ?? basename(root),
        root,
        {
          ...defaultPolicy,
          code: values["capture-code"] ?? false,
        },
        values["include-untracked"] ?? false,
      );
      console.log(`Project registered: ${id}`);
      console.log(
        `Code capture ${values["capture-code"] ? "enabled with best-effort redaction" : "disabled (metadata only)"}. Untracked files ${values["include-untracked"] ? "included" : "excluded"}.`,
      );
      console.log(`Capture a baseline: pnpm repository snapshot ${id} --session manual-review`);
      return;
    }
    const projectId = safeId.parse(target);
    const sessionId = safeId.parse(values.session);
    const project = store.project(projectId);
    const repository = store.repository(projectId);
    if (!project || !repository) throw new Error("Repository not registered");
    // A paused project stops capture, including scheduled repository captures.
    if (store.lifecycle(projectId).paused) throw new Error("Capture is paused for this project");
    const currentRoot = await realpath(repository.root);
    const privateData = await canonicalLocation(config.dataDir);
    if (
      currentRoot !== repository.root ||
      inside(privateData, currentRoot) ||
      inside(currentRoot, privateData)
    )
      throw new Error("Registered root changed or overlaps private storage");
    const snapshot = await captureRepository(currentRoot, project.policy, {
      includeUntracked: repository.includeUntracked,
    });
    const reason = store.snapshotSummaries(projectId, sessionId).total ? "checkpoint" : "baseline";
    const saved = store.appendSnapshot(projectId, sessionId, snapshot, reason);
    console.log(`Captured ${reason}: ${saved.id}`);
    console.log(
      `Project ${projectId} · session ${sessionId} · ${saved.files.length} file observations · ${saved.omitted} omitted · ${saved.state}`,
    );
    console.log("Working-tree observations are not atomic and do not establish agent authorship.");
  } finally {
    store.close();
  }
}
main().catch(() => {
  // Filesystem/Git exceptions can include absolute paths or captured content.
  console.error(
    "Repository operation failed. Check the command, local directory access, Git availability, and private storage. Run pnpm repository --help for usage.",
  );
  process.exitCode = 1;
});
