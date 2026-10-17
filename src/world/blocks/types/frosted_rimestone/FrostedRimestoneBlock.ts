import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { RimestoneBlockItem } from '../../../../items/blocks/rimestone/RimestoneBlockItem.ts'
import topTexUrl from './assets/frosted-rimestone.webp'
import sideTexUrl from './assets/frosted-rimestone-side.webp'
import rimestoneTexUrl from '../rimestone/assets/rimestone.webp'

// RIMESTONE (the bottom face) is registered by RimestoneBlock
registerTextureUrl(TextureId.FROSTED_RIMESTONE_TOP, topTexUrl)
registerTextureUrl(TextureId.FROSTED_RIMESTONE_SIDE, sideTexUrl)

const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(topTexUrl) })
const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sideTexUrl) })
const bottomMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(rimestoneTexUrl) })

/**
 * Frosted rimestone - the shore surface of Cocytus: rimestone under a crust
 * of hoarfrost (frost top, frost fringe on the sides, bare rock below).
 * Mines to plain rimestone, like grass to dirt.
 */
export class FrostedRimestoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FROSTED_RIMESTONE,
    name: 'frosted_rimestone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.FROSTED_RIMESTONE_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, topMaterial, bottomMaterial, sideMaterial, sideMaterial]
  }

  /** TOP=0, BOTTOM=1, sides 2-5 */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: return TextureId.FROSTED_RIMESTONE_TOP
      case 1: return TextureId.RIMESTONE
      default: return TextureId.FROSTED_RIMESTONE_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new RimestoneBlockItem()]
  }
}
