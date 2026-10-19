import * as THREE from 'three'
import type { IBlockProperties, IBlock, IBlockMeshPart, IGlowHaloBlock } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GlowkelpBlockItem } from '../../../../items/blocks/glowkelp/GlowkelpBlockItem.ts'
import { SubmergedPlantBlock, SUBMERGED_SUPPORT_TICK_INTERVAL } from '../submerged_shared/SubmergedPlantBlock.ts'
import { createGlowkelpMaterial } from '../glowkelp/glowkelpMaterial.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import { createGlowHalo } from '../../../../renderer/GlowHaloMaterial.ts'
import { isGlowkelp } from '../glowkelp/GlowkelpBlock.ts'
import glowkelpTopTexUrl from './assets/glowkelp_top.webp'
import glowkelpTopGlowTexUrl from './assets/glowkelp_top_glow.webp'

registerTextureUrl(TextureId.GLOWKELP_TOP, glowkelpTopTexUrl)

const glowkelpTopMaterial = createGlowkelpMaterial(glowkelpTopTexUrl, glowkelpTopGlowTexUrl)

// Taller than its cell: a crown in the topmost water cell lifts its frond
// tips (brightest in the glow map) out of the water, whose surface is the
// cell top - through 86 %-opaque swamp water the glow would barely show
const glowkelpTopGeometry = createGroundCrossGeometry(1.4, 1.0)

// The big bladder's light: often rising out of the water as a glow over the pool
const glowkelpTopHalo = createGlowHalo({ color: [0.008, 0.022, 0.055], radius: 1.6, lift: 0.1 })

/**
 * Glowkelp crown - the end of a glowkelp strand: a fan of blades over the
 * biggest air bladder. It stands 1.4 blocks tall, so in the swamp's topmost
 * water cell its glowing frond tips break the surface and show from the shore.
 * Drops a glowkelp segment.
 */
export class GlowkelpTopBlock extends SubmergedPlantBlock implements IGlowHaloBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLOWKELP_TOP,
    name: 'glowkelp_top',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
    submergedIn: 'swamp_water',
    // The biggest bladder, usually right under the surface
    scatterGlow: [0.014, 0.042, 0.13],
    tickInterval: SUBMERGED_SUPPORT_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.GLOWKELP_TOP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return glowkelpTopGeometry
  }

  protected getMaterials(): THREE.Material {
    return glowkelpTopMaterial
  }

  protected override isSupport(below: IBlock): boolean {
    return below.properties.isSolid || isGlowkelp(below)
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.2, 0, 0.2), new THREE.Vector3(0.8, 1, 0.8))
  }

  getGlowHalo(): IBlockMeshPart {
    return glowkelpTopHalo
  }

  getDrops(): IItem[] {
    return [new GlowkelpBlockItem()]
  }
}
