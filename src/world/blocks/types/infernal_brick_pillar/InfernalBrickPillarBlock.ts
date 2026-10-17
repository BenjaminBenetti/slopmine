import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { InfernalBrickPillarBlockItem } from '../../../../items/blocks/infernal_brick_pillar/InfernalBrickPillarBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import pillarSideTexUrl from './assets/infernal-brick-pillar-side.webp'
import pillarTopTexUrl from './assets/infernal-brick-pillar-top.webp'

registerTextureUrl(TextureId.INFERNAL_BRICK_PILLAR_SIDE, pillarSideTexUrl)
registerTextureUrl(TextureId.INFERNAL_BRICK_PILLAR_TOP, pillarTopTexUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(pillarSideTexUrl) })
const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(pillarTopTexUrl) })

/**
 * Infernal brick pillar: a fluted column block of the Infernal Bastion
 * (tower corners, gate posts, arena columns). Structural dungeon block
 * (force 6). Fluting runs vertically and stacks seamlessly.
 */
export class InfernalBrickPillarBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_BRICK_PILLAR,
    name: 'infernal_brick_pillar',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6, // infernium pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_BRICK_PILLAR_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial]
  }

  /** TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5 */
  getTextureForFace(face: BlockFace): number {
    return face === 0 || face === 1 ? TextureId.INFERNAL_BRICK_PILLAR_TOP : TextureId.INFERNAL_BRICK_PILLAR_SIDE
  }

  getDrops(): IItem[] {
    return [new InfernalBrickPillarBlockItem()]
  }
}
