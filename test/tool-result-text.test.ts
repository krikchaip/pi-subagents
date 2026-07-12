import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { ToolResultText } from "../src/ui/tool-result-text.js";

function ccToolsIndented(lines: string[], width: number): string[] {
  return lines.map(line => truncateToWidth(` ${line}`, width));
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("ToolResultText", () => {
  it("does not pad lines that wrapper extensions indent", () => {
    const width = 40;
    const text = "✓ 1 tool use · 1.0s\n  ⎿  Done";

    const padded = ccToolsIndented(new Text(text, 0, 0).render(width), width);
    expect(padded.every(line => stripAnsi(line).endsWith("..."))).toBe(true);

    const unpadded = ccToolsIndented(new ToolResultText(text).render(width), width);
    expect(unpadded.every(line => !stripAnsi(line).endsWith("..."))).toBe(true);
    expect(unpadded.every(line => visibleWidth(line) <= width)).toBe(true);
  });
});
