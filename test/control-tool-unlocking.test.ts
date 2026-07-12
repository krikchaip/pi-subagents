import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/agent-runner.js", async () => {
  const actual = await vi.importActual<typeof import("../src/agent-runner.js")>("../src/agent-runner.js");
  return { ...actual, runAgent: vi.fn() };
});

import { AgentManager } from "../src/agent-manager.js";
import { runAgent } from "../src/agent-runner.js";
import subagentsExtension from "../src/index.js";

const controlTools = ["get_subagent_result", "steer_subagent"];
const initialTools = ["read", "get_subagent_result", "other-extension-tool", "steer_subagent"];

function makePi(activeTools = initialTools) {
  const tools = new Map<string, any>();
  const handlers = new Map<string, any>();
  let active = [...activeTools];
  const pi = {
    registerMessageRenderer: vi.fn(),
    registerTool: vi.fn((tool: any) => tools.set(tool.name, tool)),
    registerCommand: vi.fn(),
    on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
    events: { emit: vi.fn(), on: vi.fn(() => vi.fn()) },
    appendEntry: vi.fn(),
    sendMessage: vi.fn(),
    getActiveTools: vi.fn(() => [...active]),
    setActiveTools: vi.fn((names: string[]) => { active = [...names]; }),
  } as any;
  return { pi, tools, handlers, activeTools: () => [...active] };
}

function context() {
  return {
    hasUI: false,
    ui: { setStatus: vi.fn(), setWidget: vi.fn(), notify: vi.fn() },
    cwd: process.cwd(),
    model: undefined,
    modelRegistry: { find: vi.fn(), getAvailable: vi.fn(() => []) },
    sessionManager: { getSessionId: vi.fn(() => "s1"), getBranch: vi.fn(() => []) },
    getSystemPrompt: vi.fn(() => "parent"),
  } as any;
}

const textOf = (result: any): string => result.content[0].text;

async function spawn(tools: Map<string, any>, params: Record<string, unknown>) {
  return tools.get("Agent").execute(
    "tool-call",
    { prompt: "do work", description: "Do work", subagent_type: "general-purpose", ...params },
    undefined,
    undefined,
    context(),
  );
}

