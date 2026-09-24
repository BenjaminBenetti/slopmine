import { createLiquidMaterial } from '../../../../renderer/LiquidMaterials.ts'
import waterTexUrl from './assets/water.webp'

/** Texture shared by every water level (texture registration + material). */
export { waterTexUrl }

/**
 * The one material shared by all water levels: translucent enough to see the
 * bed, slow drift, glittering sun path, strong sky reflection when glancing.
 */
export const waterMaterial = createLiquidMaterial(waterTexUrl, {
  opacity: 0.78,
  flowU: 0.021,
  flowV: 0.013,
  specular: 0xffffff,
  shininess: 300,
  reflectivity: 0.75,
  // The water texture's ripple highlights (texel luma ~p40-p90): a sun path
  glitterLuma: [0.1, 0.145],
})
