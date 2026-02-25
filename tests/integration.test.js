import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Integration tests: test the full routing pipeline with mock inputs.
 * Simulate user configuring shortcuts -> pressing keys -> actions executing.
 */

function makeChromeMock(stored = null) {
  const storageListeners = [];
  return {
    storage: {
      sync: {
        get: vi.fn((key, cb) => {
          cb(stored ? { [key]: stored } : {});
        }),
        set: vi.fn((data, cb) => {
          if (cb) cb();
        })
      },
      onChanged: {
        addListener: vi.fn((fn) => storageListeners.push(fn))
      }
    },
    runtime: {
      lastError: null
    },
    _storageListeners: storageListeners
  };
}

function setupConstants() {
  window.AI_HOTKEY_CONSTANTS = {
    ACTION_METADATA: {
      newChat: { title: "New chat", description: "Start a new chat" },
      toggleSidebar: { title: "Toggle sidebar", description: "Toggle" },
      chatSearch: { title: "Chat search", description: "Search" },
      voiceMode: { title: "Voice mode", description: "Voice" },
      copyLastResponse: { title: "Copy last", description: "Copy" },
      copyConversation: { title: "Copy convo", description: "Copy all" }
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
        n: "blocked",
        t: "blocked",
        w: "blocked",
        q: "blocked",
        h: "blocked",
        m: "blocked",
        l: "blocked"
      },
      shifted: { n: "blocked", t: "blocked", w: "blocked" }
    },
    STORAGE_KEY: "aiHotkeyShortcuts"
  };
}

async function loadContentScript() {
  const fs = await import("fs");
  const path = await import("path");
  const code = fs.readFileSync(
    path.resolve(import.meta.dirname, "../src/content-script.js"),
    "utf-8"
  );
  new Function(code)();
}

function fireKeydown(key, options = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: options.metaKey ?? true,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    repeat: false,
    bubbles: true,
    cancelable: true
  });
  const preventSpy = vi.spyOn(event, "preventDefault");
  const stopSpy = vi.spyOn(event, "stopPropagation");
  window.dispatchEvent(event);
  return { event, preventSpy, stopSpy };
}

