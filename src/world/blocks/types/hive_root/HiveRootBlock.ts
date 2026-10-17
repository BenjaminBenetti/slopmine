import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { HiveRootBlockItem } from '../../../../items/blocks/hive_root/HiveRootBlockItem.ts'
import rootTexUrl from './assets/hive-root.webp'

registerTextureUrl(TextureId.HIVE_ROOT, rootTexUrl)

const rootMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(rootTexUrl) })

/**
 * Hive root - the woven root mass of the Sporeheart Hive's mound and its
 * buttress roots. Dungeon structure (force 6).
 */
export class HiveRootBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HIVE_ROOT,
    name: 'hive_root',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 40,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.HIVE_ROOT
  }

  protected getMaterials(): THREE.Material {
    return rootMaterial
  }

  getDrops(): IItem[] {
    return [new HiveRootBlockItem()]
  }
}
