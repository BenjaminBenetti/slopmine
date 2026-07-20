/**
 * Global UI scale factor for HUD and overlay elements (toolbar, inventory,
 * crafting, health bar, crosshair, tooltips). Applied via CSS zoom so layout,
 * hit-testing, and drag-drop geometry all scale together.
 */
export const UI_SCALE = 1.25

/**
 * Apply the global UI scale to a top-level UI root element.
 * Only apply to TOP-LEVEL roots - zooming a child of an already-scaled
 * element compounds the factor.
 */
export function applyUIScale(element: HTMLElement): void {
  element.style.setProperty('zoom', String(UI_SCALE))
}
