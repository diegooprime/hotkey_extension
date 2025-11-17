const ACTION_METADATA = Object.freeze({
  newChat: {
    title: "New chat",
    description: "Start a blank conversation thread."
  },
  toggleSidebar: {
    title: "Toggle sidebar",
    description: "Show or hide the navigation/sidebar panel."
  },
  chatSearch: {
    title: "Chat search",
    description: "Focus the conversation search UI."
  },
  voiceMode: {
    title: "Voice mode",
    description: "Toggle voice input/listening when available."
  },
  copyLastResponse: {
    title: "Copy last response",
    description: "Copy the latest AI reply to your clipboard."
  },
  copyConversation: {
    title: "Copy conversation",
    description: "Copy the visible conversation transcript."
  }
});

const DEFAULT_SHORTCUTS = Object.freeze({
  newChat: { key: "o", shift: true },
  toggleSidebar: { key: "s", shift: true },
  chatSearch: { key: "p", shift: true },
  voiceMode: { key: "k", shift: true },
  copyLastResponse: { key: "c", shift: true },
  copyConversation: { key: "e", shift: true }
});

// Only block combos that Chrome intercepts before a page can see the keydown.
const BLOCKED_SHORTCUTS = Object.freeze({
  unshifted: {
    n: "Command+N opens a new window before the page can react.",
    t: "Command+T opens a new tab before the page can react.",
    w: "Command+W closes the tab before the page can react.",
    q: "Command+Q quits the browser before the page can react.",
    h: "Command+H hides the browser before the page can react.",
    m: "Command+M minimizes the window before the page can react.",
    l: "Command+L focuses the address bar before the page can react."
  },
  shifted: {
    n: "Command+Shift+N opens an Incognito window before the page can react.",
    t: "Command+Shift+T reopens the last tab before the page can react.",
    w: "Command+Shift+W reopens a closed window before the page can react."
  }
});

const STORAGE_KEY = "aiHotkeyShortcuts";

const AI_HOTKEY_CONSTANTS = Object.freeze({
  ACTION_METADATA,
  DEFAULT_SHORTCUTS,
  BLOCKED_SHORTCUTS,
  STORAGE_KEY
});

const scope =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof self !== "undefined"
    ? self
    : typeof window !== "undefined"
    ? window
    : {};

scope.AI_HOTKEY_CONSTANTS = AI_HOTKEY_CONSTANTS;
