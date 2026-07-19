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
- **Player can die during world gen** (falls before terrain streams in). Check for "YOU DIED" after loading and click the respawn button.
- **Playwright `waitForFunction(fn, ARG, options)`** — options is the THIRD argument.
- **Camera look**: real pointer-lock deltas are unreliable headless. Click the canvas once (acquires pointer lock), then dispatch synthetic `new MouseEvent('mousemove', { movementX, movementY, bubbles: true })` on `document` — FirstPersonCameraControls reads `movementX/Y` and rotates deterministically. Split large deltas into ~10 steps.
- **Placement/mining**: `page.mouse.click(cx, cy, { button: 'right' })` places the selected toolbar item at the crosshair raycast. Toolbar select via digit keys ('1'–'9', '0').
- **Inventory/bench/chest UIs are plain DOM** (mostly unstyled divs, no class names). Find slots geometrically: square divs 36–72px; the 10-slot row with max Y is the toolbar; block-UI slots are the rest. Drag items with `mouse.down` → stepped `move` → `up` (DragDropHandler listens on document).
- **Dev seeding**: `main.ts` has a `if (import.meta.env.DEV)` block that gives diamond tools — temporarily add items under test there (mark `TEMP-VERIFY`, remove before commit).
- Console health signals at boot: `Item registry initialized with N items`, `RecipeBook indexed N recipes`, `BlockIconGenerator: Generated N block icons` — N should match your registrations. Capture `pageerror` events; zero is the baseline.
