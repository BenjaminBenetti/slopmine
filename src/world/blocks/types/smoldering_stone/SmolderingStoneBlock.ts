import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { SmolderingStoneBlockItem } from '../../../../items/blocks/smoldering_stone/SmolderingStoneBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import smolderingStoneTexUrl from './assets/smoldering_stone.webp'

// Register texture for atlas
registerTextureUrl(TextureId.SMOLDERING_STONE, smolderingStoneTexUrl)

const smolderingStoneTexture = loadBlockTexture(smolderingStoneTexUrl)
const smolderingStoneMaterial = new THREE.MeshLambertMaterial({ map: smolderingStoneTexture })

/**
 * Smoldering stone - dark volcanic rock shot through with glowing ember
 * cracks and dusted with grey ash. Scattered around volcano caldera rims and
 * inner bowl walls; nearby blocks emit slow grey smoke wisps at runtime
 * (driven by the SmolderingStoneSystem main-thread task, same pattern as
 * geyser eruptions).
 */
export class SmolderingStoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SMOLDERING_STONE,
    name: 'smoldering_stone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 4, // Ember cracks give off a soft glow
    lightBlocking: 15,
    demolitionForceRequired: 1, // Requires pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.SMOLDERING_STONE
  }

  protected getMaterials(): THREE.Material {
    return smolderingStoneMaterial
  }

  getDrops(): IItem[] {
    return [new SmolderingStoneBlockItem()]
  }
}
