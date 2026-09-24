import { createLiquidMaterial } from '../../../../renderer/LiquidMaterials.ts'
import swampWaterTexUrl from './assets/swamp-water.webp'

/** Texture shared by every swamp water level (texture registration + material). */
export { swampWaterTexUrl }

/**
 * The one material shared by all swamp water levels: murky (less see-through
 * than water), sluggish drift, dull sheen.
 */
export const swampWaterMaterial = createLiquidMaterial(swampWaterTexUrl, {
  opacity: 0.86,
  flowU: 0.009,
  flowV: 0.006,
  specular: 0x6a7060,
  shininess: 200,
  reflectivity: 0.45,
  // The murky texture's few brighter texels: a dull, sparse sheen
  glitterLuma: [0.05, 0.08],
})
