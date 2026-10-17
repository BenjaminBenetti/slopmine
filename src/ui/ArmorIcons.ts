import type { ArmorSlot } from '../items/armor/ArmorTiers.ts'

/**
 * Small SVG shapes for the armor UI (24x24 viewBox): the HUD's chestplate
 * point icon and the faint slot silhouettes of the equipment panel.
 */

/** Chestplate outline used for HUD armor points. */
export const CHESTPLATE_PATH =
  'M8 3.5h2.2q1.8 2 3.6 0H16l5 3.2-2 4.3-1.8-0.9V20.5q-5.2 2-10.4 0V10.1l-1.8 0.9-2-4.3z'

/** Slot silhouettes (equipment panel), one per armor slot. */
export const SLOT_SILHOUETTE_PATHS: Readonly<Record<ArmorSlot, string>> = {
  head: 'M5 13.5C5 7.5 8 4 12 4s7 3.5 7 9.5V20h-4.2v-5.2H9.2V20H5z',
  chest: CHESTPLATE_PATH,
  legs: 'M6 3.5h12V21h-4.6l-0.8-10.5h-1.2L10.6 21H6z',
  feet: 'M5 8h4.2v13H2.2v-3.4q0-1.6 2-1.6H5zM14.8 8H19v8h0.8q2 0 2 1.6V21h-7z',
}
