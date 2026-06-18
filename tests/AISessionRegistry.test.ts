import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AISessionRegistry,
  getAISessionRegistry,
} from "../src/core/AISessionRegistry";
import type { StreamEvent } from "../src/adapters/claudeCodeStream";

// Mock the heavy adapters used by start() so the test stays hermetic.
vi.mock("../src/adapters/claudeCodeStream", () => {
  let pendingResolves: Array<(v: any) => void> = [];
  const captured: any[] = [];
  return {
    runClaudeStream: vi.fn((opts: any) => {
      captured.push(opts);
      let resolveDone: (v: any) => void = () => {};
      const done = new Promise<{ ok: boolean; finalText: string; code: number | null }>(
        (resolve) => {
          resolveDone = resolve;
          pendingResolves.push(resolve);
        }
      );
      return {
        cancel: vi.fn(() => {
          resolveDone({ ok: false, finalText: "", code: null });
        }),
        done,
        // Test helpers
        _fire: (e: any) => opts.onEvent(e),
        _finish: (code: number | null) =>
          resolveDone({ ok: code === 0, finalText: "", code }),
      };
    }),
    // re-export type-only symbols as plain objects (only the runtime shape matters)
  };
});

vi.mock("../src/adapters/aiLogWriter", () => {
  return {
    AILogWriter: {
      create: vi.fn(async (_app: any, basename: string) => ({
        path: `ログ/AI移譲/test_${basename}.md`,
        init: vi.fn(async () => undefined),
        logEvent: vi.fn(async () => undefined),
        finalize: vi.fn(async () => undefined),
      })),
    },
  };
});

function makeApp() {
  return {
    vault: {
      adapter: {
        getBasePath: () => "/tmp/vault",
      },
      getAbstractFileByPath: () => null,
    },
    fileManager: {
      processFrontMatter: vi.fn(async () => undefined),
    },
  } as any;
}

function makeTaskFile(path = "tasks/Test.md") {
  return {
    path,
    basename: path.split("/").pop()!.replace(/\.md$/, ""),
    extension: "md",
  } as any;
}

describe("AISessionRegistry", () => {
  let reg: AISessionRegistry;
  beforeEach(() => {
    reg = new AISessionRegistry();
  });

  it("has() returns false on empty registry", () => {
    expect(reg.has("foo")).toBe(false);
    expect(reg.get("foo")).toBeUndefined();
    expect(reg.listRunning()).toEqual([]);
  });

  it("onChange listeners fire when entries change", async () => {
    const calls: number[] = [];
    const unsub = reg.onChange(() => calls.push(Date.now()));
    const app = makeApp();
    const file = makeTaskFile();

    const entry = await reg.start({
      app,
      taskFile: file,
      vaultRoot: "/tmp/vault",
      permissionMode: "acceptEdits",
      prompt: "do thing",
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(reg.has(file.path)).toBe(true);
    expect(reg.listRunning()).toHaveLength(1);
    expect(entry.status).toBe("running");

    unsub();
  });

  it("buffers events and lets new subscribers replay via entry.events", async () => {
    const app = makeApp();
    const file = makeTaskFile();
    const entry = await reg.start({
      app,
      taskFile: file,
      vaultRoot: "/tmp/vault",
      permissionMode: "acceptEdits",
      prompt: "p",
    });

    // Fire two events through the underlying session adapter
    const session: any = entry.session;
    const ev1: StreamEvent = { kind: "system", text: "boot" };
    const ev2: StreamEvent = { kind: "tool_use", text: "Read foo" };
    session._fire(ev1);
    session._fire(ev2);

    expect(entry.events).toEqual([ev1, ev2]);
    expect(entry.toolCount).toBe(1);
  });

  it("subscribers receive live events", async () => {
    const app = makeApp();
    const file = makeTaskFile();
    const entry = await reg.start({
      app,
      taskFile: file,
      vaultRoot: "/tmp/vault",
      permissionMode: "acceptEdits",
      prompt: "p",
    });

    const seen: any[] = [];
    reg.subscribe(file.path, (n) => seen.push(n));

    const session: any = entry.session;
    session._fire({ kind: "text", text: "hello" } as StreamEvent);

    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe("event");
    expect(seen[0].event.kind).toBe("text");
  });

  it("emits status change on finalize and calls onFinalize hook", async () => {
    const app = makeApp();
    const file = makeTaskFile();
    const onFinalize = vi.fn();
    const entry = await reg.start({
      app,
      taskFile: file,
      vaultRoot: "/tmp/vault",
      permissionMode: "acceptEdits",
      prompt: "p",
      onFinalize,
    });

    const seenStatus: any[] = [];
    reg.subscribe(file.path, (n) => {
      if (n.type === "status") seenStatus.push(n);
    });

    const session: any = entry.session;
    session._finish(0);
    // Wait for the promise chain to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(entry.status).toBe("completed");
    expect(seenStatus).toHaveLength(1);
    expect(seenStatus[0].status).toBe("completed");
    expect(onFinalize).toHaveBeenCalledTimes(1);
  });

  it("cancelled session marked as cancelled", async () => {
    const app = makeApp();
    const file = makeTaskFile();
    const entry = await reg.start({
      app,
      taskFile: file,
      vaultRoot: "/tmp/vault",
      permissionMode: "acceptEdits",
      prompt: "p",
    });

    expect(reg.abort(file.path)).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(entry.status).toBe("cancelled");
  });

  it("rejects start() while a session is already running", async () => {
    const app = makeApp();
    const file = makeTaskFile();
    await reg.start({
      app,
      taskFile: file,
      vaultRoot: "/tmp/vault",
      permissionMode: "acceptEdits",
      prompt: "p",
    });
    await expect(
      reg.start({
        app,
        taskFile: file,
        vaultRoot: "/tmp/vault",
        permissionMode: "acceptEdits",
        prompt: "p",
      })
    ).rejects.toThrow(/既に実行中/);
  });

  it("remove() drops finished entries and notifies listeners", async () => {
    const app = makeApp();
    const file = makeTaskFile();
    const entry = await reg.start({
      app,
      taskFile: file,
      vaultRoot: "/tmp/vault",
      permissionMode: "acceptEdits",
      prompt: "p",
    });
    const session: any = entry.session;
    session._finish(0);
    await new Promise((r) => setTimeout(r, 0));

    let listenerFired = 0;
    reg.onChange(() => listenerFired++);
    expect(reg.remove(file.path)).toBe(true);
    expect(reg.get(file.path)).toBeUndefined();
    expect(listenerFired).toBeGreaterThan(0);
  });

  it("remove() refuses to drop a running entry", async () => {
    const app = makeApp();
    const file = makeTaskFile();
    await reg.start({
      app,
      taskFile: file,
      vaultRoot: "/tmp/vault",
      permissionMode: "acceptEdits",
      prompt: "p",
    });
    expect(reg.remove(file.path)).toBe(false);
    expect(reg.has(file.path)).toBe(true);
  });

  it("getAISessionRegistry() returns the same singleton instance", () => {
    expect(getAISessionRegistry()).toBe(getAISessionRegistry());
  });
});
