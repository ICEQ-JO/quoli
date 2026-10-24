import { execFile } from "node:child_process";
import { createReadStream, createWriteStream, rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";

/** GNU tar normalizes metadata; gzip has no filename or wall-clock timestamp. */
export async function releaseArchive(directory: string, archive: string, epoch: number) {
  const tar = `${archive}.tar`;
  try {
    await promisify(execFile)(
      "tar",
      [
        "--sort=name",
        "--format=posix",
        "--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime",
        `--mtime=@${epoch}`,
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "--mode=go+u,go-w,a-s,a-t",
        "-cf",
        tar,
        "-C",
        dirname(directory),
        basename(directory),
      ],
      { env: { PATH: process.env.PATH, LC_ALL: "C", TZ: "UTC" }, maxBuffer: 1024 * 1024 },
    );
    await pipeline(createReadStream(tar), createGzip({ level: 9 }), createWriteStream(archive));
  } finally {
    rmSync(tar, { force: true });
  }
}
