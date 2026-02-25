# Security Audit — llm-router

**Date**: 2026-02-24
**Auditor**: Engineer Agent (automated)
**Scope**: manifest.json, src/shared/constants.js, src/content-script.js, src/options/options.js, src/options/options.html

---

## 1. Manifest Permissions

**Status: PASS**

- Uses only `"storage"` permission — minimal and appropriate.
- Manifest V3 (most restrictive CSP by default).
- `content_scripts` are scoped to specific hostnames only (no `<all_urls>`).
- No `"activeTab"`, `"tabs"`, `"scripting"`, `"webRequest"`, or host permissions beyond content script matches.
- No background service worker (no persistent process).

## 2. XSS in DOM Manipulation

**Status: PASS**

- `options.js:renderActionList()` builds DOM via `document.createElement` + `.textContent` assignment. Never uses `innerHTML` or template literals injected into HTML. Safe.
- `content-script.js:fallbackCopyText()` creates a `<textarea>` with `.value` assignment (not innerHTML). Safe.
- No use of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `document.write` anywhere.
- All text content inserted via `.textContent` or `.value` (auto-escaped by the browser).

## 3. Unsafe eval() Usage

**Status: PASS**

- No `eval()`, `new Function()`, `setTimeout(string)`, or `setInterval(string)` in source code.
- Manifest V3's default CSP blocks `eval()` and inline scripts anyway.

## 4. API Key Exposure

**Status: PASS**

- No API keys, tokens, secrets, or credentials in source code.
- No network requests made (no `fetch`, `XMLHttpRequest`, `WebSocket`).
- Extension is purely client-side DOM manipulation + chrome.storage.

## 5. CSP Compliance

**Status: PASS**

- Manifest V3 enforces strict CSP automatically.
- `options.html` loads scripts via `<script src>` tags (no inline scripts).
- No inline event handlers in HTML.
- No external CDN scripts loaded.
- CSS is local (no external stylesheets).

## 6. Additional Findings

### 6a. History API Patching (LOW RISK)
`content-script.js` patches `history.pushState` and `history.replaceState` to detect SPA navigation. This is a common pattern but could theoretically conflict with other extensions or the host page's own patching. No security risk, but worth noting.

### 6b. execCommand Deprecation (INFO)
`fallbackCopyText()` uses `document.execCommand("copy")` as a clipboard fallback. This API is deprecated but still functional. The primary path uses the Clipboard API correctly.

### 6c. Broad CSS Selectors in Content Script (INFO)
The content script queries generic selectors like `.message`, `.prose`, `button`, etc. These match elements on any page. No security risk since the extension only reads text content and clicks buttons — it doesn't inject or modify page content.

---

## Verdict

**No security vulnerabilities found.** The extension follows best practices:
- Minimal permissions
- No innerHTML/XSS vectors
- No eval
- No API keys or network calls
- Manifest V3 CSP compliance
- Clean DOM manipulation via safe APIs
