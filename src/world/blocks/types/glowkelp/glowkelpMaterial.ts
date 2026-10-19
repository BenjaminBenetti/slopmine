import * as THREE from 'three'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { makeGlowDarkOnly } from '../../../../renderer/BioluminescentMaterial.ts'
import { makeSwayInCurrent } from '../../../../renderer/SwayingPlantMaterial.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'

/** Full-cell cross: stacked segments join into one strand (stems on the cell axis). */
export const glowkelpGeometry = createGroundCrossGeometry(1.0, 1.0)

/** How glowkelp waves in the swamp's sluggish current. */
const KELP_SWAY = { amplitude: 0.09, speed: 0.85 }

/**
 * A glowkelp segment's material: olive kelp with khaki air bladders by day;
 * in the dark the glow map lights the bladders electric blue over a faint
 * blue sheen on the blades. Not `transparent` - a cutout drawn in the opaque
 * pass, so the swamp water's surface always draws over it.
 */
export function createGlowkelpMaterial(textureUrl: string, glowUrl: string): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    map: loadBlockTexture(textureUrl),
    emissiveMap: loadBlockTexture(glowUrl),
    emissive: 0xffffff,
    emissiveIntensity: 1.2,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  })
  makeGlowDarkOnly(material)
  makeSwayInCurrent(material, KELP_SWAY)
  return material
}
