import type { ToolCall } from "./model.ts";

/**
 * One plain sentence for a tool call (#47), by rule from what was recorded: no model, nothing
 * leaves the computer. Claude Code, Codex, OpenCode and Pi tool names are covered; anything
 * else falls back to a neutral sentence naming the tool. Whether it failed or is still running
 * is shown beside it (a badge), not repeated here. A command's own description (Claude
 * Code's Bash `description`, written by the agent) is used when there is one.
 */
export function explainCall(call: ToolCall): string {
  return describe(call);
}

type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
const lines = (v: unknown) =>
  typeof v === "string" && v ? v.replace(/\n$/, "").split("\n").length : 0;
const short = (v: string, n = 60) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
const quote = (v: string) => `“${short(v, 50)}”`;

function describe(call: ToolCall): string {
  const i = (call.input && typeof call.input === "object" ? call.input : {}) as Input;
  const name = call.name.toLowerCase();
  const file = call.files[0]
    ? base(call.files[0])
    : str(i.file_path)
      ? base(i.file_path as string)
      : null;

  if (call.name.startsWith("mcp__")) {
    const [, server = "", tool = ""] = call.name.split("__");
    return `Used ${tool.replace(/_/g, " ") || "a tool"} from ${server || "an MCP server"}`;
  }
  if (name === "todowrite" || name === "todoread" || name === "update_plan")
    return "Updated its to-do list";
  if (name === "skill") {
    const skill = str(i.skill) ?? str(i.name);
    return skill ? `Used the ${skill} skill` : "Used a skill";
  }
  if (name === "exitplanmode") return "Proposed a plan";
  if (name === "ls" || name === "list")
    return str(i.path) ? `Listed the files in ${base(i.path as string)}` : "Listed files";
  if (name === "view_image") return "Looked at an image";
  if (name === "bashoutput") return "Checked on a command still running";
  if (name === "killshell") return "Stopped a running command";
  if (name === "write_stdin") return "Typed into a running command";
  if (name === "askuserquestion") return "Asked you a question";

  switch (call.category) {
    case "read": {
      if (!file) return "Read a file";
      const n = typeof i.limit === "number" ? ` (${i.limit} lines)` : "";
      return `Read ${file}${n}`;
    }
    case "edit":
      return editSentence(call, i, name, file);
    case "search": {
      const pattern = str(i.pattern) ?? str(i.query);
      if (name === "glob" || name === "list" || name === "ls")
        return pattern ? `Looked for files matching ${quote(pattern)}` : "Listed files";
      const where = str(i.path) ? ` in ${base(i.path as string)}` : "";
      return pattern ? `Searched the code for ${quote(pattern)}${where}` : "Searched the code";
    }
    case "web": {
      const url = str(i.url);
      if (url) {
        try {
          return `Opened a web page on ${new URL(url).hostname}`;
        } catch {
          return "Opened a web page";
        }
      }
      const q = str(i.query);
      return q ? `Searched the web for ${quote(q)}` : "Used the web";
    }
    case "agent": {
      const what = str(i.description);
      const who = str(i.subagent_type);
      const kind = who && who !== "general-purpose" ? ` (${who})` : "";
      return `Handed a task to a subagent${kind}${what ? `: ${short(what)}` : ""}`;
    }
    case "run":
      return commandSentence(i);
    default:
      return `Used the ${call.name} tool`;
  }
}

function editSentence(call: ToolCall, i: Input, name: string, file: string | null): string {
  const target = file ?? "a file";
  if (name === "write") {
    const n = lines(i.content);
    return `Wrote ${target}${n ? ` (${n} lines)` : ""}`;
  }
  if (name === "apply_patch") {
    const count = call.files.length;
    return count > 1 ? `Changed ${count} files` : `Changed ${target}`;
  }
  if (name === "multiedit" && Array.isArray(i.edits)) {
    return `Made ${i.edits.length} changes to ${target}`;
  }
  const removed = lines(i.old_string);
  const added = lines(i.new_string);
  return removed || added ? `Changed ${target} (+${added} −${removed} lines)` : `Changed ${target}`;
}

const GIT: [RegExp, string][] = [
  [/^git\s+commit\b/, "Made a Git commit"],
  [/^git\s+push\b/, "Pushed commits to the remote"],
  [/^git\s+(pull|fetch)\b/, "Fetched the latest changes"],
  [/^git\s+(checkout|switch)\b/, "Switched Git branch"],
  [/^git\s+(merge|rebase)\b/, "Combined Git branches"],
  [/^git\s+add\b/, "Staged changes for a commit"],
  [/^git\s+(status|diff|log|show|blame|branch)\b/, "Looked at the Git history and changes"],
  [/^git\s+(stash|reset|restore)\b/, "Set aside or undid changes in Git"],
];

/** A shell command in plain words: what kind of work it does, not the exact flags. */
export function commandSentence(i: Input): string {
  const raw = Array.isArray(i.command)
    ? i.command.filter((a) => typeof a === "string").join(" ")
    : (str(i.command) ?? str(i.cmd) ?? "");
  const own = str(i.description);
  if (own) return short(own.replace(/\.$/, ""), 90);
  // Shells wrap the real command (`bash -lc "…"`); look at the first real step.
  const cmd = raw
    .replace(/^(?:ba|z)?sh\s+-l?c\s+["']?/, "")
    .replace(/^cd\s+\S+\s*&&\s*/, "")
    .trim();
  if (!cmd) return "Ran a command";
  for (const [re, text] of GIT) if (re.test(cmd)) return text;
  if (/^gh\s+pr\b/.test(cmd)) return "Worked with a pull request on GitHub";
  if (/^gh\s/.test(cmd)) return "Used the GitHub command line";
  if (/\b(test|jest|vitest|pytest|rspec|mocha)\b|go test|cargo test|node --test/.test(cmd))
    return "Ran the tests";
  if (/\b(tsc|typecheck|mypy|pyright)\b/.test(cmd)) return "Checked the code for type errors";
  if (/\b(lint|eslint|biome|ruff|flake8|clippy)\b|prettier/.test(cmd))
    return "Checked the code style";
  if (
    /\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b|pip3?\s+install|cargo add|go get|uv (add|sync)/.test(
      cmd,
    )
  )
    return "Installed packages";
  if (/\b(build|make|webpack|vite build|cargo build|go build)\b/.test(cmd))
    return "Built the project";
  if (/\b(dev|start|serve)\b|runserver|uvicorn|node\s+\S+\.m?js/.test(cmd))
    return "Started a program";
  if (/^(docker|docker-compose|kubectl)\b/.test(cmd)) return "Worked with containers";
  if (/^(curl|wget|http)\b/.test(cmd)) return "Made a web request";
  if (/^(rm|rmdir)\b/.test(cmd)) return "Deleted files";
  if (/^(mv|cp|mkdir|touch|ln)\b/.test(cmd)) return "Moved or created files";
  if (/^(ls|tree|find|fd|pwd)\b/.test(cmd)) return "Looked around the folders";
  if (/^(cat|head|tail|less|sed -n|wc|nl)\b/.test(cmd)) return "Read a file in the terminal";
  if (/^(grep|rg|ag|ack)\b/.test(cmd)) return "Searched the code";
  if (/^(sleep|echo|true|printf)\b/.test(cmd)) return "Ran a small shell command";
  const word = cmd.split(/\s+/)[0] ?? "";
  return `Ran ${word.length > 24 ? "a command" : `\`${word}\``}`;
}
