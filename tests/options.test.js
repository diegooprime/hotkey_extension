import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";

function makeChromeMock(storedValue = null) {
  return {
    storage: {
      sync: {
        get: vi.fn((key, cb) => {
          cb(storedValue ? { [key]: storedValue } : {});
        }),
        set: vi.fn((data, cb) => {
          if (cb) cb();
        })
      },
      local: null
    },
    runtime: {
      lastError: null
    }
  };
}

function setupOptionsDOM() {
  document.body.innerHTML = `
    <main class="container">
      <textarea id="config-editor" rows="14"></textarea>
      <section id="status" class="status" role="status"></section>
      <button id="reset-shortcuts" type="button">Reset</button>
      <ul id="action-list" class="action-list"></ul>
    </main>
  `;
}

function setupConstants() {
  window.AI_HOTKEY_CONSTANTS = {
    ACTION_METADATA: {
      newChat: { title: "New chat", description: "Start a new chat" },
      toggleSidebar: { title: "Toggle sidebar", description: "Toggle sidebar" },
      chatSearch: { title: "Chat search", description: "Search chats" },
      voiceMode: { title: "Voice mode", description: "Voice mode" },
      copyLastResponse: {
        title: "Copy last response",
        description: "Copy response"
      },
      copyConversation: {
        title: "Copy conversation",
        description: "Copy conversation"
      }
    },
    DEFAULT_SHORTCUTS: {
      newChat: { key: "o", shift: true },
      toggleSidebar: { key: "s", shift: true },
      chatSearch: { key: "p", shift: true },
      voiceMode: { key: "k", shift: true },
      copyLastResponse: { key: "c", shift: true },
      copyConversation: { key: "e", shift: true }
    },
    BLOCKED_SHORTCUTS: {
      unshifted: {
        n: "Cmd+N opens new window",
        t: "Cmd+T opens new tab",
        w: "Cmd+W closes tab",
        q: "Cmd+Q quits browser",
        h: "Cmd+H hides browser",
        m: "Cmd+M minimizes window",
        l: "Cmd+L focuses address bar"
      },
      shifted: {
        n: "Cmd+Shift+N opens incognito",
        t: "Cmd+Shift+T reopens tab",
        w: "Cmd+Shift+W reopens window"
      }
    },
    STORAGE_KEY: "aiHotkeyShortcuts"
  };
}

async function loadOptionsScript() {
  const fs = await import("fs");
  const path = await import("path");
  const code = fs.readFileSync(
    path.resolve(import.meta.dirname, "../src/options/options.js"),
    "utf-8"
  );
  const fn = new Function(code);
  fn();
}

