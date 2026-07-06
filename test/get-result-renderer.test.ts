import { describe, expect, it, vi } from "vitest";
import subagentsExtension from "../src/index.js";

function makePi() {
  const tools = new Map<string, any>();

  return {
    registerMessageRenderer: vi.fn(),
    registerTool: vi.fn((tool: any) => {
      tools.set(tool.name, tool);
    }),
    registerCommand: vi.fn(),
    on: vi.fn(),
    events: {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    },
    tools,
  } as any as { tools: Map<string, any> };
}

describe("get_subagent_result renderer", () => {
  it("collapses completed output after the description line", () => {
    const pi = makePi();
    subagentsExtension(pi as any);

    const getResultTool = pi.tools.get("get_subagent_result");
    const text = [
      "Agent: 4dbf8abb-2c0b-4f0",
      "Type: Explore | Status: completed | Tool uses: 8 | Duration: 27.6s",
      "Description: Find permission extension",
      "",
      "Here are the file paths and key symbols found regarding the Pi permission system extension.",
    ].join("\n");

    const rendered = getResultTool.renderResult(
      { content: [{ type: "text", text }] },
      { expanded: false, isPartial: false },
      {},
      {},
    ).render(1000).join("\n");

    expect(rendered).toBe([
      "Agent: 4dbf8abb-2c0b-4f0",
      "Type: Explore | Status: completed | Tool uses: 8 | Duration: 27.6s",
      "Description: Find permission extension",
    ].join("\n"));
  });

  it("keeps full output when expanded", () => {
    const pi = makePi();
    subagentsExtension(pi as any);

    const getResultTool = pi.tools.get("get_subagent_result");
    const text = "Agent: id\nDescription: desc\n\nFull result body";

    const rendered = getResultTool.renderResult(
      { content: [{ type: "text", text }] },
      { expanded: true, isPartial: false },
      {},
      {},
    ).render(1000).join("\n");

    expect(rendered).toContain("Full result body");
  });
});
