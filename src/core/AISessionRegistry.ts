import { App, TFile } from "obsidian";
import {
  runClaudeStream,
  ClaudeStreamSession,
  StreamEvent,
} from "../adapters/claudeCodeStream";
import { AILogWriter } from "../adapters/aiLogWriter";

export type SessionStatus = "running" | "completed" | "error" | "cancelled";

export interface SessionFinal {
  ok: boolean;
  durationMs: number;
  code: number | null;
  toolCount: number;
  cancelled: boolean;
}

export interface RegistryNotification {
  type: "event" | "status" | "removed";
  event?: StreamEvent;
  status?: SessionStatus;
  final?: SessionFinal;
}

export type SessionSubscriber = (n: RegistryNotification) => void;
export type RegistryListener = () => void;

export interface SessionEntry {
  id: string; // taskFile.path
  taskPath: string;
  taskBasename: string;
  taskFile: TFile;
  startedAt: number;
  permissionMode: "acceptEdits" | "bypassPermissions";
  prompt: string;
  status: SessionStatus;
  toolCount: number;
  writer: AILogWriter;
  session: ClaudeStreamSession;
  events: StreamEvent[];
  final?: SessionFinal;
}

interface InternalEntry extends SessionEntry {
  subscribers: Set<SessionSubscriber>;
}

const EVENT_BUFFER_CAP = 500;

export interface StartOptions {
  app: App;
  taskFile: TFile;
  vaultRoot: string;
  permissionMode: "acceptEdits" | "bypassPermissions";
  prompt: string;
  claudeCmd?: string;
  /** Called once the session is finalized (after writer.finalize). */
  onFinalize?: (entry: SessionEntry, final: SessionFinal) => void | Promise<void>;
}

/**
 * Tracks live AI delegation sessions across the plugin so the modal can be
 * closed and reattached, and other UI (status bar, list modal) can see them.
 */
export class AISessionRegistry {
  private entries: Map<string, InternalEntry> = new Map();
  private listeners: Set<RegistryListener> = new Set();

  /** True if a running session already exists for the given taskPath. */
  has(taskPath: string): boolean {
    const e = this.entries.get(taskPath);
    return !!e && e.status === "running";
  }

  get(taskPath: string): SessionEntry | undefined {
    return this.entries.get(taskPath);
  }

  /** Snapshot of all known entries (running + recently finished). */
  list(): SessionEntry[] {
    return [...this.entries.values()];
  }

  /** Snapshot of running entries only. */
  listRunning(): SessionEntry[] {
    return this.list().filter((e) => e.status === "running");
  }

  /** Subscribe to registry-level changes (add/remove/status). */
  onChange(fn: RegistryListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Subscribe to per-session events. Returns unsubscribe. */
  subscribe(taskPath: string, fn: SessionSubscriber): () => void {
    const e = this.entries.get(taskPath);
    if (!e) return () => {};
    e.subscribers.add(fn);
    return () => e.subscribers.delete(fn);
  }

  /** Cancel a running session. */
  abort(taskPath: string): boolean {
    const e = this.entries.get(taskPath);
    if (!e || e.status !== "running") return false;
    e.session.cancel();
    return true;
  }

  /** Drop a finished entry from the registry. */
  remove(taskPath: string): boolean {
    const e = this.entries.get(taskPath);
    if (!e) return false;
    if (e.status === "running") return false;
    this.entries.delete(taskPath);
    for (const fn of e.subscribers) {
      try {
        fn({ type: "removed" });
      } catch {
        /* ignore subscriber errors */
      }
    }
    this.notifyListeners();
    return true;
  }

  /**
   * Start a new session. Throws if a running session already exists for the
   * same taskPath — callers should `has()` first and attach instead.
   */
  async start(opts: StartOptions): Promise<SessionEntry> {
    const id = opts.taskFile.path;
    const existing = this.entries.get(id);
    if (existing && existing.status === "running") {
      throw new Error(`AIセッションは既に実行中: ${id}`);
    }
    if (existing) {
      // Clear out stale finalized entry before starting a fresh run.
      this.entries.delete(id);
    }

    const writer = await AILogWriter.create(opts.app, opts.taskFile.basename);
    await writer.init({
      taskPath: opts.taskFile.path,
      permissionMode: opts.permissionMode,
      prompt: opts.prompt,
    });

    const entry: InternalEntry = {
      id,
      taskPath: opts.taskFile.path,
      taskBasename: opts.taskFile.basename,
      taskFile: opts.taskFile,
      startedAt: Date.now(),
      permissionMode: opts.permissionMode,
      prompt: opts.prompt,
      status: "running",
      toolCount: 0,
      writer,
      events: [],
      subscribers: new Set(),
      // session is assigned below; placeholder to satisfy type
      session: undefined as unknown as ClaudeStreamSession,
    };

    const onEvent = (e: StreamEvent): void => {
      if (e.kind === "tool_use") entry.toolCount++;
      // Buffer (drop oldest if at cap)
      entry.events.push(e);
      if (entry.events.length > EVENT_BUFFER_CAP) entry.events.shift();
      // Persist to log file (best-effort)
      void entry.writer.logEvent(e);
      // Fan out to subscribers
      for (const fn of entry.subscribers) {
        try {
          fn({ type: "event", event: e });
        } catch {
          /* ignore subscriber errors */
        }
      }
    };

    const session = runClaudeStream({
      prompt: opts.prompt,
      cwd: opts.vaultRoot,
      claudeCmd: opts.claudeCmd ?? "claude",
      permissionMode: opts.permissionMode,
      onEvent,
    });
    entry.session = session;
    this.entries.set(id, entry);
    this.notifyListeners();

    // Detach finalization to its own microtask chain so start() returns
    // immediately with the live entry.
    void session.done.then(async (res) => {
      const final: SessionFinal = {
        ok: res.ok,
        durationMs: Date.now() - entry.startedAt,
        code: res.code,
        toolCount: entry.toolCount,
        cancelled: res.code === null && !res.ok,
      };
      entry.final = final;
      entry.status = final.cancelled
        ? "cancelled"
        : final.ok
          ? "completed"
          : "error";
      try {
        await entry.writer.finalize({
          ok: final.ok,
          cancelled: final.cancelled,
          durationMs: final.durationMs,
          toolCount: final.toolCount,
        });
      } catch {
        /* writer best-effort */
      }
      // Notify subscribers of status change before any external hook fires.
      for (const fn of entry.subscribers) {
        try {
          fn({ type: "status", status: entry.status, final });
        } catch {
          /* ignore subscriber errors */
        }
      }
      this.notifyListeners();
      if (opts.onFinalize) {
        try {
          await opts.onFinalize(entry, final);
        } catch {
          /* swallow — the hook is informational */
        }
      }
    });

    return entry;
  }

  private notifyListeners(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* ignore listener errors */
      }
    }
  }
}

let _singleton: AISessionRegistry | null = null;

export function getAISessionRegistry(): AISessionRegistry {
  if (!_singleton) _singleton = new AISessionRegistry();
  return _singleton;
}
