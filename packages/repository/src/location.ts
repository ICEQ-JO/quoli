import { realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

async function canonicalLocation(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) throw new Error("Path unavailable");
    return join(await canonicalLocation(parent), basename(path));
  }
}
function inside(path: string, root: string) {
  const value = relative(root, path);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}
/** Validate before creating storage or connecting any producer. */
export async function registeredLocation(target: string, dataDir: string) {
  const root = await realpath(resolve(target));
  const data = await canonicalLocation(resolve(dataDir));
  if (!(await stat(root)).isDirectory() || inside(data, root) || inside(root, data))
    throw new Error("Repository and private storage must be separate directories");
  return root;
}
