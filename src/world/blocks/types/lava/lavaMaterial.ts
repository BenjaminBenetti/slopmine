import { createLiquidMaterial } from '../../../../renderer/LiquidMaterials.ts'
import lavaTexUrl from './assets/lava.webp'

/** Texture shared by every lava level (texture registration + material). */
export { lavaTexUrl }

/**
 * The one material shared by all lava levels: nearly opaque, slow crawl,
 * self-lit orange glow with a gentle pulse.
 */
export const lavaMaterial = createLiquidMaterial(lavaTexUrl, {
  opacity: 0.95,
  flowU: 0.006,
  flowV: 0.004,
  specular: 0x2a1a10,
  shininess: 20,
  reflectivity: 0,
  emissive: 0xff4400,
  emissiveIntensity: 0.3,
  emissivePulse: 0.06,
})
