import * as THREE from 'three'
import type { BlockFace, IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { DirtBlockItem } from '../../../../items/blocks/dirt/DirtBlockItem.ts'
import { getCellLiquidFamily } from '../../../liquid/cellLiquid.ts'
import farmlandTexUrl from './assets/farmland.webp'
import farmlandMoistTexUrl from './assets/farmland_moist.webp'
import dirtTexUrl from '../grass/assets/dirt.webp'

registerTextureUrl(TextureId.FARMLAND_TOP, farmlandTexUrl)
registerTextureUrl(TextureId.FARMLAND_MOIST_TOP, farmlandMoistTexUrl)

/** Water this close (blocks, horizontally) keeps farmland moist. */
const MOISTURE_REACH = 4

const dirtMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(dirtTexUrl) })
const dryTopMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(farmlandTexUrl) })
const moistTopMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(farmlandMoistTexUrl) })

/**
 * Whether water (a water or swamp water cell, any level) lies within
 * MOISTURE_REACH blocks of farmland at (x, y, z), at its level or one above.
 */
export function isFarmlandWatered(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
  for (let dy = 0n; dy <= 1n; dy++) {
    for (let dx = -MOISTURE_REACH; dx <= MOISTURE_REACH; dx++) {
      for (let dz = -MOISTURE_REACH; dz <= MOISTURE_REACH; dz++) {
        const family = getCellLiquidFamily(world.getBlock(x + BigInt(dx), y + dy, z + BigInt(dz)).properties)
        if (family === 'water' || family === 'swamp_water') return true
      }
    }
  }
  return false
}

/**
 * Hoe-tilled soil, where crops are planted. Farmland within 4 blocks of water
 * turns moist (darker) and crops on it grow fastest; it dries out again when
 * the water goes (random ticks). Breaks like dirt and drops dirt.
 */
export class FarmlandBlock extends SolidBlock {
  readonly properties: IBlockProperties

  constructor(private readonly moist: boolean) {
    super()
    this.properties = {
      id: moist ? BlockIds.FARMLAND_MOIST : BlockIds.FARMLAND,
      name: moist ? 'farmland_moist' : 'farmland',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 0.3,
      lightLevel: 0,
      lightBlocking: 15,
      demolitionForceRequired: 0,
      tags: [BlockTags.SOIL],
    }
  }

  protected get defaultTextureId(): number {
    return TextureId.DIRT
  }

  protected getMaterials(): THREE.Material[] {
    const top = this.moist ? moistTopMaterial : dryTopMaterial
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [dirtMaterial, dirtMaterial, top, dirtMaterial, dirtMaterial, dirtMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    if (face === 0) return this.moist ? TextureId.FARMLAND_MOIST_TOP : TextureId.FARMLAND_TOP
    return TextureId.DIRT
  }

  onRandomTick(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const watered = isFarmlandWatered(world, x, y, z)
    if (watered !== this.moist) {
      world.setBlock(x, y, z, watered ? BlockIds.FARMLAND_MOIST : BlockIds.FARMLAND)
    }
  }

  getDrops(): IItem[] {
    return [new DirtBlockItem()]
  }
}
