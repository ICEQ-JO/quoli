import assert from "node:assert/strict";
import { test } from "node:test";
import { isInternalAgentWorktree } from "../web/src/worktrees.ts";

const base = {
  id: "p1",
  root: "/repo",
  name: "repo",
  sessions: 0,
  lastActivity: null,
  hookStatus: "receiving" as const,
  agents: [],
  connectedAt: null,
  github: null,
};

test("internal agent worktrees are hidden by default", () => {
  assert.equal(
    isInternalAgentWorktree({
      ...base,
      id: "a1",
      name: "agent-a123",
      root: "/repo/.claude/worktrees/agent-a123",
      worktreeOf: "p1",
    }),
    true,
  );
});

test("real worktrees are not treated as internal agent worktrees", () => {
  assert.equal(
    isInternalAgentWorktree({
      ...base,
      id: "w1",
      name: "trial",
      root: "/repo/.claude/worktrees/trial",
      worktreeOf: "p1",
    }),
    false,
  );
  assert.equal(isInternalAgentWorktree({ ...base, worktreeOf: null }), false);
});
