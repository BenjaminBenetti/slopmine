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
import { FoxfireMushroomCapBlockItem } from '../../../../items/blocks/foxfire_mushroom_cap/FoxfireMushroomCapBlockItem.ts'
import foxfireMushroomCapTexUrl from './assets/foxfire_mushroom_cap.webp'

// Register texture
registerTextureUrl(TextureId.FOXFIRE_MUSHROOM_CAP, foxfireMushroomCapTexUrl)
// Emissive: the lime spots glow, breathing slowly
registerEmissiveTexture(TextureId.FOXFIRE_MUSHROOM_CAP, { strength: 0.6, threshold: 0.25, pulse: { amount: 0.35, grain: 'wave' } })

const foxfireMushroomCapTexture = loadBlockTexture(foxfireMushroomCapTexUrl)
const foxfireMushroomCapMaterial = new THREE.MeshLambertMaterial({ map: foxfireMushroomCapTexture })

export class FoxfireMushroomCapBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FOXFIRE_MUSHROOM_CAP,
    name: 'foxfire_mushroom_cap',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 15,  // Bioluminescent glow from cap
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.FOXFIRE_MUSHROOM_CAP
  }

  protected getMaterials(): THREE.Material {
    return foxfireMushroomCapMaterial
  }

  getDrops(): IItem[] {
    return [new FoxfireMushroomCapBlockItem()]
  }
}
