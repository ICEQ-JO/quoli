import { parseArgs } from "node:util";
import { safeId } from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";
import { rotateCredential, runtime } from "../packages/storage/src/runtime";

const usage = `Traceframe capture controls

pnpm settings list
pnpm settings show PROJECT_ID
pnpm settings policy PROJECT_ID [--prompt|--tool|--code|--no-prompt|--no-tool|--no-code]
pnpm settings pause PROJECT_ID
pnpm settings resume PROJECT_ID
pnpm settings retention PROJECT_ID --days 30   (--days 0 keeps everything)
pnpm settings usage PROJECT_ID
pnpm settings purge PROJECT_ID --confirm
pnpm settings rotate-credential

Policy changes apply to new observations only. Purge removes retained evidence for the
project and stops capture; source files, agent transcripts and external backups stay.`;

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      prompt: { type: "boolean" },
      tool: { type: "boolean" },
      code: { type: "boolean" },
      "no-prompt": { type: "boolean" },
      "no-tool": { type: "boolean" },
      "no-code": { type: "boolean" },
      days: { type: "string" },
      confirm: { type: "boolean" },
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
  const commands = [
    "list",
    "show",
    "policy",
    "pause",
    "resume",
    "retention",
    "usage",
    "purge",
    "rotate-credential",
  ];
  if (!commands.includes(command) || positionals.length > 2) throw new Error("Invalid operation");
  const store = new Store(runtime().dbFile);
  try {
    if (command === "rotate-credential") {
      rotateCredential();
      console.log("The local credential was rotated.");
      console.log(
        "Existing browser sessions and any bridge command that carries the previous credential stop working. Update the hook entry with pnpm bridge install.",
      );
      return;
    }
    if (command === "list") {
      for (const project of store.projects()) {
        const lifecycle = store.lifecycle(project.id);
        console.log(
          `${project.id}\t${project.name}\t${lifecycle.purgedAt ? "deleted" : lifecycle.paused ? "paused" : "running"}\t${store.usage(project.id).bytes} bytes`,
        );
      }
      return;
    }
    if (!target) throw new Error("Target required");
    const projectId = safeId.parse(target);
    if (!store.project(projectId)) throw new Error("Project not registered");
    if (command === "show") {
      const settings = store.settings(projectId);
      console.log(
        JSON.stringify(
          {
            projectId,
            name: settings.project.name,
            policy: settings.project.policy,
            paused: settings.paused,
            retentionDays: settings.retentionDays,
            usage: settings.usage,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (command === "policy") {
      const policy = {
        ...(values.prompt === undefined ? {} : { prompt: values.prompt }),
        ...(values["no-prompt"] ? { prompt: false } : {}),
        ...(values.tool === undefined ? {} : { tool: values.tool }),
        ...(values["no-tool"] ? { tool: false } : {}),
        ...(values.code === undefined ? {} : { code: values.code }),
        ...(values["no-code"] ? { code: false } : {}),
      };
      if (!Object.keys(policy).length) throw new Error("Choose at least one content control");
      store.updateSettings(projectId, { policy });
      console.log(`Capture policy updated for ${projectId}. New observations follow it.`);
      return;
    }
    if (command === "pause" || command === "resume") {
      store.updateSettings(projectId, { paused: command === "pause" });
      console.log(`Capture ${command === "pause" ? "paused" : "resumed"} for ${projectId}.`);
      return;
    }
    if (command === "retention") {
      const days = Number(values.days ?? "");
      if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error("Invalid retention");
      store.updateSettings(projectId, { retentionDays: days === 0 ? null : days });
      console.log(
        days === 0
          ? `Retention disabled for ${projectId}: evidence is kept until deleted.`
          : `Retention set to ${days} days for ${projectId}.`,
      );
      return;
    }
    if (command === "usage") {
      const usage = store.usage(projectId);
      console.log(
        `${usage.events} observations · ${usage.snapshots} captures · ${usage.artifacts} artifacts · ${usage.bytes} bytes`,
      );
      return;
    }
    if (!values.confirm) throw new Error("Deletion requires --confirm");
    const result = store.purgeProject(projectId);
    console.log(
      `Deleted ${result.removed.events} observations, ${result.removed.snapshots} captures and ${result.removed.artifacts} artifacts for ${projectId}.`,
    );
    console.log(
      "Capture and storage for this project are stopped. Source files, agent transcripts and external backups were not touched.",
    );
  } finally {
    store.close();
  }
}
main().catch(() => {
  // Settings errors can include policy details; keep the message generic.
  console.error(
    "Settings operation failed. Check the command, the project id and local storage permissions. Run pnpm settings --help for usage.",
  );
  process.exitCode = 1;
});
