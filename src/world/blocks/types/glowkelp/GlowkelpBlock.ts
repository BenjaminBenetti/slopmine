import * as THREE from 'three'
import type { IBlockProperties, IBlock, IBlockMeshPart, IGlowHaloBlock, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GlowkelpBlockItem } from '../../../../items/blocks/glowkelp/GlowkelpBlockItem.ts'
import { SubmergedPlantBlock, SUBMERGED_SUPPORT_TICK_INTERVAL } from '../submerged_shared/SubmergedPlantBlock.ts'
import { createGlowkelpMaterial, glowkelpGeometry } from './glowkelpMaterial.ts'
import { createGlowHalo } from '../../../../renderer/GlowHaloMaterial.ts'
import glowkelpTexUrl from './assets/glowkelp.webp'
import glowkelpGlowTexUrl from './assets/glowkelp_glow.webp'

registerTextureUrl(TextureId.GLOWKELP, glowkelpTexUrl)

const glowkelpMaterial = createGlowkelpMaterial(glowkelpTexUrl, glowkelpGlowTexUrl)

// The blue light its bladders shed into the water around the strand
const glowkelpHalo = createGlowHalo({ color: [0.006, 0.016, 0.04], radius: 1.2, lift: 0 })

/** Whether a block is part of a glowkelp strand (a segment holds up the next). */
export function isGlowkelp(block: IBlock): boolean {
  const id = block.properties.id
  return id === BlockIds.GLOWKELP || id === BlockIds.GLOWKELP_TOP
}

/**
 * Glowkelp - the swamp pools' kelp: a strand of stalk segments rising from
 * the mud to a crown (GLOWKELP_TOP), often breaking the surface. Stands in
 * swamp water (`submergedIn`), sways in the current, and its air bladders
 * glow blue after dark. Emits no block light (that light is warm torchlight).
 */
export class GlowkelpBlock extends SubmergedPlantBlock implements IGlowHaloBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLOWKELP,
    name: 'glowkelp',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
    submergedIn: 'swamp_water',
    // Its bladders' blue light, scattered up through the water
    scatterGlow: [0.008, 0.027, 0.085],
    tickInterval: SUBMERGED_SUPPORT_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.GLOWKELP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return glowkelpGeometry
  }

  protected getMaterials(): THREE.Material {
    return glowkelpMaterial
  }

  protected override isSupport(below: IBlock): boolean {
    return below.properties.isSolid || isGlowkelp(below)
  }

  /** A placed segment is a fresh strand end: it grows a crown, and a crown it lands on becomes stalk. */
  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (world.getBlock(x, y - 1n, z).properties.id === BlockIds.GLOWKELP_TOP) {
      world.setBlock(x, y - 1n, z, BlockIds.GLOWKELP)
    }
    world.setBlock(x, y, z, BlockIds.GLOWKELP_TOP)
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.25, 0, 0.25), new THREE.Vector3(0.75, 1, 0.75))
  }

  getGlowHalo(): IBlockMeshPart {
    return glowkelpHalo
  }

  getDrops(): IItem[] {
    return [new GlowkelpBlockItem()]
  }
}
