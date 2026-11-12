export const SESSION_STEPS = [
  { at: 0, tool: "Prompt", file: "Add order tracking to checkout.", kind: "prompt" },
  { at: 2.2, tool: "Read", file: "src/checkout.ts", kind: "read" },
  { at: 4.5, tool: "Edit", file: "src/checkout.ts", kind: "edit" },
  { at: 7, tool: "Run", file: "pnpm test · exit 0", kind: "run" },
  { at: 9.5, tool: "Edit", file: "tests/checkout.test.ts", kind: "edit" },
  { at: 12, tool: "Review", file: "An edit followed the last test run.", kind: "review" },
] as const;
export const SESSION_DURATION = 16;
export function sessionAt(seconds: number) {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0) % SESSION_DURATION;
  const step = Math.max(
    0,
    SESSION_STEPS.findLastIndex((event) => event.at <= time),
  );
  return {
    time,
    step,
    event: SESSION_STEPS[step],
    progress: time / SESSION_DURATION,
    reel: time * 0.65,
  };
}
