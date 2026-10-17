import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { IcePillarBlockItem } from '../../../../items/blocks/ice_pillar/IcePillarBlockItem.ts'
import sideTexUrl from './assets/ice-pillar-side.webp'
import endTexUrl from './assets/ice-pillar-end.webp'

registerTextureUrl(TextureId.ICE_PILLAR_SIDE, sideTexUrl)
registerTextureUrl(TextureId.ICE_PILLAR_END, endTexUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sideTexUrl) })
const endMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(endTexUrl) })

/**
 * Ice pillar - a fluted column of glacial ice (fluting runs off the top and
 * bottom so stacked pillars read as one shaft; square end caps). Arcades,
 * cisterns and halls of the Frozen Citadel. Dungeon structural (force 6).
 */
export class IcePillarBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ICE_PILLAR,
    name: 'ice_pillar',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.ICE_PILLAR_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, endMaterial, endMaterial, sideMaterial, sideMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    return face <= 1 ? TextureId.ICE_PILLAR_END : TextureId.ICE_PILLAR_SIDE
  }

  getDrops(): IItem[] {
    return [new IcePillarBlockItem()]
  }
}
