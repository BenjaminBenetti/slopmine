import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { SoulLanternBlockItem } from '../../../../items/blocks/soul_lantern/SoulLanternBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import soulLanternTexUrl from './assets/soul-lantern.webp'

registerTextureUrl(TextureId.SOUL_LANTERN, soulLanternTexUrl)
// The soul fire behind the bone bars glows; the bars stay lit by the world
registerEmissiveTexture(TextureId.SOUL_LANTERN, { strength: 1.6, threshold: 0.25 })

const soulLanternMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(soulLanternTexUrl) })

/**
 * Soul lantern - a bone cage around pale-green soul fire. Lights the
 * Ossuary's fossils, spires and the Catacombs; craftable from bone blocks
 * and soul shards.
 */
export class SoulLanternBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SOUL_LANTERN,
    name: 'soul_lantern',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.0,
    lightLevel: 14,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.SOUL_LANTERN
  }

  protected getMaterials(): THREE.Material {
    return soulLanternMaterial
  }

  getDrops(): IItem[] {
    return [new SoulLanternBlockItem()]
  }
}
