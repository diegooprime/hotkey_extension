/* global chrome, AI_HOTKEY_CONSTANTS */

(function () {
  const constants = window.AI_HOTKEY_CONSTANTS || {};
  const ACTION_METADATA = constants.ACTION_METADATA || {};
  const DEFAULT_SHORTCUTS = constants.DEFAULT_SHORTCUTS || {};
  const STORAGE_KEY = constants.STORAGE_KEY || "aiHotkeyShortcuts";
  const BLOCKED_SHORTCUTS = constants.BLOCKED_SHORTCUTS || {};

  const ACTION_IDS = Object.keys(ACTION_METADATA);
  const storage = chrome?.storage?.sync || chrome?.storage?.local;

  const statusEl = document.getElementById("status");
  const editor = document.getElementById("config-editor");
  const actionListEl = document.getElementById("action-list");
  const resetButton = document.getElementById("reset-shortcuts");

  const blockedNoShift = new Map(
    Object.entries(BLOCKED_SHORTCUTS.unshifted || {})
  );
  const blockedShift = new Map(
    Object.entries(BLOCKED_SHORTCUTS.shifted || {})
  );

  const state = {
    shortcuts: {},
    text: ""
  };

  let saveTimeout = null;
  let parseTimeout = null;

  const setStatus = (message, kind) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    if (kind) {
      statusEl.dataset.state = kind;
    } else {
      delete statusEl.dataset.state;
    }
  };

  const isLetter = (value) => /^[a-z]$/i.test(value);

  const normalizeKey = (value) =>
    typeof value === "string" && isLetter(value)
      ? value.trim().toLowerCase()
      : null;

  const getBlockedReason = (key, shift) => {
    if (!key) return "";
    const map = shift ? blockedShift : blockedNoShift;
    return map.get(key) || "";
  };

  const normalizeShortcut = (shortcut) => {
    if (!shortcut || !shortcut.key) return null;
    const key = normalizeKey(shortcut.key);
    if (!key) return null;
    const shift = Boolean(shortcut.shift);
    if (getBlockedReason(key, shift)) return null;
    return { key, shift };
  };

  const mergeShortcuts = (raw) => {
    const merged = {};
    for (const actionId of ACTION_IDS) {
      const candidate = normalizeShortcut(raw?.[actionId]);
      merged[actionId] = candidate
        ? candidate
        : { ...DEFAULT_SHORTCUTS[actionId] };
    }
    return merged;
  };

  const formatShortcut = (shortcut) => {
    if (!shortcut) return "";
    return `${shortcut.shift ? "shift+" : ""}${shortcut.key}`;
  };

  const serializeShortcuts = (shortcutsMap) =>
    ACTION_IDS.map((actionId) => {
      const shortcut = shortcutsMap[actionId] || DEFAULT_SHORTCUTS[actionId];
      return `map ${actionId} ${formatShortcut(shortcut)}`;
    }).join("\n");

  const parseCombo = (comboRaw) => {
    if (!comboRaw) return null;
    const compact = comboRaw.replace(/\s+/g, "");
    if (!compact) return null;
    const segments = compact
      .split("+")
      .map((segment) => segment.trim())
      .filter(Boolean);
    let shift = false;
    let keyPart = null;

    for (const rawPart of segments) {
      const part = rawPart.toLowerCase();
      if (
        part === "cmd" ||
        part === "command" ||
        part === "⌘" ||
        part === "control" ||
        part === "ctrl"
      ) {
        continue;
      }
      if (part === "shift" || part === "⇧") {
        shift = true;
        continue;
      }
      if (!keyPart) {
        keyPart = rawPart;
      } else {
        return null;
      }
    }

    const normalizedKey = normalizeKey(keyPart);
    if (!normalizedKey) return null;

    return { key: normalizedKey, shift };
  };

  const parseConfigText = (text) => {
    const assignments = {};
    const errors = [];

    const lines = text.split(/\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const hashIndex = trimmed.indexOf("#");
      const effective =
        hashIndex === 0
          ? ""
          : hashIndex > -1
          ? trimmed.slice(0, hashIndex).trim()
          : trimmed;
      if (!effective) return;

      const parts = effective.split(/\s+/);
      const command = parts[0].toLowerCase();

      if (command !== "map") {
        errors.push(`Line ${index + 1}: Unknown command "${parts[0]}"`);
        return;
      }

      const actionId = parts[1];
      if (!actionId) {
        errors.push(`Line ${index + 1}: Missing action id`);
        return;
      }
      if (!ACTION_METADATA[actionId]) {
        errors.push(`Line ${index + 1}: Unknown action "${actionId}"`);
        return;
      }

      const comboToken = parts.slice(2).join(" ");
      if (!comboToken) {
        errors.push(`Line ${index + 1}: Missing combo for "${actionId}"`);
        return;
      }

      const parsedCombo = parseCombo(comboToken);
      if (!parsedCombo) {
        errors.push(`Line ${index + 1}: Invalid combo "${comboToken}"`);
        return;
      }

      const reason = getBlockedReason(parsedCombo.key, parsedCombo.shift);
      if (reason) {
        errors.push(`Line ${index + 1}: ${reason}`);
        return;
      }

      assignments[actionId] = parsedCombo;
    });

    return { assignments, errors };
  };

  const persistShortcuts = () => {
    if (!storage) {
      setStatus("Browser storage unavailable.", "error");
      return;
    }
    storage.set({ [STORAGE_KEY]: state.shortcuts }, () => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message, "error");
        return;
      }
      setStatus("Saved", "saved");
      setTimeout(() => setStatus("", ""), 1500);
    });
  };

  const queueSave = () => {
    clearTimeout(saveTimeout);
    setStatus("Saving…", "saving");
    saveTimeout = setTimeout(persistShortcuts, 250);
  };

  const validateAndSave = (text) => {
    const { assignments, errors } = parseConfigText(text);
    if (errors.length) {
      setStatus(errors[0], "error");
      return;
    }
    state.text = text;
    state.shortcuts = mergeShortcuts(assignments);
    queueSave();
  };

  const handleEditorInput = () => {
    const text = editor.value;
    clearTimeout(parseTimeout);
    parseTimeout = setTimeout(() => validateAndSave(text), 350);
  };

  const handleReset = () => {
    const defaultText = serializeShortcuts(DEFAULT_SHORTCUTS);
    editor.value = defaultText;
    validateAndSave(defaultText);
  };

  const renderActionList = () => {
    if (!actionListEl) return;
    actionListEl.innerHTML = "";
    ACTION_IDS.forEach((actionId) => {
      const li = document.createElement("li");
      const meta = ACTION_METADATA[actionId];
      const defaultText = formatShortcut(DEFAULT_SHORTCUTS[actionId]);
      li.innerHTML = `<code>${actionId}</code> — ${meta.description} <span class="default-hint">(default: ${defaultText.toUpperCase()})</span>`;
      actionListEl.appendChild(li);
    });
  };

  const loadShortcuts = () => {
    if (!storage) {
      setStatus("Browser storage unavailable.", "error");
      if (editor) {
        editor.disabled = true;
      }
      return;
    }
    setStatus("Loading…", "saving");
    storage.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message, "error");
        return;
      }
      state.shortcuts = mergeShortcuts(result?.[STORAGE_KEY]);
      state.text = serializeShortcuts(state.shortcuts);
      if (editor) {
        editor.value = state.text;
      }
      setStatus("Loaded", "saved");
      setTimeout(() => setStatus("", ""), 1200);
    });
  };

  const init = () => {
    if (!editor) return;
    renderActionList();
    state.shortcuts = mergeShortcuts(null);
    state.text = serializeShortcuts(state.shortcuts);
    editor.value = state.text;
    loadShortcuts();
    editor.addEventListener("input", handleEditorInput);
    resetButton?.addEventListener("click", handleReset);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
