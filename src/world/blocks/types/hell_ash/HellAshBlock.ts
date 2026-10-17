import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { HellAshBlockItem } from '../../../../items/blocks/hell_ash/HellAshBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import hellAshTexUrl from './assets/hell-ash.webp'

registerTextureUrl(TextureId.HELL_ASH, hellAshTexUrl)
// Only the ember specks glow
registerEmissiveTexture(TextureId.HELL_ASH, { strength: 1.2, threshold: 0.35 })

const hellAshMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(hellAshTexUrl) })

/**
 * Cinder ash: loose volcanic ash and cinders topping the badland mesas of
 * the Molten Wastes. A few embers still glow in it (emissive specks).
 */
export class HellAshBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HELL_ASH,
    name: 'hell_ash',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.HELL_ASH
  }

  protected getMaterials(): THREE.Material {
    return hellAshMaterial
  }

  getDrops(): IItem[] {
    return [new HellAshBlockItem()]
  }
}
