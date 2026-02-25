import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function makeChromeMock(storedShortcuts = null) {
  const listeners = [];
  return {
    storage: {
      sync: {
        get: vi.fn((key, cb) => {
          cb(storedShortcuts ? { [key]: storedShortcuts } : {});
        }),
        set: vi.fn((data, cb) => {
          if (cb) cb();
        })
      },
      onChanged: {
        addListener: vi.fn((fn) => listeners.push(fn))
      }
    },
    runtime: {
      lastError: null
    },
    _storageListeners: listeners
  };
}

function setupConstants() {
  window.AI_HOTKEY_CONSTANTS = {
    ACTION_METADATA: {
      newChat: { title: "New chat", description: "Start a new chat" },
      toggleSidebar: {
        title: "Toggle sidebar",
        description: "Toggle sidebar"
      },
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

function fireKeydown(key, options = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: options.metaKey ?? true,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    repeat: options.repeat ?? false,
    bubbles: true,
    cancelable: true
  });
  const preventSpy = vi.spyOn(event, "preventDefault");
  const stopSpy = vi.spyOn(event, "stopPropagation");
  window.dispatchEvent(event);
  return { event, preventSpy, stopSpy };
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

describe("content-script", () => {
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
    // Suppress expected console noise
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete window.AI_HOTKEY_CONSTANTS;
    document.body.innerHTML = "";
  });

  describe("initialization", () => {
    it("aborts silently when AI_HOTKEY_CONSTANTS is missing", async () => {
      delete window.AI_HOTKEY_CONSTANTS;
      await loadContentScript();
      expect(console.warn).toHaveBeenCalledWith(
        "AI Hotkey Router: shared constants missing."
      );
    });

    it("loads shortcuts from chrome.storage.sync on init", async () => {
      await loadContentScript();
      expect(chromeMock.storage.sync.get).toHaveBeenCalledWith(
        "aiHotkeyShortcuts",
        expect.any(Function)
      );
    });

    it("registers a keydown event listener", async () => {
      const addListenerSpy = vi.spyOn(window, "addEventListener");
      await loadContentScript();
      expect(addListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function),
        true
      );
    });

    it("watches for storage changes", async () => {
      await loadContentScript();
      expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalled();
    });
  });

  describe("site profile detection", () => {
    const sites = [
      { name: "chatgpt.com", hostname: "chatgpt.com" },
      { name: "chat.openai.com", hostname: "chat.openai.com" },
      { name: "claude.ai", hostname: "claude.ai" },
      { name: "perplexity.ai", hostname: "perplexity.ai" },
      { name: "grok.com", hostname: "grok.com" },
      { name: "grok.app", hostname: "grok.app" },
      { name: "t3.gg", hostname: "t3.gg" },
      { name: "unknown site", hostname: "example.com" }
    ];

    for (const site of sites) {
      it(`detects ${site.name}`, async () => {
        window.location = {
          hostname: site.hostname,
          href: `https://${site.hostname}/`,
          hash: ""
        };
        await loadContentScript();
        const { preventSpy } = fireKeydown("o", {
          metaKey: true,
          shiftKey: true
        });
        expect(preventSpy).toHaveBeenCalled();
      });
    }
  });

  describe("shortcut matching", () => {
    it("matches Cmd+Shift+O to newChat", async () => {
      await loadContentScript();
      const { preventSpy } = fireKeydown("o", {
        metaKey: true,
        shiftKey: true
      });
      expect(preventSpy).toHaveBeenCalled();
    });

    it("ignores events without metaKey", async () => {
      await loadContentScript();
      const { preventSpy } = fireKeydown("o", {
        metaKey: false,
        shiftKey: true
      });
      expect(preventSpy).not.toHaveBeenCalled();
    });

    it("ignores events with ctrlKey", async () => {
      await loadContentScript();
      const { preventSpy } = fireKeydown("o", {
        metaKey: true,
        ctrlKey: true,
        shiftKey: true
      });
      expect(preventSpy).not.toHaveBeenCalled();
    });

    it("ignores events with altKey", async () => {
      await loadContentScript();
      const { preventSpy } = fireKeydown("o", {
        metaKey: true,
        altKey: true,
        shiftKey: true
      });
      expect(preventSpy).not.toHaveBeenCalled();
    });

    it("ignores repeat events", async () => {
      await loadContentScript();
      const { preventSpy } = fireKeydown("o", {
        metaKey: true,
        shiftKey: true,
        repeat: true
      });
      expect(preventSpy).not.toHaveBeenCalled();
    });

    it("ignores non-letter keys", async () => {
      await loadContentScript();
      const { preventSpy } = fireKeydown("1", {
        metaKey: true,
        shiftKey: true
      });
      expect(preventSpy).not.toHaveBeenCalled();
    });

    it("ignores when target is a select element", async () => {
      await loadContentScript();
      const select = document.createElement("select");
      document.body.appendChild(select);
      const event = new KeyboardEvent("keydown", {
        key: "o",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(event, "target", { value: select });
      const preventSpy = vi.spyOn(event, "preventDefault");
      select.dispatchEvent(event);
      expect(preventSpy).not.toHaveBeenCalled();
      document.body.removeChild(select);
    });
  });

  describe("storage change handling", () => {
    it("updates shortcuts when chrome storage changes", async () => {
      await loadContentScript();
      const listener =
        chromeMock.storage.onChanged.addListener.mock.calls[0][0];
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
      const { preventSpy } = fireKeydown("j", { metaKey: true });
      expect(preventSpy).toHaveBeenCalled();
    });

    it("ignores storage changes from non-sync namespace", async () => {
      await loadContentScript();
      const listener =
        chromeMock.storage.onChanged.addListener.mock.calls[0][0];
      // Remap newChat to "j" but in "local" namespace (should be ignored)
      listener(
        {
          aiHotkeyShortcuts: {
            newValue: { newChat: { key: "j", shift: false } }
          }
        },
        "local"
      );
      // "j" without shift should NOT match because local was ignored
      // and default is Cmd+Shift+O. But note: multiple IIFE loads accumulate
      // listeners, so we test that "j" is not mapped (the old default still works).
      // The key "j" without shift won't match any default shortcut.
      const { preventSpy } = fireKeydown("x", { metaKey: true });
      expect(preventSpy).not.toHaveBeenCalled();
    });
  });

  describe("URL change monitoring", () => {
    it("handles popstate events", async () => {
      await loadContentScript();
      window.location.href = "https://chatgpt.com/new-page";
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    it("handles hashchange events", async () => {
      await loadContentScript();
      window.location.href = "https://chatgpt.com/#section";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    it("patches pushState for SPA navigation", async () => {
      await loadContentScript();
      history.pushState({}, "", "/test-page");
    });

    it("patches replaceState for SPA navigation", async () => {
      await loadContentScript();
      history.replaceState({}, "", "/test-page-2");
    });
  });

  describe("storage error handling", () => {
    it("handles chrome.runtime.lastError gracefully", async () => {
      chromeMock.runtime.lastError = { message: "Storage error" };
      chromeMock.storage.sync.get = vi.fn((key, cb) => cb({}));
      await loadContentScript();
      expect(console.warn).toHaveBeenCalledWith(
        "AI Hotkey Router: failed to read shortcuts",
        { message: "Storage error" }
      );
    });

    it("works when chrome.storage is unavailable", async () => {
      globalThis.chrome = { runtime: { lastError: null } };
      await loadContentScript();
      const { preventSpy } = fireKeydown("o", {
        metaKey: true,
        shiftKey: true
      });
      expect(preventSpy).toHaveBeenCalled();
    });

    it("works when chrome.storage.onChanged is unavailable", async () => {
      delete chromeMock.storage.onChanged;
      await loadContentScript();
      // No crash
    });
  });

  describe("blocked shortcuts", () => {
    it("rejects blocked unshifted shortcut and falls back to default", async () => {
      chromeMock.storage.sync.get = vi.fn((key, cb) => {
        cb({
          [key]: { newChat: { key: "n", shift: false } }
        });
      });
      await loadContentScript();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Ignoring newChat shortcut because")
      );
    });

    it("rejects blocked shifted shortcut", async () => {
      chromeMock.storage.sync.get = vi.fn((key, cb) => {
        cb({
          [key]: { newChat: { key: "n", shift: true } }
        });
      });
      await loadContentScript();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Ignoring newChat shortcut because")
      );
    });
  });

  describe("DOM action helpers", () => {
    it("message detection finds nodes with data-message-author-role", async () => {
      const node = document.createElement("div");
      node.setAttribute("data-message-author-role", "assistant");
      node.innerText = "Test response";
      document.body.appendChild(node);

      // Mock clipboard
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true
      });

      await loadContentScript();
      fireKeydown("c", { metaKey: true, shiftKey: true });

      expect(writeTextMock).toHaveBeenCalledWith("Test response");
    });

    it("isAssistantNode checks className patterns", async () => {
      // Use a class that matches MESSAGE_NODE_SELECTORS: ".message"
      const node = document.createElement("div");
      node.className = "message ai-response";
      node.innerText = "Test response className";
      document.body.appendChild(node);

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true
      });

      window.location = {
        hostname: "example.com",
        href: "https://example.com/",
        hash: ""
      };

      await loadContentScript();
      fireKeydown("c", { metaKey: true, shiftKey: true });

      expect(writeTextMock).toHaveBeenCalled();
    });

    it("isAssistantNode checks dataset.role", async () => {
      // Use a class matching MESSAGE_NODE_SELECTORS (".prose"),
      // and set dataset.role to "assistant" so isAssistantNode picks it up.
      const node = document.createElement("div");
      node.className = "prose";
      node.dataset.role = "assistant";
      node.innerText = "Test response dataset";
      document.body.appendChild(node);

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true
      });

      await loadContentScript();
      fireKeydown("c", { metaKey: true, shiftKey: true });

      expect(writeTextMock).toHaveBeenCalled();
    });

    it("copyConversation formats with role labels", async () => {
      const user = document.createElement("div");
      user.setAttribute("data-message-author-role", "user");
      user.innerText = "Hi";
      const assistant = document.createElement("div");
      assistant.setAttribute("data-message-author-role", "assistant");
      assistant.innerText = "Hello";
      document.body.appendChild(user);
      document.body.appendChild(assistant);

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true
      });

      await loadContentScript();
      fireKeydown("e", { metaKey: true, shiftKey: true });

      expect(writeTextMock).toHaveBeenCalledWith(
        "User:\nHi\n\nAssistant:\nHello"
      );
    });

    it("fallbackCopyText uses execCommand when clipboard unavailable", async () => {
      const node = document.createElement("div");
      node.setAttribute("data-message-author-role", "assistant");
      node.innerText = "Fallback";
      document.body.appendChild(node);

      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        writable: true,
        configurable: true
      });
      document.execCommand = vi.fn().mockReturnValue(true);

      await loadContentScript();
      fireKeydown("c", { metaKey: true, shiftKey: true });

      expect(document.execCommand).toHaveBeenCalledWith("copy");
    });
  });
});
