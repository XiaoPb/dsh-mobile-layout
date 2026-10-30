# dsh-mobile-layout

> English docs ｜ [中文版](README.md)

[![CI](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/ci.yml/badge.svg)](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/ci.yml)
[![Release](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/release.yml/badge.svg)](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/@xiaopb/dsh-mobile-layout?label=npm)](https://www.npmjs.com/package/@xiaopb/dsh-mobile-layout)

**DSH mobile portrait layout plugin (v0.1.9)**

Docs: [Architecture](docs/architecture.md) ｜ [Technical notes](docs/technical-notes.md) ｜ [中文版](README.md)

A Cordis plugin that turns the DSH web client into a one-handed, touch-first layout on **phone portrait** screens — **without modifying the official kernel or replacing the official layout plugin**. It only adapts the phone-portrait form; landscape, tablet and desktop keep the official layout pixel-for-pixel.

---

## Features

- **Sidebar → Drawer**: hamburger, or swipe right from anywhere in the left ~40% of the screen (QQ-style, mid-left start — full-screen gesture phones reserve the hard edge for system back); tap-mask or left-swipe to close; auto-collapses only on real navigation (blank taps, search, account menu, etc. stay open).
- **Sidebar key in the title bar**: global panels (plugins / settings / automation / SSH) without a session header get a borderless Sidebar-icon key flush against the left of the page title (visually embedded in the title row; falls back to shifting the title only when the title sits too far left). Hidden while the page is scrolled down, back on scroll-to-top.
- **Bottom action bar**: new / chat / file / image / plugins / more, pinned right above the composer.
- **Add panel**: **reveal / cover transition** against the soft keyboard (content-adaptive height; the keyboard slides over to cover the panel and slides away to reveal it, with the input row position preserved via viewport-jump compensation — no animation crossing); a 4×2 icon grid with horizontal paging beyond 8 items; icons are **color-coded by function** (12 soft tints across blue / orange / violet / green — same type keeps the same color, no clashes on screen, new items auto-assigned by alias hash).
- **Sessions / plugins sheets**: grouped by workspace with sticky headers and relative timestamps, capped at 64% of screen height; **drag the grabber down to dismiss**, styled after the engine's v1.4.57 official sheet (28px corners, raised surface, large title, pill primary action).
- **Composer merged into the bottom panel**: flat, full-width, single 1px divider; tightened empty state; permission & model short-name chips stay on the input row (**"Full access" is always red**, in both Chinese and English).
- **Fullscreen settings**: brand row + swipeable tabs + back button; swipe left/right on the content area to switch tabs.
- **Restyled pickers**: model / permission sub-menus become bottom-sheet lists with the theme-blue selected state.
- **Exclusive overlays + history stack**: drawer / bottom sheet / add panel never stack; closed layer-by-layer. The add panel is also mutually exclusive with the soft keyboard in both directions (opening it first drops composer focus; tapping the input while the panel is open closes the panel first, and the keyboard rises only after the panel is gone).
- **Accessibility & motion**: `aria-modal`, focus in/out, honors system "reduce motion".

## Why it's good

| | |
|---|---|
| **Zero intrusion** | All styles are scoped under `data-dshm-mode="mobile"`; uninstall or anchor failure restores the official layout. |
| **Single-file build** | `lib/client.js` is the shipped artifact — no build step, no runtime dependencies. |
| **Conservative by form** | Detects three hosts (Android shell / desktop Electron / browser); the desktop DeepSeek Harness app **never activates** the mobile layout at any window size, and other non-phone forms keep the official layout pixel-for-pixel. |
| **Touch-first** | 44px touch targets, swipe gestures, one-handed reach. |
| **Stable theming** | Hash-based tint assignment — new feature icons are colored automatically, no code change. |
| **Verified on device** | MuMu emulator (720×1280) and a Redmi K70 real device; 69 CI unit tests all green. |

---

## How it works

![How dsh-mobile-layout works](docs/assets/diagram-overview.svg)

## Screenshots

> Real device screenshots of v0.1.6 on the MuMu emulator (physical 720×1280, CSS viewport 400×711).

| Empty session (hero centered) | Conversation (divider back to composer) |
|---|---|
| <img src="docs/assets/screens/empty-session.png" width="260"> | <img src="docs/assets/screens/conversation.png" width="260"> |

| Drawer | Add panel (two pages) |
|---|---|
| <img src="docs/assets/screens/drawer.png" width="260"> | <img src="docs/assets/screens/sheet-add.png" width="260"> |

| Settings · account | Settings · general |
|---|---|
| <img src="docs/assets/screens/settings-account.png" width="260"> | <img src="docs/assets/screens/settings-general.png" width="260"> |

| Sessions (grouped) | Permission picker (full access in red) |
|---|---|
| <img src="docs/assets/screens/sessions-sheet.png" width="260"> | <img src="docs/assets/screens/popover-permission.png" width="260"> |

| Global panel · plugins | Workspace / mode menus pop upward |
|---|---|
| <img src="docs/assets/screens/panel-plugins.png" width="260"> | <img src="docs/assets/screens/menu-workspace-up.png" width="260"> |

---

## Install

```sh
dsh plugin --profile web add @xiaopb/dsh-mobile-layout
```

## Develop / Release

No runtime or dev dependencies; the client is a single-file artifact (no build), `lib/client.js` is what ships.

```sh
npm run check     # node --check → unit tests → package / bundle contract self-check
npm test          # unit tests only (69)
npm run pack:dry  # preview the files that will be published
```

Pushing a `v*` tag triggers Release (npm Trusted Publishing with `NPM_TOKEN` fallback, then polls until the version is public). Device acceptance needs a device and is done manually per section 6 of `docs/technical-notes.md`.

## License

MIT
