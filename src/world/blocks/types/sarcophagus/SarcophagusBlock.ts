import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { SarcophagusBlockItem } from '../../../../items/blocks/sarcophagus/SarcophagusBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import sarcophagusTopTexUrl from './assets/sarcophagus-top.webp'
import sarcophagusSideTexUrl from './assets/sarcophagus-side.webp'

registerTextureUrl(TextureId.SARCOPHAGUS_TOP, sarcophagusTopTexUrl)
registerTextureUrl(TextureId.SARCOPHAGUS_SIDE, sarcophagusSideTexUrl)

const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sarcophagusTopTexUrl) })
const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sarcophagusSideTexUrl) })

/**
 * Sarcophagus - a carved limestone tomb. The Catacombs lay them in pairs
 * (a 1x2 coffin) in their vaults and burial halls.
 */
export class SarcophagusBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SARCOPHAGUS,
    name: 'sarcophagus',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.SARCOPHAGUS_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    return face === 0 || face === 1 ? TextureId.SARCOPHAGUS_TOP : TextureId.SARCOPHAGUS_SIDE
  }

  getDrops(): IItem[] {
    return [new SarcophagusBlockItem()]
  }
}
