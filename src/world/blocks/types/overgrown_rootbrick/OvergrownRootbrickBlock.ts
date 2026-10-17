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
import { OvergrownRootbrickBlockItem } from '../../../../items/blocks/overgrown_rootbrick/OvergrownRootbrickBlockItem.ts'
import texUrl from './assets/overgrown-rootbrick.webp'

registerTextureUrl(TextureId.OVERGROWN_ROOTBRICK, texUrl)
registerEmissiveTexture(TextureId.OVERGROWN_ROOTBRICK, { strength: 0.6, threshold: 0.18 })

const texture = loadBlockTexture(texUrl)
// Item displays glow too
const material = new THREE.MeshLambertMaterial({
  map: texture,
  emissiveMap: texture,
  emissive: 0xffffff,
  emissiveIntensity: 0.5,
})

/**
 * Overgrown rootbrick - hive masonry grown over with mycelium. Dungeon
 * structure: force 6.
 */
export class OvergrownRootbrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OVERGROWN_ROOTBRICK,
    name: 'overgrown_rootbrick',
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
    return TextureId.OVERGROWN_ROOTBRICK
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new OvergrownRootbrickBlockItem()]
  }
}
