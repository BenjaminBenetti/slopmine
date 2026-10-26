import * as THREE from 'three'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { makeSwayInCurrent } from '../../../../renderer/SwayingPlantMaterial.ts'

/**
 * A sea plant's material (kelp, seagrass): a cutout sprite drawn in the
 * opaque pass (never `transparent`, so the water's surface always draws over
 * it), swaying in the current.
 */
export function createWaterPlantMaterial(textureUrl: string, sway: { amplitude: number; speed: number }): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    map: loadBlockTexture(textureUrl),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  })
  makeSwayInCurrent(material, sway)
  return material
}
