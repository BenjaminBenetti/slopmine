import * as THREE from 'three'
import type { IBlockProperties, IBlockMeshPart, IGlowHaloBlock } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { LanternweedBlockItem } from '../../../../items/blocks/lanternweed/LanternweedBlockItem.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import { makeGlowDarkOnly } from '../../../../renderer/BioluminescentMaterial.ts'
import { makeSwayInCurrent } from '../../../../renderer/SwayingPlantMaterial.ts'
import { createGlowHalo } from '../../../../renderer/GlowHaloMaterial.ts'
import { SubmergedPlantBlock, SUBMERGED_SUPPORT_TICK_INTERVAL } from '../submerged_shared/SubmergedPlantBlock.ts'
import lanternweedTexUrl from './assets/lanternweed.webp'
import lanternweedGlowTexUrl from './assets/lanternweed_glow.webp'

registerTextureUrl(TextureId.LANTERNWEED, lanternweedTexUrl)

const lanternweedGeometry = createGroundCrossGeometry(0.85, 0.95)

// Olive seed pods by day; in the dark the glow map lights them gold. A cutout
// in the opaque pass (not `transparent`), so the water surface draws over it
const lanternweedMaterial = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(lanternweedTexUrl),
  emissiveMap: loadBlockTexture(lanternweedGlowTexUrl),
  emissive: 0xffffff,
  emissiveIntensity: 1.2,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})
makeGlowDarkOnly(lanternweedMaterial)
makeSwayInCurrent(lanternweedMaterial, { amplitude: 0.05, speed: 1.1 })

// A pool of gold light on the pond bed
const lanternweedHalo = createGlowHalo({ color: [0.035, 0.022, 0.005], radius: 1.3, lift: -0.1 })

/**
 * Lanternweed - a feathery weed on the swamp pools' muddy beds, standing in
 * swamp water (`submergedIn`), its round pods glowing gold after dark. A
 * faint light source (4): its warm block light suits the gold, and pools
 * full of it shimmer from below.
 */
export class LanternweedBlock extends SubmergedPlantBlock implements IGlowHaloBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LANTERNWEED,
    name: 'lanternweed',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 4,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
    submergedIn: 'swamp_water',
    // Gold light welling up from the pond bed
    scatterGlow: [0.09, 0.052, 0.01],
    tickInterval: SUBMERGED_SUPPORT_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.LANTERNWEED
  }

  protected getGeometry(): THREE.BufferGeometry {
    return lanternweedGeometry
  }

  protected getMaterials(): THREE.Material {
    return lanternweedMaterial
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 0.8, 0.9))
  }

  getGlowHalo(): IBlockMeshPart {
    return lanternweedHalo
  }

  getDrops(): IItem[] {
    return [new LanternweedBlockItem()]
  }
}
