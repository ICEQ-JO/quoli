import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  symlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const LIMIT = 512 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
function writeAll(fd: number, data: Buffer) {
  let offset = 0;
  while (offset < data.length) {
    const count = writeSync(fd, data, offset, data.length - offset);
    if (!count) throw new Error("Release write made no progress");
    offset += count;
  }
}
/** Snapshot a bounded regular input so verification and consumption use our private copy. */
export function copyReleaseInput(source: string, destination: string, limit = LIMIT) {
  const input = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let output: number | undefined;
  try {
    if (!fstatSync(input).isFile() || fstatSync(input).size > limit)
      throw new Error("Invalid release input file");
    output = openSync(destination, "wx", 0o600);
    const buffer = Buffer.alloc(256 * 1024);
    let total = 0,
      count = 0;
    while (true) {
      count = readSync(input, buffer);
      if (!count) break;
      total += count;
      if (total > limit) throw new Error("Release input exceeds size limit");
      writeAll(output, buffer.subarray(0, count));
    }
  } finally {
    closeSync(input);
    if (output !== undefined) closeSync(output);
  }
}
function text(buffer: Buffer) {
  const end = buffer.indexOf(0);
  return decoder.decode(end < 0 ? buffer : buffer.subarray(0, end));
}
function octal(buffer: Buffer) {
  const value = text(buffer).trim();
  if (!/^[0-7]+$/.test(value)) throw new Error("Unsupported tar number");
  return Number.parseInt(value, 8);
}
function unsafeText(value: string) {
  return [...value].some(
    (char) => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
}
function memberPath(value: string) {
  const path = value.replace(/\/$/, "");
  if (
    path.length > 4096 ||
    unsafeText(path) ||
    (path !== "quoli" && !path.startsWith("quoli/")) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Unsafe release archive path");
  return path;
}
function pax(data: Buffer) {
  const values: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(32, offset);
    const length = Number(data.subarray(offset, space).toString("ascii"));
    if (
      space < offset ||
      !Number.isSafeInteger(length) ||
      length <= space - offset + 1 ||
      offset + length > data.length ||
      data[offset + length - 1] !== 10
    )
      throw new Error("Invalid PAX header");
    const record = decoder.decode(data.subarray(space + 1, offset + length - 1));
    const equal = record.indexOf("=");
    const key = record.slice(0, equal);
    if (
      equal < 1 ||
      !["path", "linkpath", "mtime", "atime", "ctime"].includes(key) ||
      key in values
    )
      throw new Error("Unsupported PAX field");
    values[key] = record.slice(equal + 1);
    offset += length;
  }
  return values;
}
/** Narrow POSIX/ustar reader: validate the entire archive before creating any member. */
export async function extractRelease(archive: string, directory: string) {
  const raw = join(directory, "archive.tar");
  const output = openSync(raw, "wx", 0o600);
  let expanded = 0;
  try {
    await pipeline(createReadStream(archive), createGunzip(), async (source) => {
      for await (const chunk of source) {
        expanded += chunk.length;
        if (expanded > LIMIT) throw new Error("Expanded release exceeds size limit");
        writeAll(output, chunk);
      }
    });
  } finally {
    closeSync(output);
  }
  const input = openSync(raw, "r");
  const entries: {
    path: string;
    type: string;
    size: number;
    mode: number;
    offset: number;
    link: string;
  }[] = [];
  const paths = new Map<string, string>();
  try {
    const header = Buffer.alloc(512);
    let offset = 0,
      zeros = 0;
    let extended: Record<string, string> | null = null;
    while (offset + 512 <= expanded) {
      if (readSync(input, header, 0, 512, offset) !== 512)
        throw new Error("Truncated release archive");
      offset += 512;
      if (header.every((byte) => byte === 0)) {
        zeros++;
        continue;
      }
      if (zeros) throw new Error("Data after tar end marker");
      const checksum = header.reduce(
        (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
        0,
      );
      if (
        checksum !== octal(header.subarray(148, 156)) ||
        !text(header.subarray(257, 263)).startsWith("ustar")
      )
        throw new Error("Invalid tar header");
      const size = octal(header.subarray(124, 136));
      if (!Number.isSafeInteger(size) || offset + Math.ceil(size / 512) * 512 > expanded)
        throw new Error("Truncated release member");
      const type = text(header.subarray(156, 157)) || "0";
      if (type === "x") {
        if (extended || size > 16384) throw new Error("Invalid extended header");
        const data = Buffer.alloc(size);
        if (readSync(input, data, 0, size, offset) !== size) throw new Error("Truncated PAX data");
        extended = pax(data);
      } else {
        if (!["0", "2", "5"].includes(type) || (type !== "0" && size !== 0))
          throw new Error("Unsupported release member type");
        const prefix = text(header.subarray(345, 500));
        const path = memberPath(
          extended?.path ?? `${prefix ? `${prefix}/` : ""}${text(header.subarray(0, 100))}`,
        );
        const link = extended?.linkpath ?? text(header.subarray(157, 257));
        if (paths.has(path) || entries.length >= 10000 || (path === "quoli" && type !== "5"))
          throw new Error("Duplicate or excessive release members");
        if (type === "2" && (!link || posix.isAbsolute(link) || unsafeText(link)))
          throw new Error("Unsafe release symlink");
        if (type === "2") memberPath(posix.normalize(posix.join(posix.dirname(path), link)));
        paths.set(path, type);
        entries.push({
          path,
          type,
          size,
          mode: octal(header.subarray(100, 108)) & 0o755,
          offset,
          link,
        });
        extended = null;
      }
      offset += Math.ceil(size / 512) * 512;
    }
    if (zeros < 2 || offset !== expanded || extended || !entries.length)
      throw new Error("Incomplete release archive");
    for (const entry of entries) {
      let parent = posix.dirname(entry.path);
      while (parent !== ".") {
        if (paths.has(parent) && paths.get(parent) !== "5")
          throw new Error("Release member has a non-directory parent");
        parent = posix.dirname(parent);
      }
    }
    const buffer = Buffer.alloc(256 * 1024);
    for (const entry of entries.filter((entry) => entry.type !== "2")) {
      const path = join(directory, entry.path);
      if (entry.type === "5") {
        mkdirSync(path, { recursive: true, mode: 0o700 });
        continue;
      }
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const file = openSync(path, "wx", entry.mode);
      try {
        let copied = 0;
        while (copied < entry.size) {
          const count = readSync(
            input,
            buffer,
            0,
            Math.min(buffer.length, entry.size - copied),
            entry.offset + copied,
          );
          if (!count) throw new Error("Truncated release file");
          writeAll(file, buffer.subarray(0, count));
          copied += count;
        }
      } finally {
        closeSync(file);
      }
    }
    for (const entry of entries.filter((entry) => entry.type === "2"))
      symlinkSync(entry.link, join(directory, entry.path));
    const root = realpathSync(join(directory, "quoli"));
    for (const entry of entries.filter((entry) => entry.type === "2")) {
      const target = realpathSync(join(directory, entry.path));
      if (target !== root && !target.startsWith(`${root}/`))
        throw new Error("External release symlink");
    }
    return root;
  } finally {
    closeSync(input);
  }
}
