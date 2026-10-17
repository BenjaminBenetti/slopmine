/**
 * Armor icon URLs by item id. Spelled out per file (not a glob) so Vite's
 * static `new URL(..., import.meta.url)` asset detection picks each one up.
 */
export const ARMOR_ICON_URLS: Readonly<Record<string, string>> = {
  leather_helmet: new URL('./assets/leather-helmet-icon.webp', import.meta.url).href,
  leather_chestplate: new URL('./assets/leather-chestplate-icon.webp', import.meta.url).href,
  leather_leggings: new URL('./assets/leather-leggings-icon.webp', import.meta.url).href,
  leather_boots: new URL('./assets/leather-boots-icon.webp', import.meta.url).href,
  copper_helmet: new URL('./assets/copper-helmet-icon.webp', import.meta.url).href,
  copper_chestplate: new URL('./assets/copper-chestplate-icon.webp', import.meta.url).href,
  copper_leggings: new URL('./assets/copper-leggings-icon.webp', import.meta.url).href,
  copper_boots: new URL('./assets/copper-boots-icon.webp', import.meta.url).href,
  iron_helmet: new URL('./assets/iron-helmet-icon.webp', import.meta.url).href,
  iron_chestplate: new URL('./assets/iron-chestplate-icon.webp', import.meta.url).href,
  iron_leggings: new URL('./assets/iron-leggings-icon.webp', import.meta.url).href,
  iron_boots: new URL('./assets/iron-boots-icon.webp', import.meta.url).href,
  steel_helmet: new URL('./assets/steel-helmet-icon.webp', import.meta.url).href,
  steel_chestplate: new URL('./assets/steel-chestplate-icon.webp', import.meta.url).href,
  steel_leggings: new URL('./assets/steel-leggings-icon.webp', import.meta.url).href,
  steel_boots: new URL('./assets/steel-boots-icon.webp', import.meta.url).href,
  diamond_helmet: new URL('./assets/diamond-helmet-icon.webp', import.meta.url).href,
  diamond_chestplate: new URL('./assets/diamond-chestplate-icon.webp', import.meta.url).href,
  diamond_leggings: new URL('./assets/diamond-leggings-icon.webp', import.meta.url).href,
  diamond_boots: new URL('./assets/diamond-boots-icon.webp', import.meta.url).href,
  infernium_helmet: new URL('./assets/infernium-helmet-icon.webp', import.meta.url).href,
  infernium_chestplate: new URL('./assets/infernium-chestplate-icon.webp', import.meta.url).href,
  infernium_leggings: new URL('./assets/infernium-leggings-icon.webp', import.meta.url).href,
  infernium_boots: new URL('./assets/infernium-boots-icon.webp', import.meta.url).href,
  hellbane_helmet: new URL('./assets/hellbane-helmet-icon.webp', import.meta.url).href,
  hellbane_chestplate: new URL('./assets/hellbane-chestplate-icon.webp', import.meta.url).href,
  hellbane_leggings: new URL('./assets/hellbane-leggings-icon.webp', import.meta.url).href,
  hellbane_boots: new URL('./assets/hellbane-boots-icon.webp', import.meta.url).href,
}
