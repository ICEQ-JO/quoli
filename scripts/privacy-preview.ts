import { demoEvents, demoPolicy } from "../fixtures/demo";
import { defaultPolicy } from "../packages/schema/src/index";
import { sanitizeEvent } from "../packages/schema/src/privacy";

const policy = process.argv.includes("--synthetic-content") ? demoPolicy : defaultPolicy;
console.log(
  JSON.stringify(
    {
      policy,
      note: "Synthetic preview only. Redaction reduces risk; it does not guarantee secret removal.",
      example: sanitizeEvent(demoEvents()[1], policy),
    },
    null,
    2,
  ),
);
