---
name: verify
description: Build, launch, and drive Slopmine in a headless browser to verify changes at the real surface (WebGL canvas + DOM UI). Use when a change needs runtime verification.
---

# Verifying Slopmine changes

The surface is a Vite-served browser game: WebGL canvas (three.js) + DOM overlays (toolbar, inventory, block UIs). Drive it with Playwright headless Chromium.

## Launch

```bash
pnpm dev > /tmp/vite-dev.log 2>&1 &   # note the port from the log (5173+, path /slopmine/)
npx playwright install chromium        # once; deps: sudo npx playwright install-deps chromium (Debian container)
```

Launch Chromium with software GL: `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] })`. WebGL works; world generation of the initial 72 chunks takes **5–10 minutes** under SwiftShader — budget for it.

## Gotchas (all cost a run to discover)

- **Loading screen**: mounts *asynchronously* after page load — wait for "Generating World" text to APPEAR first, then for it to become invisible. `hide()` only sets `opacity: 0` and leaves the text in the DOM, so the disappear-check must walk ancestors for `opacity === '0'`, not check `textContent`.
- **Player can die during world gen** (falls before terrain streams in). Check for "YOU DIED" after loading — respawn is AUTOMATIC after a short delay (no button; DeathScreen has no clickable element), just wait a few seconds and re-check.
- **Loading title text is "Generating World..."** (with ellipsis) — match with `.includes('Generating World')` on leaf elements (`children.length === 0`), never exact equality.
- **Player spawns high (~y 258) and falls** — after loading, wait until `playerBody.isOnGround` holds for 2+ consecutive polls before interacting. On jungle spawns the player lands ON the tree canopy; leaf blocks drop nothing when mined, so mine down through them or relocate before testing drop-related features.
- **Playwright `waitForFunction(fn, ARG, options)`** — options is the THIRD argument.
- **Camera look**: synthetic pointer-lock mousemove events are UNRELIABLE (often only 1 of N dispatched deltas applies, and CDP mouse.down/up near pointer lock synthesizes stray movement deltas that drift the pitch between polls). The robust approach: expose `cameraControls` on `window` in the dev-only TEMP-VERIFY block and set `pitch`/`yaw` directly, re-asserting each poll while holding an aim. WASD movement is horizontal-only from yaw (`forward = (-sin yaw, 0, -cos yaw)`), so pitch never affects walking; to walk at a target: `yaw = Math.atan2(-(tx - px), -(tz - pz))`.
- **Playwright module resolution**: `playwright` is NOT a project dependency — `npm init -y && npm install playwright` in the scratchpad dir (browsers from `npx playwright install chromium` are shared via ~/.cache), or the script's import will throw ERR_MODULE_NOT_FOUND.
- **Debug handles**: expose `entityManager`, `playerState`, `playerBody`, `cameraControls` on `window` in a dev-only TEMP-VERIFY block — polling game state via `page.evaluate` beats screenshot-guessing for every assertion (entity counts, inventory counts, positions, grounded state).
- **Placement/mining**: `page.mouse.click(cx, cy, { button: 'right' })` places the selected toolbar item at the crosshair raycast. Toolbar select via digit keys ('1'–'9', '0').
- **Inventory/bench/chest UIs are plain DOM** (mostly unstyled divs, no class names). Find slots geometrically: square divs 36–72px; the 10-slot row with max Y is the toolbar; block-UI slots are the rest. Drag items with `mouse.down` → stepped `move` → `up` (DragDropHandler listens on document).
- **Dev seeding**: `main.ts` has a `if (import.meta.env.DEV)` block that gives diamond tools — temporarily add items under test there (mark `TEMP-VERIFY`, remove before commit).
- Console health signals at boot: `Item registry initialized with N items`, `RecipeBook indexed N recipes`, `BlockIconGenerator: Generated N block icons` — N should match your registrations. Capture `pageerror` events; zero is the baseline.
