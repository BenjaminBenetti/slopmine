import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { SandBlockItem } from '../../../../items/blocks/sand/SandBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import sandTexUrl from './assets/sand.webp'

// Register texture for atlas
registerTextureUrl(TextureId.SAND, sandTexUrl)

const sandTexture = loadBlockTexture(sandTexUrl)
const sandMaterial = new THREE.MeshLambertMaterial({ map: sandTexture })

export class SandBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SAND,
    name: 'sand',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.SAND
  }

  protected getMaterials(): THREE.Material {
    return sandMaterial
  }

  getDrops(): IItem[] {
    return [new SandBlockItem()]
  }
}
