/* global chrome, AI_HOTKEY_CONSTANTS */

(function () {
  if (!window.AI_HOTKEY_CONSTANTS) {
    console.warn("AI Hotkey Router: shared constants missing.");
    return;
  }

  const {
    ACTION_METADATA,
    DEFAULT_SHORTCUTS,
    STORAGE_KEY,
    BLOCKED_SHORTCUTS = {}
  } =
    window.AI_HOTKEY_CONSTANTS;
  const ACTION_IDS = Object.keys(ACTION_METADATA);

  const blockedNoShift = new Map(
    Object.entries(BLOCKED_SHORTCUTS.unshifted || {})
  );
  const blockedShift = new Map(
    Object.entries(BLOCKED_SHORTCUTS.shifted || {})
  );

  const getBlockedReason = (key, shift) => {
    if (!key) return null;
    const map = shift ? blockedShift : blockedNoShift;
    return map.get(key) || null;
  };

  const isShortcutBlocked = (key, shift) =>
    Boolean(getBlockedReason(key, shift));

  let shortcutMap = { ...DEFAULT_SHORTCUTS };
  let activeSiteProfile = null;
  let lastUrl = location.href;

  const storage = chrome?.storage?.sync;

  /**
   * Utility helpers
   */
  const clickElement = (element) => {
    if (!element) return false;
    const clickFn = element.click;
    if (typeof clickFn === "function") {
      try {
        clickFn.call(element);
        return true;
      } catch (err) {
        console.warn("AI Hotkey Router: native click failed, falling back.", err);
      }
    }
    try {
      element.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
      return true;
    } catch (err) {
      console.warn("AI Hotkey Router: synthetic click failed.", err);
    }
    return false;
  };

  const focusElement = (element) => {
    if (!element) return false;
    element.focus();
    return true;
  };

  const isVisible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const selectorAttempt = (selectors, options = {}) => {
    return () => {
      const list = Array.isArray(selectors) ? selectors : [selectors];
      for (const entry of list) {
        const candidate =
          typeof entry === "function" ? entry() : document.querySelector(entry);
        if (!candidate || !isVisible(candidate)) continue;

        if (options.focus) {
          if (focusElement(candidate)) return true;
        } else if (options.action) {
          options.action(candidate);
          return true;
        } else if (clickElement(candidate)) {
          return true;
        }
      }
      return false;
    };
  };

  const clickLastMatching = (selectors) => {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    return () => {
      for (const selector of list) {
        const elements = document.querySelectorAll(selector);
        for (let i = elements.length - 1; i >= 0; i -= 1) {
          const element = elements[i];
          if (isVisible(element) && clickElement(element)) {
            return true;
          }
        }
      }
      return false;
    };
  };

  const textAttempt = (
    texts,
    baseSelector = "button, [role='button'], a[role='button'], a[href]"
  ) => {
    const lowerTexts = texts.map((t) => t.toLowerCase());
    return () => {
      const candidates = document.querySelectorAll(baseSelector);
      for (const element of candidates) {
        const textContent = (element.textContent || "").trim().toLowerCase();
        if (!textContent) continue;
        if (lowerTexts.some((text) => textContent.includes(text))) {
          if (isVisible(element) && clickElement(element)) {
            return true;
          }
        }
      }
      return false;
    };
  };

  const inputAttempt = (selectors) =>
    selectorAttempt(selectors, { focus: true });

  const srElementAttempt = (selector, label) => {
    const needle = label.toLowerCase();
    return () => {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const srOnly = element.querySelector(".sr-only");
        if (!srOnly) continue;
        const text = (srOnly.textContent || "").trim().toLowerCase();
        if (text === needle && isVisible(element) && clickElement(element)) {
          return true;
        }
      }
      return false;
    };
  };

  const srButtonAttempt = (label) => srElementAttempt("button", label);
  const srLinkAttempt = (label) => srElementAttempt("a", label);

  const fallbackCopyText = (text) => {
    if (!text || !document?.body) return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (err) {
      success = false;
      console.warn("AI Hotkey Router: execCommand copy failed.", err);
    }
    document.body.removeChild(textarea);
    return success;
  };

  const copyText = (text) => {
    if (!text) return false;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch((err) => {
        console.warn("AI Hotkey Router: clipboard API failed, falling back.", err);
        fallbackCopyText(text);
      });
      return true;
    }
    return fallbackCopyText(text);
  };

  const MESSAGE_NODE_SELECTORS = [
    "[data-message-author-role]",
    "[data-author-role]",
    "[data-role='message']",
    "[data-message-id]",
    "[data-testid='message']",
    "[data-testid='conversation-turn']",
    "[data-testid='chat-message']",
    "[data-testid='message-wrapper']",
    "article[data-testid]",
    "article[data-role]",
    "[data-qa='chat-message']",
    ".chat-message",
    ".message",
    ".prose"
  ];

  const getMessageNodes = () => {
    const seen = new Set();
    const nodes = [];
    for (const selector of MESSAGE_NODE_SELECTORS) {
      const matches = document.querySelectorAll(selector);
      for (const node of matches) {
        if (seen.has(node)) continue;
        const text = (node.innerText || "").trim();
        if (!text || text.length < 2) continue;
        nodes.push(node);
        seen.add(node);
      }
    }
    return nodes;
  };

  const isAssistantNode = (node) => {
    const roleAttrKeys = [
      "data-message-author-role",
      "data-author-role",
      "data-role",
      "data-sender",
      "data-user",
      "data-name"
    ];
    for (const key of roleAttrKeys) {
      const value = node.getAttribute(key);
      if (value && /assistant|bot|ai|model|claude|perplexity|grok|response/i.test(value)) {
        return true;
      }
    }
    const dataRole = node.dataset?.role;
    if (dataRole && /assistant|bot|ai|model/.test(dataRole)) {
      return true;
    }
    const className = node.className || "";
    if (
      typeof className === "string" &&
      /assistant|ai-response|bot-message|model-response/.test(
        className.toLowerCase()
      )
    ) {
      return true;
    }
    return false;
  };

  const copyLastAssistantResponseText = () => {
    const nodes = getMessageNodes();
    if (!nodes.length) return false;
    const assistantNodes = nodes.filter((node) => isAssistantNode(node));
    const candidates = assistantNodes.length ? assistantNodes : nodes;
    const last = candidates[candidates.length - 1];
    if (!last) return false;
    const text = (last.innerText || "").trim();
    if (!text) return false;
    return copyText(text);
  };

  const copyConversationTranscript = () => {
    const nodes = getMessageNodes();
    const segments = nodes
      .map((node) => {
        const rawRole =
          node.getAttribute("data-message-author-role") ||
          node.getAttribute("data-author-role") ||
          node.getAttribute("data-role") ||
          node.dataset?.role ||
          node.dataset?.author ||
          "";
        const text = (node.innerText || "").trim();
        if (!text) return null;
        const prettyRole = rawRole
          ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1)
          : "Message";
        return `${prettyRole}:\n${text}`;
      })
      .filter(Boolean);
    if (!segments.length) return false;
    return copyText(segments.join("\n\n"));
  };

  /**
   * Site-specific selectors arranged per action.
   */
  const SITE_PROFILES = [
    {
      name: "chatgpt",
      matches: () => {
        const host = location.hostname;
        return (
          host === "chat.openai.com" ||
          host.endsWith(".chat.openai.com") ||
          host === "chatgpt.com" ||
          host.endsWith(".chatgpt.com")
        );
      },
      actions: {
        newChat: [
          selectorAttempt([
            "button[data-testid='new-chat-button']",
            "button[data-testid='new-conversation-button']",
            "button[data-testid='left-panel-new-chat-button']",
            "a[data-testid='create-new-chat-button']",
            "nav button[aria-label*='new chat' i]",
            "button[aria-label='New chat']",
            "button[aria-label='New conversation']"
          ])
        ],
        toggleSidebar: [
          selectorAttempt([
            "button[aria-label*='close sidebar' i]",
            "button[aria-label='Close sidebar']",
            "button[data-testid='close-sidebar-button']",
            "button[aria-label*='hide sidebar' i]",
            "button[aria-label='Hide sidebar']",
            "button[data-testid='sidebar-toggle']",
            "button[aria-label*='toggle sidebar' i]",
            "button[aria-label*='show sidebar' i]",
            "button[aria-label='Show sidebar']",
            "button[data-testid='left-panel-toggle-button']"
          ])
        ],
        chatSearch: [
          inputAttempt([
            "input[data-testid='search-input']",
            "input[type='search']",
            "input[placeholder*='Search chats' i]"
          ]),
          selectorAttempt([
            "button[data-testid='search-button']",
            "button[aria-label*='search conversations' i]",
            "button[aria-label='Search chats']",
            "button[aria-label='Search']",
            "button[data-testid='search-panel-trigger']",
            "button[data-testid='search-panel-button']"
          ]),
          () => {
            const candidates = document.querySelectorAll(
              "div.__menu-item, div[role='menuitem'], div[tabindex]"
            );
            for (const element of candidates) {
              const text = (element.textContent || "").trim().toLowerCase();
              if (!text) continue;
              if (!text.includes("search chats")) continue;
              if (!isVisible(element)) continue;
              if (clickElement(element)) {
                return true;
              }
            }
            return false;
          },
          srButtonAttempt("Search")
        ],
        voiceMode: [
          selectorAttempt([
            "button[data-testid='voice-mode-button']",
            "button[aria-label*='voice mode' i]",
            "button[aria-label*='start dictation' i]",
            "button[data-testid='composer-speech-button']",
            "button[aria-label='Start voice mode']"
          ])
        ],
        copyLastResponse: [
          clickLastMatching("button[data-testid='copy-turn-action-button']"),
          () => copyLastAssistantResponseText()
        ],
        copyConversation: [
          selectorAttempt([
            "button[data-testid='copy-chat-history-button']",
            "button[aria-label*='copy conversation' i]"
          ]),
          () => copyConversationTranscript()
        ]
      }
    },
    {
      name: "claude",
      matches: () => location.hostname.endsWith("claude.ai"),
      actions: {
        newChat: [
          selectorAttempt([
            "button[data-testid='new-chat-button']",
            "a[href='/new']",
            "button[aria-label*='new chat' i]",
            "a[aria-label='New chat']"
          ]),
          textAttempt(["new chat", "start new chat"])
        ],
        toggleSidebar: [
          selectorAttempt([
            "button[aria-label*='toggle sidebar' i]",
            "button[aria-label*='show sidebar' i]",
            "button[aria-label*='hide sidebar' i]",
            "button[data-testid='pin-sidebar-toggle']",
            "button[aria-label='Sidebar']"
          ])
        ],
        chatSearch: [
          inputAttempt([
            "input[type='search']",
            "input[placeholder*='Search' i]"
          ]),
          selectorAttempt([
            "a[aria-label='Chats']",
            "a[href='/recents']"
          ]),
          textAttempt(["Chats", "Search"], "a[href], button, [role='button']")
        ],
        voiceMode: [], // Claude lacks voice controls, fallback will no-op.
        copyLastResponse: [
          clickLastMatching([
            "button[aria-label='Copy response to clipboard']",
            "button[aria-label*='copy response' i]",
            "button[aria-label='Copy']"
          ]),
          () => copyLastAssistantResponseText()
        ],
        copyConversation: [() => copyConversationTranscript()]
      }
    },
    {
      name: "perplexity",
      matches: () =>
        location.hostname === "perplexity.ai" ||
        location.hostname.endsWith(".perplexity.ai"),
      actions: {
        newChat: [
          selectorAttempt([
            "button[data-testid='new-thread-button']",
            "button[data-testid='sidebar-new-thread']",
            "button[aria-label*='new chat' i]",
            "button[aria-label*='new thread' i]"
          ]),
          textAttempt(["new thread", "new chat"])
        ],
        toggleSidebar: [
          selectorAttempt([
            "button[aria-label*='toggle sidebar' i]",
            "button[aria-label*='library' i]"
          ])
        ],
        chatSearch: [
          inputAttempt([
            "input[type='search']",
            "input[placeholder*='Search' i]"
          ])
        ],
        voiceMode: [
          selectorAttempt([
            "button[aria-label*='voice' i]",
            "button[aria-label*='microphone' i]",
            "button[aria-label='Voice mode']"
          ])
        ],
        copyLastResponse: [
          clickLastMatching([
            "button[aria-label='Copy']",
            "button[data-testid='copy-button']"
          ]),
          () => copyLastAssistantResponseText()
        ],
        copyConversation: [() => copyConversationTranscript()]
      }
    },
    {
      name: "grok",
      matches: () =>
        location.hostname.endsWith("grok.com") ||
        location.hostname.endsWith("grok.app"),
      actions: {
        newChat: [
          selectorAttempt([
            "button[aria-label*='new chat' i]",
            "button[aria-label*='compose' i]",
            "button[data-testid='new-chat']",
            "a[aria-label='New chat']",
            "a[href='/'][data-discover]",
            "a[href='/'][data-state]",
            "a[href='/'][class*='rounded-full']"
          ]),
          textAttempt(["new chat"], "a[href], button, [role='button']"),
          srLinkAttempt("New Thread")
        ],
        toggleSidebar: [
          selectorAttempt([
            "button[aria-label*='toggle sidebar' i]",
            "button[data-testid='sidebar-toggle']",
            "button[data-sidebar='trigger']",
            "button[aria-label='Toggle Sidebar']"
          ])
        ],
        chatSearch: [
          inputAttempt([
            "input[type='search']",
            "input[placeholder*='Search' i]"
          ]),
          selectorAttempt([
            "button[data-sidebar='menu-button'][aria-label='Search']",
            "button[aria-label='Search'][data-sidebar='menu-button']"
          ])
        ],
        voiceMode: [
          selectorAttempt([
            "button[aria-label*='voice' i]",
            "button[aria-label*='microphone' i]"
          ])
        ],
        copyLastResponse: [
          clickLastMatching([
            "button[aria-label='Copy']",
            "button[aria-label*='copy response' i]",
            "button[data-state][aria-label*='copy' i]",
            "button[aria-label*='copy' i]"
          ]),
          () => copyLastAssistantResponseText()
        ],
        copyConversation: [() => copyConversationTranscript()]
      }
    },
    {
      name: "t3",
      matches: () =>
        location.hostname === "t3.gg" || location.hostname.endsWith(".t3.gg"),
      actions: {
        newChat: [
          selectorAttempt([
            "button[aria-label*='new chat' i]",
            "button[data-testid='new-thread']",
            "a[data-discover='true'][href='/']"
          ]),
          textAttempt(["new thread", "new chat"]),
          srLinkAttempt("New Thread")
        ],
        toggleSidebar: [
          selectorAttempt([
            "button[aria-label*='sidebar' i]",
            "button[data-sidebar='trigger']"
          ]),
          srButtonAttempt("Toggle Sidebar")
        ],
        chatSearch: [
          inputAttempt([
            "input[type='search']",
            "input[placeholder*='Search' i]"
          ]),
          srButtonAttempt("Search")
        ],
        voiceMode: [],
        copyLastResponse: [
          clickLastMatching([
            "button[aria-label='Copy response to clipboard']",
            "button[aria-label='Copy']"
          ]),
          () => copyLastAssistantResponseText()
        ],
        copyConversation: [() => copyConversationTranscript()]
      }
    }
  ];

  /**
   * Global fallback heuristics if no site profile/selector matched.
   */
  const GLOBAL_ACTIONS = {
    newChat: [
      textAttempt(["new chat", "new thread", "start new"]),
      selectorAttempt(["button[aria-label*='new chat' i]"])
    ],
    toggleSidebar: [
      selectorAttempt([
        "button[aria-label*='sidebar' i]",
        "button[aria-label*='navigation' i]"
      ])
    ],
    chatSearch: [
      inputAttempt([
        "input[type='search']",
        "input[placeholder*='search' i]"
      ])
    ],
    voiceMode: [
      selectorAttempt([
        "button[aria-label*='voice' i]",
        "button[aria-label*='microphone' i]"
      ])
    ],
    copyLastResponse: [
      clickLastMatching([
        "button[data-testid='copy-turn-action-button']",
        "button[aria-label='Copy response']",
        "button[aria-label*='copy response' i]"
      ]),
      () => copyLastAssistantResponseText()
    ],
    copyConversation: [
      selectorAttempt([
        "button[data-testid='copy-chat-history-button']",
        "button[aria-label*='copy conversation' i]"
      ]),
      () => copyConversationTranscript()
    ]
  };

  const refreshSiteProfile = () => {
    activeSiteProfile =
      SITE_PROFILES.find((site) => {
        try {
          return Boolean(site.matches());
        } catch (err) {
          console.warn("AI Hotkey Router: site matcher failed", err);
          return false;
        }
      }) || null;
  };

  const monitorUrlChanges = () => {
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        refreshSiteProfile();
      }
    });

    observer.observe(document, {
      subtree: true,
      childList: true
    });

    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        refreshSiteProfile();
      }
    }, 1500);
  };

  const isLetter = (value) => /^[a-z]$/i.test(value);

  const normalizeKey = (value) =>
    typeof value === "string" && isLetter(value) ? value.toLowerCase() : null;

  const normalizeShortcut = (shortcut) => {
    if (!shortcut || !shortcut.key) return null;
    const key = normalizeKey(shortcut.key);
    if (!key) return null;
    const shift = Boolean(shortcut.shift);
    if (isShortcutBlocked(key, shift)) return null;
    return {
      key,
      shift
    };
  };

  const setShortcutMap = (raw) => {
    const resolved = {};
    for (const id of ACTION_IDS) {
      const candidate = raw?.[id];
      const normalizedCandidate = normalizeShortcut(candidate);
      if (normalizedCandidate) {
        resolved[id] = normalizedCandidate;
      } else {
        const normalizedKey = normalizeKey(candidate?.key);
        const reason = getBlockedReason(
          normalizedKey,
          Boolean(candidate?.shift)
        );
        if (reason) {
          console.warn(
            `AI Hotkey Router: Ignoring ${id} shortcut because ${reason}`
          );
        }
        resolved[id] = { ...DEFAULT_SHORTCUTS[id] };
      }
    }
    shortcutMap = resolved;
  };

  const loadShortcutsFromStorage = () => {
    if (!storage) {
      setShortcutMap(null);
      return;
    }
    storage.get(STORAGE_KEY, (stored) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "AI Hotkey Router: failed to read shortcuts",
          chrome.runtime.lastError
        );
        setShortcutMap(null);
        return;
      }

      setShortcutMap(stored?.[STORAGE_KEY] || null);
    });
  };

  const watchStorageChanges = () => {
    if (!chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== "sync") return;
      if (changes[STORAGE_KEY]) {
        setShortcutMap(changes[STORAGE_KEY].newValue || null);
      }
    });
  };

  const getActionFromEvent = (event) => {
    if (!event.metaKey || event.ctrlKey || event.altKey) return null;
    if (!event.key) return null;

    const normalizedKey = normalizeKey(event.key);
    if (!normalizedKey) return null;

    const isShiftPressed = Boolean(event.shiftKey);

    for (const [actionId, shortcut] of Object.entries(shortcutMap)) {
      if (!shortcut) continue;
      if (
        shortcut.key === normalizedKey &&
        Boolean(shortcut.shift) === isShiftPressed
      ) {
        return actionId;
      }
    }
    return null;
  };

  const shouldIgnoreTarget = (target) => {
    if (!target) return false;
    if (target.isContentEditable) return false; // we still want to intercept.
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    if (!tag) return false;
    if (tag === "input" || tag === "textarea") {
      return target.readOnly && !target.dataset?.forceHotkeys;
    }
    return false;
  };

  const performAction = (actionId) => {
    if (!actionId) return false;

    const attempts = [];
    if (activeSiteProfile?.actions?.[actionId]) {
      attempts.push(...activeSiteProfile.actions[actionId]);
    }
    if (GLOBAL_ACTIONS[actionId]) {
      attempts.push(...GLOBAL_ACTIONS[actionId]);
    }

    for (const attempt of attempts) {
      try {
        if (typeof attempt === "function" && attempt()) {
          console.debug(`AI Hotkey Router: ran "${actionId}" handler.`);
          return true;
        }
      } catch (err) {
        console.warn(
          `AI Hotkey Router: handler for "${actionId}" failed.`,
          err
        );
      }
    }

    console.debug(`AI Hotkey Router: no handler matched for "${actionId}".`);
    return false;
  };

  const handleKeydown = (event) => {
    if (shouldIgnoreTarget(event.target)) return;
    if (event.repeat) return;

    const actionId = getActionFromEvent(event);
    if (!actionId) return;

    event.preventDefault();
    event.stopPropagation();
    performAction(actionId);
  };

  const init = () => {
    refreshSiteProfile();
    monitorUrlChanges();
    loadShortcutsFromStorage();
    watchStorageChanges();
    window.addEventListener("keydown", handleKeydown, true);
  };

  init();
})();
