import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { MycelialCarpetBlockItem } from '../../../../items/blocks/mycelial_carpet/MycelialCarpetBlockItem.ts'
import texUrl from './assets/mycelial-carpet.webp'

registerTextureUrl(TextureId.MYCELIAL_CARPET, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Mycelial carpet - the woven mycelium mat on the hive's floors.
 */
export class MycelialCarpetBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MYCELIAL_CARPET,
    name: 'mycelial_carpet',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.8,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.MYCELIAL_CARPET
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new MycelialCarpetBlockItem()]
  }
}
