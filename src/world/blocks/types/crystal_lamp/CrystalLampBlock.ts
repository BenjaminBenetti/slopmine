import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { CrystalLampBlockItem } from '../../../../items/blocks/crystal_lamp/CrystalLampBlockItem.ts'
import texUrl from './assets/crystal-lamp.webp'

registerTextureUrl(TextureId.CRYSTAL_LAMP, texUrl)
// Glowing texels light up in the dark (chunk shader emissive)
registerEmissiveTexture(TextureId.CRYSTAL_LAMP, { strength: 1.0, threshold: 0.1 })

const texture = loadBlockTexture(texUrl)
const material = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Crystal lamp - a prism crystal core set in a polished abyssal frame: the
 * brightest craftable light (level 15). Also the light of the Prism Sanctum
 * pylons.
 */
export class CrystalLampBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRYSTAL_LAMP,
    name: 'crystal_lamp',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 15,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRYSTAL_LAMP
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new CrystalLampBlockItem()]
  }
}