describe("integration: routing pipeline", () => {
  let chromeMock;

  beforeEach(() => {
    vi.restoreAllMocks();
    setupConstants();
    chromeMock = makeChromeMock();
    globalThis.chrome = chromeMock;
    Object.defineProperty(window, "location", {
      value: {
        hostname: "chatgpt.com",
        href: "https://chatgpt.com/",
        hash: ""
      },
      writable: true,
      configurable: true
    });
    // Suppress console noise from expected code paths
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete window.AI_HOTKEY_CONSTANTS;
    document.body.innerHTML = "";
  });

  it("full flow: init -> detect site -> match shortcut -> preventDefault", async () => {
    await loadContentScript();

    const { preventSpy, stopSpy } = fireKeydown("o", {
      metaKey: true,
      shiftKey: true
    });
    expect(preventSpy).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
  });

  it("full flow: custom shortcuts from storage are applied", async () => {
    chromeMock = makeChromeMock({
      newChat: { key: "j", shift: false },
      toggleSidebar: { key: "s", shift: true },
      chatSearch: { key: "p", shift: true },
      voiceMode: { key: "k", shift: true },
      copyLastResponse: { key: "c", shift: true },
      copyConversation: { key: "e", shift: true }
    });
    globalThis.chrome = chromeMock;

    await loadContentScript();

    // New custom shortcut Cmd+J SHOULD fire
    const { preventSpy: newPrevented } = fireKeydown("j", { metaKey: true });
    expect(newPrevented).toHaveBeenCalled();

    // Cmd+X (unmapped) should NOT fire
    const { preventSpy: unmapped } = fireKeydown("x", { metaKey: true });
    expect(unmapped).not.toHaveBeenCalled();
  });

  it("full flow: dynamic shortcut update via storage change", async () => {
    await loadContentScript();

    // Initially Cmd+Shift+O is newChat
    let result = fireKeydown("o", { metaKey: true, shiftKey: true });
    expect(result.preventSpy).toHaveBeenCalled();

    // Simulate storage update: remap newChat to Cmd+J
    const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0];
    listener(
      {
        aiHotkeyShortcuts: {
          newValue: {
            newChat: { key: "j", shift: false },
            toggleSidebar: { key: "s", shift: true },
            chatSearch: { key: "p", shift: true },
            voiceMode: { key: "k", shift: true },
            copyLastResponse: { key: "c", shift: true },
            copyConversation: { key: "e", shift: true }
          }
        }
      },
      "sync"
    );

    // New shortcut should match after dynamic update
    result = fireKeydown("j", { metaKey: true });
    expect(result.preventSpy).toHaveBeenCalled();

    // Unmapped key should not match
    result = fireKeydown("x", { metaKey: true });
    expect(result.preventSpy).not.toHaveBeenCalled();
  });

  it("full flow: all six default shortcuts are independently routable", async () => {
    await loadContentScript();

    const shortcuts = [
      { key: "o", shift: true },
      { key: "s", shift: true },
      { key: "p", shift: true },
      { key: "k", shift: true },
      { key: "c", shift: true },
      { key: "e", shift: true }
    ];

    for (const s of shortcuts) {
      const { preventSpy } = fireKeydown(s.key, {
        metaKey: true,
        shiftKey: s.shift
      });
      expect(preventSpy).toHaveBeenCalled();
    }
  });

  it("full flow: blocked shortcut falls back to default", async () => {
    chromeMock = makeChromeMock({
      newChat: { key: "n", shift: false } // blocked
    });
    globalThis.chrome = chromeMock;

    await loadContentScript();

    // Cmd+N should NOT fire (blocked, falls to default which is Cmd+Shift+O)
    const { preventSpy: blockedResult } = fireKeydown("n", { metaKey: true });
    expect(blockedResult).not.toHaveBeenCalled();

    // Default Cmd+Shift+O should still work
    const { preventSpy: defaultResult } = fireKeydown("o", {
      metaKey: true,
      shiftKey: true
    });
    expect(defaultResult).toHaveBeenCalled();
  });

  it("full flow: site profile switches on navigation", async () => {
    await loadContentScript();

    let { preventSpy } = fireKeydown("o", {
      metaKey: true,
      shiftKey: true
    });
    expect(preventSpy).toHaveBeenCalled();

    // Navigate to Claude
    window.location = {
      hostname: "claude.ai",
      href: "https://claude.ai/",
      hash: ""
    };
    window.dispatchEvent(new PopStateEvent("popstate"));

    ({ preventSpy } = fireKeydown("o", { metaKey: true, shiftKey: true }));
    expect(preventSpy).toHaveBeenCalled();
  });

  it("full flow: copy response finds last assistant message", async () => {
    const userMsg = document.createElement("div");
    userMsg.setAttribute("data-message-author-role", "user");
    userMsg.innerText = "What is the meaning of life?";

    const assistantMsg = document.createElement("div");
    assistantMsg.setAttribute("data-message-author-role", "assistant");
    assistantMsg.innerText = "42, according to Douglas Adams.";

    document.body.appendChild(userMsg);
    document.body.appendChild(assistantMsg);

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true
    });

    await loadContentScript();
    fireKeydown("c", { metaKey: true, shiftKey: true });

    expect(writeTextMock).toHaveBeenCalledWith(
      "42, according to Douglas Adams."
    );
  });

  it("full flow: copy conversation includes all messages", async () => {
    const userMsg = document.createElement("div");
    userMsg.setAttribute("data-message-author-role", "user");
    userMsg.innerText = "Hello";

    const assistantMsg = document.createElement("div");
    assistantMsg.setAttribute("data-message-author-role", "assistant");
    assistantMsg.innerText = "Hi there";

    document.body.appendChild(userMsg);
    document.body.appendChild(assistantMsg);

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true
    });

    await loadContentScript();
    fireKeydown("e", { metaKey: true, shiftKey: true });

    expect(writeTextMock).toHaveBeenCalledWith(
      "User:\nHello\n\nAssistant:\nHi there"
    );
  });

  it("copy falls back to execCommand when clipboard API unavailable", async () => {
    const assistantMsg = document.createElement("div");
    assistantMsg.setAttribute("data-message-author-role", "assistant");
    assistantMsg.innerText = "Fallback test";
    document.body.appendChild(assistantMsg);

    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true
    });

    // jsdom may not have execCommand, mock it
    document.execCommand = vi.fn().mockReturnValue(true);

    await loadContentScript();
    fireKeydown("c", { metaKey: true, shiftKey: true });

    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });
});