describe("runtime control-tool unlocking", () => {
  let tmpDir: string;
  let agentDir: string;
  let previousCwd: string;
  let previousAgentDir: string | undefined;
  let previousHome: string | undefined;
  const shutdowns: Array<() => Promise<void>> = [];

  function register(activeTools = initialTools) {
    const extension = makePi(activeTools);
    subagentsExtension(extension.pi);
    shutdowns.push(async () => {
      await extension.handlers.get("session_shutdown")?.({}, context());
    });
    return extension;
  }

  async function startRuntime(extension: ReturnType<typeof register>): Promise<void> {
    await extension.handlers.get("session_start")?.({}, context());
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-control-tools-"));
    agentDir = mkdtempSync(join(tmpdir(), "pi-control-tools-agentdir-"));
    previousCwd = process.cwd();
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    previousHome = process.env.HOME;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.HOME = agentDir;
    mkdirSync(join(tmpDir, ".pi"), { recursive: true });
    writeFileSync(join(tmpDir, ".pi", "subagents.json"), JSON.stringify({ defaultJoinMode: "async", maxConcurrent: 1 }));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(shutdowns.splice(0).map(shutdown => shutdown()));
    process.chdir(previousCwd);
    if (previousAgentDir == null) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    if (previousHome == null) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("locks controls after runtime initialization, not while the extension loads", async () => {
    const extension = register();

    expect(extension.pi.setActiveTools).not.toHaveBeenCalled();
    await startRuntime(extension);
    expect(extension.pi.setActiveTools).toHaveBeenCalledWith(["read", "other-extension-tool", "Agent"]);
    expect(extension.activeTools()).toEqual(["read", "other-extension-tool", "Agent"]);
  });

  it("unlocks controls exactly once after successful background spawns, including queued records", async () => {
    vi.mocked(runAgent).mockReturnValue(new Promise(() => {}) as any);
    const extension = register();
    await startRuntime(extension);

    extension.pi.setActiveTools(["read", "other-extension-tool", "Agent", "runtime-tool"]);
    extension.pi.setActiveTools.mockClear();
    expect(textOf(await spawn(extension.tools, { run_in_background: true }))).toContain("Agent started in background");
    expect(textOf(await spawn(extension.tools, { run_in_background: true }))).toContain("Agent queued in background");

    expect(extension.pi.setActiveTools).toHaveBeenCalledTimes(1);
    expect(extension.activeTools()).toEqual(["read", "other-extension-tool", "Agent", "runtime-tool", ...controlTools]);
  });

  it("unlocks controls from the foreground spawn callback before session creation", async () => {
    let extension: ReturnType<typeof register>;
    vi.mocked(runAgent).mockImplementation(async (_ctx, _type, _prompt, options) => {
      const session = { dispose: vi.fn(), subscribe: vi.fn(() => vi.fn()) } as any;
      await Promise.resolve();
      options.onSessionCreated?.(session);
      expect(extension!.activeTools()).toContain("get_subagent_result");
      expect(extension!.activeTools()).toContain("steer_subagent");
      return { responseText: "done", session, aborted: false, steered: false } as any;
    });
    extension = register();
    await startRuntime(extension);

    expect(textOf(await spawn(extension.tools, {}))).toContain("Agent completed");
    expect(textOf(await spawn(extension.tools, {}))).toContain("Agent completed");
    expect(extension.pi.setActiveTools).toHaveBeenCalledTimes(2);
  });

  it("keeps controls locked for rejected spawns, schedule registration, and resume", async () => {
    const spawnError = vi.spyOn(AgentManager.prototype, "spawn").mockImplementation(() => {
      throw new Error("spawn rejected");
    });
    const extension = register();
    await startRuntime(extension);

    expect(textOf(await spawn(extension.tools, { run_in_background: true }))).toContain("spawn rejected");
    spawnError.mockRestore();
    expect(textOf(await spawn(extension.tools, { schedule: "+1h" }))).toContain("Scheduled");

    const resumable = {
      id: "resumable",
      type: "general-purpose",
      description: "Do work",
      status: "completed",
      toolUses: 0,
      startedAt: Date.now(),
      completedAt: Date.now(),
      lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
      compactionCount: 0,
      session: {},
      result: "resumed result",
    } as any;
    vi.spyOn(AgentManager.prototype, "getRecord").mockReturnValue(resumable);
    vi.spyOn(AgentManager.prototype, "resume").mockResolvedValue(resumable);
    expect(textOf(await spawn(extension.tools, { resume: "resumable" }))).toContain("resumed result");

    expect(extension.pi.setActiveTools).toHaveBeenCalledTimes(1);
    expect(extension.activeTools()).toEqual(["read", "other-extension-tool", "Agent"]);
  });

  it("unlocks controls when a scheduled job actually spawns an agent", async () => {
    vi.useFakeTimers();
    vi.mocked(runAgent).mockReturnValue(new Promise(() => {}) as any);
    const extension = register();
    await startRuntime(extension);

    expect(textOf(await spawn(extension.tools, { schedule: "+1m" }))).toContain("Scheduled");
    expect(extension.activeTools()).toEqual(["read", "other-extension-tool", "Agent"]);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(extension.pi.setActiveTools).toHaveBeenCalledTimes(2);
    expect(extension.activeTools()).toEqual(["read", "other-extension-tool", "Agent", ...controlTools]);
  });

  it("relocks controls for a session replacement", async () => {
    vi.mocked(runAgent).mockReturnValue(new Promise(() => {}) as any);
    const extension = register();
    await startRuntime(extension);
    await spawn(extension.tools, { run_in_background: true });
    expect(extension.activeTools()).toContain("get_subagent_result");

    await extension.handlers.get("session_before_switch")?.({}, context());
    expect(extension.pi.setActiveTools).toHaveBeenCalledTimes(3);
    expect(extension.activeTools()).toEqual(["read", "other-extension-tool", "Agent"]);
  });

  it("starts a fresh extension runtime locked after another runtime unlocked", async () => {
    vi.mocked(runAgent).mockReturnValue(new Promise(() => {}) as any);
    const first = register();
    await startRuntime(first);
    await spawn(first.tools, { run_in_background: true });
    expect(first.activeTools()).toContain("get_subagent_result");

    const second = register();
    await startRuntime(second);
    expect(second.pi.setActiveTools).toHaveBeenCalledTimes(1);
    expect(second.activeTools()).toEqual(["read", "other-extension-tool", "Agent"]);
  });
});
