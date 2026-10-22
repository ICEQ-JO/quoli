# @traceframe/repository

Bounded, read-only snapshots of a local Git working tree.

```ts
import { captureRepository } from "@traceframe/repository";

const snapshot = await captureRepository("/path/to/project", policy, {
  includeUntracked: true,
});
```

`captureRepository(root, policy, options?)` returns a `RepositorySnapshot`. Nothing is
persisted, nothing in the repository is written, and no captured text is returned
before the shared privacy helpers have redacted it.

## What it observes

- `head` and `indexIdentity` identify the observed commit and index. `indexIdentity`
  is derived from index file metadata (device, inode, size, mtime), never from index
  contents, so path names are never hashed.
- `files` lists tracked, staged and (opt-in) untracked paths with a relative,
  redacted path, the Git tracking state and the observed content.
- `dirty` is true when staged changes, captured raw-byte differences, untracked paths or observed deletions establish a dirty tree. It is null when uncaptured content prevents establishing a clean tree, and false only when the supported observation establishes no changes. HEAD is not the baseline: the snapshot describes the
  working tree as it was observed.
- `state` is `racy` when HEAD, the index or the file listing moved while the capture
  ran, or when a file changed while it was being read.
- `omitted` counts paths that were dropped because of the file limit. `warnings`
  explain every omission; they never contain the root path or captured text.

File `status` values: `present`, `deleted`, `symlink`, `submodule`, `binary`,
`oversized`, `excluded`, `unavailable`, `racy`. `content` is the shared schema
`Content` with the `code` category; `fingerprint` is the hash of the sanitized text
that is stored, never of raw file bytes.

## Safety properties

- Git runs with fixed argument arrays, never a shell. Its executable is resolved from absolute PATH entries outside the observed repository; relative entries and symlinks into the repository are rejected. Every inherited `GIT_*`
  variable is dropped, so an ambient `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` or
  `GIT_CONFIG_*` cannot redirect the inspection.
- `GIT_OPTIONAL_LOCKS=0` keeps Git from refreshing the index, so the index is
  byte-identical before and after a capture. No command stages, checks out, writes a
  tree or fetches.
- Global and system configuration and attributes are ignored, `core.fsmonitor` and
  `core.hooksPath` are disabled, external diff and text conversion are refused, and
  working-tree `status`/`diff-files` commands are never invoked. Git reads only HEAD/index/name metadata; content comparison uses bytes already read safely, so clean/smudge/process filters never run.
- On Linux, files are opened with `O_NOFOLLOW` through held parent directory descriptors under `/proc/self/fd`. Each ancestor is opened relative to its held parent, so an ancestor swapped to a symlink cannot redirect a later read. Other platforms fail closed for file observations until equivalent descriptor traversal is implemented.
  Only regular files are read; submodules are recorded and never traversed.
- Paths excluded by the capture policy are never opened. With `policy.code` disabled
  no file body is read at all.
- Git output is size and time bounded (16 MiB, 20 s per command).

## Limits

| Option | Default | Hard ceiling |
| --- | --- | --- |
| `maxFiles` | 1000 | 1000 |
| `maxFileBytes` | 1 MiB | 1 MiB |
| `maxTotalBytes` | 20 MiB | 20 MiB |

Options above a ceiling are rejected. Untracked files are captured only when
`includeUntracked` is set; ignored files are never captured.

## Known limitations

- A snapshot is not an atomic filesystem view. Files are read one after another, so a
  file that changes between two reads is only detected when its identity or
  timestamps change. A change that preserves both cannot be detected.
- Change detection compares raw file bytes. With a clean filter configured, Git would
  normally compare converted content; the filter is disabled instead of executed, and
  the snapshot warns about it.
- With `policy.code` disabled, unstaged changes are not detected at all, because
  detecting them would require reading file bodies. The snapshot warns about it; `dirty` is null unless known staged/untracked/deleted evidence positively establishes a dirty tree.
- Untracked files are optional because they are the most likely place for unrelated
  or sensitive material to appear.
- Only the work tree root of a repository is accepted; a subdirectory is rejected.
- A path that is not valid UTF-8 is counted in `omitted` and reported in `warnings`
  instead of being given a lossy name that would not match the file on disk.
