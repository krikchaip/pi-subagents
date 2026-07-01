import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { PolishedSettingsList } from "../src/ui/polished-settings-list.js";

const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const ENTER = "\r";

const colorCodes: Record<string, number> = { accent: 36 };

const theme = {
  fg: (color: string, text: string) => `\x1b[${colorCodes[color] ?? 39}m${text}\x1b[39m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};

const listTheme = {
  label: (text: string, selected: boolean) => selected ? `\x1b[32m${text}\x1b[39m` : text,
  value: (text: string, selected: boolean) => selected ? `\x1b[32m${text}\x1b[39m` : `\x1b[2m${text}\x1b[22m`,
  description: (text: string) => `\x1b[2m${text}\x1b[22m`,
  cursor: `\x1b[32m→ \x1b[39m`,
  hint: (text: string) => `\x1b[2m${text}\x1b[22m`,
};

describe("PolishedSettingsList", () => {
  it("renders themed borders, bold heading, fixed description rows, and left/right hint", () => {
    const list = new PolishedSettingsList({
      title: "Agent types",
      items: [
        { id: "a", label: "Explore", currentValue: "inherit", description: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen", values: ["inherit"] },
      ],
      maxVisible: 1,
      theme,
      listTheme,
      activationHint: "Enter/Space open",
      onCancel: vi.fn(),
    });

    const lines = list.render(32);
    expect(lines[0]).toContain("\x1b[36m─");
    expect(lines[1].trim()).toBe("");
    expect(lines.at(-1)).toContain("\x1b[36m─");
    expect(lines[2]).toContain("\x1b[1mAgent types\x1b[22m");
    expect(lines.some(line => line.includes("←/→ description"))).toBe(true);
    expect(lines.filter(line => line.startsWith("\x1b[2m  ")).length).toBeGreaterThanOrEqual(3);
    expect(lines.some(line => line.includes("…"))).toBe(true);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(32);
  });

  it("scrolls description down with right and resets when selection changes", () => {
    const list = new PolishedSettingsList({
      title: "Settings",
      items: [
        { id: "long", label: "Long", currentValue: "on", description: "line1 line2 line3 line4 line5 line6 line7 line8 line9 line10 line11 line12", values: ["on", "off"] },
        { id: "short", label: "Short", currentValue: "off", description: "short desc", values: ["off", "on"] },
      ],
      maxVisible: 2,
      theme,
      listTheme,
      activationHint: "Enter/Space change/type",
      onCancel: vi.fn(),
    });

    const before = list.render(24).join("\n");
    list.handleInput(RIGHT);
    const afterScroll = list.render(24).join("\n");
    expect(afterScroll).not.toBe(before);

    list.handleInput(DOWN);
    const afterMove = list.render(24).join("\n");
    expect(afterMove).toContain("short desc");
  });

  it("cycles values and calls onChange on Enter", () => {
    const onChange = vi.fn();
    const list = new PolishedSettingsList({
      title: "Settings",
      items: [{ id: "fleet", label: "Fleet", currentValue: "on", description: "Fleet view", values: ["on", "off"] }],
      maxVisible: 1,
      theme,
      listTheme,
      activationHint: "Enter/Space change/type",
      onChange,
      onCancel: vi.fn(),
    });

    list.handleInput(ENTER);
    expect(onChange).toHaveBeenCalledWith("fleet", "off");
    expect(list.render(40).join("\n")).toContain("off");
  });
});
