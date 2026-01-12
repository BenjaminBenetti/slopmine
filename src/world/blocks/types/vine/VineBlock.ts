import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { VineBlockItem } from '../../../../items/blocks/vine/VineBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import vineTexUrl from './assets/vine.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.VINE, vineTexUrl, true)

const vineTexture = loadBlockTexture(vineTexUrl)

const vineMaterial = new THREE.MeshLambertMaterial({
  map: vineTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class VineBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.VINE,
    name: 'vine',
    isOpaque: false,
    isSolid: false, // Players can walk through vines
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.VINE
  }

  protected getMaterials(): THREE.Material {
    return vineMaterial
  }

  getDrops(): IItem[] {
    return [new VineBlockItem()]
  }
}
