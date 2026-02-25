import { describe, it, expect, beforeEach } from "vitest";

/**
 * constants.js assigns to globalThis.AI_HOTKEY_CONSTANTS via side effect.
 * Since vitest caches modules, we load it once and test the result.
 */

// Load the constants module (side effect sets globalThis.AI_HOTKEY_CONSTANTS)
async function loadConstants() {
  const fs = await import("fs");
  const path = await import("path");
  const code = fs.readFileSync(
    path.resolve(import.meta.dirname, "../src/shared/constants.js"),
    "utf-8"
  );
  new Function(code)();
  return globalThis.AI_HOTKEY_CONSTANTS;
}

describe("shared/constants", () => {
  let constants;

  beforeEach(async () => {
    delete globalThis.AI_HOTKEY_CONSTANTS;
    constants = await loadConstants();
  });

  it("exposes AI_HOTKEY_CONSTANTS on globalThis after loading", () => {
    expect(globalThis.AI_HOTKEY_CONSTANTS).toBeDefined();
  });

  it("ACTION_METADATA has all six actions", () => {
    const expectedActions = [
      "newChat",
      "toggleSidebar",
      "chatSearch",
      "voiceMode",
      "copyLastResponse",
      "copyConversation"
    ];
    expect(Object.keys(constants.ACTION_METADATA)).toEqual(expectedActions);
  });

  it("each action has title and description strings", () => {
    for (const [id, meta] of Object.entries(constants.ACTION_METADATA)) {
      expect(typeof meta.title).toBe("string");
      expect(meta.title.length).toBeGreaterThan(0);
      expect(typeof meta.description).toBe("string");
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it("DEFAULT_SHORTCUTS has matching keys to ACTION_METADATA", () => {
    expect(Object.keys(constants.DEFAULT_SHORTCUTS).sort()).toEqual(
      Object.keys(constants.ACTION_METADATA).sort()
    );
  });

  it("each default shortcut has a single lowercase letter key and a boolean shift", () => {
    for (const [id, shortcut] of Object.entries(constants.DEFAULT_SHORTCUTS)) {
      expect(shortcut.key).toMatch(/^[a-z]$/);
      expect(typeof shortcut.shift).toBe("boolean");
    }
  });

  it("BLOCKED_SHORTCUTS has unshifted and shifted maps", () => {
    expect(constants.BLOCKED_SHORTCUTS.unshifted).toBeDefined();
    expect(constants.BLOCKED_SHORTCUTS.shifted).toBeDefined();
    expect(typeof constants.BLOCKED_SHORTCUTS.unshifted).toBe("object");
    expect(typeof constants.BLOCKED_SHORTCUTS.shifted).toBe("object");
  });

  it("blocked shortcut reasons are non-empty strings", () => {
    for (const reason of Object.values(constants.BLOCKED_SHORTCUTS.unshifted)) {
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    }
    for (const reason of Object.values(constants.BLOCKED_SHORTCUTS.shifted)) {
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it("STORAGE_KEY is the expected string", () => {
    expect(constants.STORAGE_KEY).toBe("aiHotkeyShortcuts");
  });

  it("ACTION_METADATA is frozen (immutable)", () => {
    expect(Object.isFrozen(constants.ACTION_METADATA)).toBe(true);
  });

  it("DEFAULT_SHORTCUTS is frozen (immutable)", () => {
    expect(Object.isFrozen(constants.DEFAULT_SHORTCUTS)).toBe(true);
  });

  it("no default shortcut collides with a blocked shortcut", () => {
    const blockedUnshifted = new Set(
      Object.keys(constants.BLOCKED_SHORTCUTS.unshifted)
    );
    const blockedShifted = new Set(
      Object.keys(constants.BLOCKED_SHORTCUTS.shifted)
    );

    for (const [id, shortcut] of Object.entries(constants.DEFAULT_SHORTCUTS)) {
      const blocked = shortcut.shift
        ? blockedShifted.has(shortcut.key)
        : blockedUnshifted.has(shortcut.key);
      expect(blocked).toBe(false);
    }
  });
});
