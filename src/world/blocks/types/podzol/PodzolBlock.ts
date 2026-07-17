import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PodzolBlockItem } from '../../../../items/blocks/podzol/PodzolBlockItem.ts'
import podzolTexUrl from './assets/podzol.webp'

// Register texture for atlas
registerTextureUrl(TextureId.PODZOL, podzolTexUrl)

const podzolTexture = loadBlockTexture(podzolTexUrl)
const podzolMaterial = new THREE.MeshLambertMaterial({ map: podzolTexture })

/**
 * Podzol - acidic forest floor soil covered in fallen pine needles.
 * Found on the ground of pine forests.
 */
export class PodzolBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PODZOL,
    name: 'podzol',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.4,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.PODZOL
  }

  protected getMaterials(): THREE.Material {
    return podzolMaterial
  }

  getDrops(): IItem[] {
    return [new PodzolBlockItem()]
  }
}
