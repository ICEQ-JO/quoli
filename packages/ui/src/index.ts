export function number(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value);
}
export function clock(value: string | null): string {
  return value ? new Date(value).toISOString().slice(11, 19) : "Unknown";
}
export const kindLabels: Record<string, string> = {
  session_start: "Session started",
  session_end: "Session ended",
  prompt: "Developer prompt",
  tool_call: "Tool requested",
  tool_result: "Tool result reported",
  usage: "Usage reported",
  gap: "Capture gap",
};
