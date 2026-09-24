import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { CorruptedHellRockBlockItem } from '../../../../items/blocks/corrupted_hell_rock/CorruptedHellRockBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import corruptedHellRockTexUrl from './assets/corrupted-hell-rock.webp'

// Register texture
registerTextureUrl(TextureId.CORRUPTED_HELL_ROCK, corruptedHellRockTexUrl)
// Emissive: the ember veins glow
registerEmissiveTexture(TextureId.CORRUPTED_HELL_ROCK, { strength: 1.0, threshold: 0.15 })

const corruptedHellRockTexture = loadBlockTexture(corruptedHellRockTexUrl)
const corruptedHellRockMaterial = new THREE.MeshLambertMaterial({ map: corruptedHellRockTexture })

export class CorruptedHellRockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CORRUPTED_HELL_ROCK,
    name: 'corrupted_hell_rock',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 5, // Ember veins glow (emissive) with a faint light
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CORRUPTED_HELL_ROCK
  }

  protected getMaterials(): THREE.Material {
    return corruptedHellRockMaterial
  }

  getDrops(): IItem[] {
    return [new CorruptedHellRockBlockItem()]
  }
}
