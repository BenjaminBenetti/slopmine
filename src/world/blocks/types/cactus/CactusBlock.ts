import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CactusBlockItem } from '../../../../items/blocks/cactus/CactusBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import cactusTexUrl from './assets/cactus.webp'

// Register texture for atlas
registerTextureUrl(TextureId.CACTUS, cactusTexUrl)

const cactusTexture = loadBlockTexture(cactusTexUrl)
const cactusMaterial = new THREE.MeshLambertMaterial({ map: cactusTexture })

export class CactusBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CACTUS,
    name: 'cactus',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.4,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.CACTUS
  }

  protected getMaterials(): THREE.Material {
    return cactusMaterial
  }

  getDrops(): IItem[] {
    return [new CactusBlockItem()]
  }
}
