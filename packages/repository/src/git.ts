import { execFile } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative } from "node:path";

/** Why a Git invocation did not produce usable output. */
export type GitFailure = "exit" | "timeout" | "too-large" | "spawn";

export type GitResult = { ok: true; stdout: Buffer } | { ok: false; failure: GitFailure };

export type GitRunner = {
  /** Runs Git with a fixed argument array. Never resolves to stderr. */
  run(args: string[]): Promise<GitResult>;
  /** Runs Git and throws a generic error when the command fails. */
  require(args: string[]): Promise<Buffer>;
  /** Runs Git and returns null instead of throwing. */
  optional(args: string[]): Promise<Buffer | null>;
};

const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/**
 * Builds a minimal environment for Git. Every GIT_* variable inherited from the
 * caller is dropped so an ambient GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE or
 * GIT_CONFIG_* cannot redirect the inspection away from the registered root.
 */
function buildEnv(root: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GIT_")) continue;
    env[key] = value;
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PAGER: "cat",
    GIT_EDITOR: "true",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_CEILING_DIRECTORIES: root,
    LC_ALL: "C",
    LANG: "C",
    TZ: "UTC",
  };
}

/**
 * A read-only Git runner. It uses fixed argument arrays (never a shell), bounds
 * output size and runtime, and never writes to the repository: GIT_OPTIONAL_LOCKS
 * keeps Git from refreshing the index, and no command here stages, writes trees,
 * checks out or fetches.
 */
function gitExecutable(root: string): string {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    try {
      const executable = realpathSync(join(directory, "git"));
      const location = relative(root, executable);
      if (location === "" || (!location.startsWith("..") && !isAbsolute(location))) continue;
      accessSync(executable, constants.X_OK);
      if (statSync(executable).isFile()) return executable;
    } catch {
      /* Continue through the explicitly configured absolute search path. */
    }
  }
  throw new Error("Git executable unavailable outside the observed repository");
}

export function createGitRunner(root: string, config: Array<[string, string]> = []): GitRunner {
  const env = buildEnv(root);
  const executable = gitExecutable(root);
  const prefix = config.flatMap(([key, value]) => ["-c", `${key}=${value}`]);
  const run = (args: string[]): Promise<GitResult> =>
    new Promise((settle) => {
      const child = execFile(
        executable,
        [...prefix, ...args],
        {
          cwd: root,
          env,
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          encoding: "buffer",
          killSignal: "SIGKILL",
        },
        (error, stdout) => {
          if (!error) {
            settle({ ok: true, stdout });
            return;
          }
          const code = (error as { code?: unknown }).code;
          if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            settle({ ok: false, failure: "too-large" });
            return;
          }
          if (typeof code === "number") {
            settle({ ok: false, failure: "exit" });
            return;
          }
          if ((error as { killed?: boolean }).killed) {
            settle({ ok: false, failure: "timeout" });
            return;
          }
          settle({ ok: false, failure: "spawn" });
        },
      );
      child.on("error", () => settle({ ok: false, failure: "spawn" }));
    });
  const require = async (args: string[]): Promise<Buffer> => {
    const result = await run(args);
    if (!result.ok) throw new Error("Git inspection failed");
    return result.stdout;
  };
  return {
    run,
    require,
    optional: async (args) => {
      const result = await run(args);
      return result.ok ? result.stdout : null;
    },
  };
}

/** Splits a NUL separated Git stream. Git quotes nothing in -z mode. */
export function splitNul(buffer: Buffer): string[] {
  return buffer.toString("utf8").split("\0");
}

/** Splits a NUL separated Git stream into raw byte records. */
export function splitNulBytes(buffer: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index++) {
    if (buffer[index] === 0) {
      if (index > start) parts.push(buffer.subarray(start, index));
      start = index + 1;
    }
  }
  if (start < buffer.length) parts.push(buffer.subarray(start));
  return parts;
}

/** Decodes a path that Git stores as raw bytes. */
export function decodePath(bytes: Buffer): { path: string; valid: boolean } {
  try {
    return { path: new TextDecoder("utf-8", { fatal: true }).decode(bytes), valid: true };
  } catch {
    return { path: bytes.toString("utf8"), valid: false };
  }
}

/**
 * Parses `git diff-index --raw -z` output into paths. Each record is an info
 * field followed by one path field (renames are disabled by the caller).
 */
export function parseRawDiffPaths(buffer: Buffer): { paths: string[]; invalid: string[] } {
  const fields = splitNulBytes(buffer);
  const paths: string[] = [];
  const invalid: string[] = [];
  for (let index = 0; index < fields.length; index++) {
    const info = fields[index];
    if (!info.length || info[0] !== 0x3a) continue;
    const raw = fields[index + 1];
    if (raw === undefined) break;
    index += 1;
    const decoded = decodePath(raw);
    if (decoded.valid) paths.push(decoded.path);
    else invalid.push(raw.toString("base64"));
  }
  return { paths, invalid };
}