describe("options page", () => {
  let chromeMock;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    setupConstants();
    setupOptionsDOM();
    chromeMock = makeChromeMock();
    globalThis.chrome = chromeMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.chrome;
    delete window.AI_HOTKEY_CONSTANTS;
    document.body.innerHTML = "";
  });

  describe("initialization", () => {
    it("populates the editor with default shortcuts on load", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      expect(editor.value).toContain("map newChat shift+o");
      expect(editor.value).toContain("map toggleSidebar shift+s");
    });

    it("renders action list items", async () => {
      await loadOptionsScript();
      const items = document.querySelectorAll("#action-list li");
      expect(items.length).toBe(6);
    });

    it("each action list item has a code element with action id", async () => {
      await loadOptionsScript();
      const codes = document.querySelectorAll("#action-list li code");
      const ids = Array.from(codes).map((c) => c.textContent);
      expect(ids).toContain("newChat");
      expect(ids).toContain("copyConversation");
    });

    it("loads saved shortcuts from storage", async () => {
      const savedShortcuts = {
        newChat: { key: "j", shift: false },
        toggleSidebar: { key: "s", shift: true },
        chatSearch: { key: "p", shift: true },
        voiceMode: { key: "k", shift: true },
        copyLastResponse: { key: "c", shift: true },
        copyConversation: { key: "e", shift: true }
      };
      chromeMock = makeChromeMock(savedShortcuts);
      globalThis.chrome = chromeMock;

      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      expect(editor.value).toContain("map newChat j");
    });
  });

  describe("config parsing", () => {
    it("parses valid map commands", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat shift+j";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400); // past debounce
      vi.advanceTimersByTime(300); // past save debounce
      expect(chromeMock.storage.sync.set).toHaveBeenCalled();
    });

    it("shows error for unknown command", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "bind newChat shift+j";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      const status = document.getElementById("status");
      expect(status.textContent).toContain('Unknown command "bind"');
    });

    it("shows error for unknown action", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map unknownAction shift+j";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      const status = document.getElementById("status");
      expect(status.textContent).toContain('Unknown action "unknownAction"');
    });

    it("shows error for missing action id", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      const status = document.getElementById("status");
      expect(status.textContent).toContain("Missing action id");
    });

    it("shows error for missing combo", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      const status = document.getElementById("status");
      expect(status.textContent).toContain("Missing combo");
    });

    it("shows error for invalid combo", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat 123";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      const status = document.getElementById("status");
      expect(status.textContent).toContain("Invalid combo");
    });

    it("shows error for blocked shortcut", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat n";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      const status = document.getElementById("status");
      expect(status.textContent).toContain("Cmd+N opens new window");
    });

    it("ignores comment lines starting with #", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "# This is a comment\nmap newChat shift+j";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      vi.advanceTimersByTime(300);
      expect(chromeMock.storage.sync.set).toHaveBeenCalled();
    });

    it("handles inline comments after commands", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat shift+j # my custom shortcut";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      vi.advanceTimersByTime(300);
      expect(chromeMock.storage.sync.set).toHaveBeenCalled();
    });

    it("skips empty lines", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "\n\nmap newChat shift+j\n\n";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      vi.advanceTimersByTime(300);
      expect(chromeMock.storage.sync.set).toHaveBeenCalled();
    });

    it("parses combos with cmd prefix (ignored)", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat cmd+shift+j";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      vi.advanceTimersByTime(300);
      expect(chromeMock.storage.sync.set).toHaveBeenCalled();
    });
  });

  describe("reset button", () => {
    it("resets editor to default shortcuts", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat shift+j";
      const resetBtn = document.getElementById("reset-shortcuts");
      resetBtn.click();
      expect(editor.value).toContain("map newChat shift+o");
    });
  });

  describe("status display", () => {
    it("shows Saving status during save", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat shift+j";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      const status = document.getElementById("status");
      expect(status.textContent).toBe("Saving\u2026");
    });

    it("shows Saved status after save completes", async () => {
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      editor.value = "map newChat shift+j";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      vi.advanceTimersByTime(300);
      const status = document.getElementById("status");
      expect(status.textContent).toBe("Saved");
    });

    it("shows error if storage save fails", async () => {
      chromeMock.runtime.lastError = { message: "Quota exceeded" };
      chromeMock.storage.sync.set = vi.fn((data, cb) => cb());
      await loadOptionsScript();

      const editor = document.getElementById("config-editor");
      editor.value = "map newChat shift+j";
      editor.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(400);
      vi.advanceTimersByTime(300);

      const status = document.getElementById("status");
      expect(status.textContent).toBe("Quota exceeded");
    });
  });

  describe("edge cases", () => {
    it("handles missing editor element gracefully", async () => {
      document.getElementById("config-editor").remove();
      // Should not throw
      await loadOptionsScript();
    });

    it("handles missing storage gracefully", async () => {
      globalThis.chrome = { runtime: { lastError: null } };
      await loadOptionsScript();
      const status = document.getElementById("status");
      expect(status.textContent).toContain("Browser storage unavailable");
    });

    it("disables editor when storage is unavailable", async () => {
      globalThis.chrome = { runtime: { lastError: null } };
      await loadOptionsScript();
      const editor = document.getElementById("config-editor");
      expect(editor.disabled).toBe(true);
    });

    it("handles storage.get returning lastError", async () => {
      chromeMock.runtime.lastError = { message: "Storage read failed" };
      await loadOptionsScript();
      const status = document.getElementById("status");
      expect(status.textContent).toBe("Storage read failed");
    });
  });
});
