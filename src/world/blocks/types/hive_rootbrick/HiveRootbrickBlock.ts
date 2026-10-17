import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { HiveRootbrickBlockItem } from '../../../../items/blocks/hive_rootbrick/HiveRootbrickBlockItem.ts'
import rootbrickTexUrl from './assets/hive-rootbrick.webp'

registerTextureUrl(TextureId.HIVE_ROOTBRICK, rootbrickTexUrl)
// The teal mycelium in the mortar lines glows dimly
registerEmissiveTexture(TextureId.HIVE_ROOTBRICK, { strength: 0.6, threshold: 0.18 })

const rootbrickMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(rootbrickTexUrl) })

/**
 * Hive rootbrick - packed root-and-fungus masonry of the Sporeheart Hive.
 * Dungeon structure: needs infernium tools (force 6), so players enter
 * through the hive's door. Only the hive places it, which makes it the
 * signature of the hive's chest loot table.
 */
export class HiveRootbrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HIVE_ROOTBRICK,
    name: 'hive_rootbrick',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 50,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.HIVE_ROOTBRICK
  }

  protected getMaterials(): THREE.Material {
    return rootbrickMaterial
  }

  getDrops(): IItem[] {
    return [new HiveRootbrickBlockItem()]
  }
}
