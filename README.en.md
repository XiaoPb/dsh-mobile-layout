# dsh-mobile-layout

> English docs ｜ [中文版](README.md)

[![CI](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/ci.yml/badge.svg)](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/ci.yml)
[![Release](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/release.yml/badge.svg)](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/@xiaopb/dsh-mobile-layout?label=npm)](https://www.npmjs.com/package/@xiaopb/dsh-mobile-layout)

**DSH mobile portrait layout plugin (v0.1.7)**

A Cordis plugin that turns the DSH web client into a one-handed, touch-first layout on **phone portrait** screens — **without modifying the official kernel or replacing the official layout plugin**. It only adapts the phone-portrait form; landscape, tablet and desktop keep the official layout pixel-for-pixel.

---

## Features

- **Sidebar → Drawer**: hamburger / left-edge swipe to open, tap-mask or left-swipe to close; auto-collapses only on real navigation (blank taps, search, account menu, etc. stay open).
- **Floating ☰ in the title bar**: global panels (plugins / settings / automation / SSH) without a session header get a ☰ auto-embedded into the page title row.
- **Bottom action bar**: new / chat / file / image / plugins / more, pinned right above the composer.
- **Add panel**: a 4×2 icon grid with horizontal paging beyond 8 items; icons are **color-coded by function** (12 soft tints across blue / orange / violet / green — same type keeps the same color, no clashes on screen, new items auto-assigned by alias hash).
- **Sessions sheet**: grouped by workspace with sticky headers and relative timestamps, capped at 60% of screen height.
- **Composer merged into the bottom panel**: flat, full-width, single 1px divider; tightened empty state; permission & model short-name chips stay on the input row (**"Full access" is always red**, in both Chinese and English).
- **Fullscreen settings**: brand row + swipeable tabs + back button; swipe left/right on the content area to switch tabs.
- **Restyled pickers**: model / permission sub-menus become bottom-sheet lists with the theme-blue selected state.
- **Exclusive overlays + history stack**: drawer / bottom sheet / add panel never stack; closed layer-by-layer.
- **Accessibility & motion**: `aria-modal`, focus in/out, honors system "reduce motion".

## Why it's good

| | |
|---|---|
| **Zero intrusion** | All styles are scoped under `data-dshm-mode="mobile"`; uninstall or anchor failure restores the official layout. |
| **Single-file build** | `lib/client.js` is the shipped artifact — no build step, no runtime dependencies. |
| **Conservative by form** | Detects three hosts (Android shell / desktop Electron / browser); the desktop DeepSeek Harness app **never activates** the mobile layout at any window size, and other non-phone forms keep the official layout pixel-for-pixel. |
| **Touch-first** | 44px touch targets, swipe gestures, one-handed reach. |
| **Stable theming** | Hash-based tint assignment — new feature icons are colored automatically, no code change. |
| **Verified on device** | MuMu emulator (720×1280) acceptance; 38 CI unit tests all green. |

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
npm test          # unit tests only (38)
npm run pack:dry  # preview the files that will be published
```

Pushing a `v*` tag triggers Release (npm Trusted Publishing with `NPM_TOKEN` fallback, then polls until the version is public). Device acceptance (MuMu) needs a device and is done manually per `docs/mobile-ux-plan-0.6.md`.

## License

MIT
