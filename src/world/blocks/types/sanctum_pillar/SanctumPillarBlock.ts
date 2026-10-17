import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { polishedAbyssalStoneMaterial } from '../polished_abyssal_stone/PolishedAbyssalStoneBlock.ts'
import { SanctumPillarBlockItem } from '../../../../items/blocks/sanctum_pillar/SanctumPillarBlockItem.ts'
import sideTexUrl from './assets/sanctum-pillar-side.webp'

registerTextureUrl(TextureId.SANCTUM_PILLAR_SIDE, sideTexUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sideTexUrl) })
// Order: +X, -X, +Y, -Y, +Z, -Z
const materials = [sideMaterial, sideMaterial, polishedAbyssalStoneMaterial, polishedAbyssalStoneMaterial, sideMaterial, sideMaterial]

/**
 * Sanctum pillar - fluted polished column of the Prism Sanctum's colonnades
 * and galleries (ends show polished abyssal stone). Dungeon structural block
 * (force 6); drops itself.
 */
export class SanctumPillarBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SANCTUM_PILLAR,
    name: 'sanctum_pillar',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.SANCTUM_PILLAR_SIDE
  }

  getTextureForFace(face: BlockFace): number {
    // TOP = 0, BOTTOM = 1
    return face === 0 || face === 1 ? TextureId.POLISHED_ABYSSAL_STONE : TextureId.SANCTUM_PILLAR_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  getDrops(): IItem[] {
    return [new SanctumPillarBlockItem()]
  }
}
