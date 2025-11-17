# Hotkey Router

Command shortcuts for AI chat sites that refuse to ship them.

## What it does
- Works on ChatGPT, Grok, Claude, Perplexity, and T3 chat (more get caught by the fallback heuristics)
- One shortcut map, all sites. Command key is implicit.
- Global actions: new chat, sidebar toggle, chat search, voice, copy last reply, copy entire thread.
- Options panel lets you remap using `map <action> <combo>` text (Vimium style). Type `shift+letter` if you need Shift, otherwise just the letter.

## Default combos
| Action | Combo |
| --- | --- |
| New chat | `cmd+shift+O` |
| Sidebar toggle | `cmd+shift+S` |
| Chat search | `cmd+shift+P` |
| Voice mode | `cmd+shift+K` |
| Copy last response | `cmd+shift+C` |
| Copy conversation | `cmd+shift+E` |

## Install (Chrome)
1. `git clone https://github.com/<you>/hotkey_extension` (or drop the folder anywhere)
2. Visit `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → pick this folder
5. Hit **Options** to tweak mappings if you want.

## Notes
- Shortcuts piggyback on Command (⌘). `map newChat u` means `cmd+u`.
- Chrome blocks the usual suspects (Cmd+N/T/W/Q/H/M/L), so the parser will yell.
- Copy actions fall back to text selection hacks when the site refuses to expose a copy button.
- `src/content-script.js` holds the site heuristics, `src/options/` is the mini editor UI.


