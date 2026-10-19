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
import { AmberMushroomCapBlockItem } from '../../../../items/blocks/amber_mushroom_cap/AmberMushroomCapBlockItem.ts'
import amberMushroomCapTexUrl from './assets/amber_mushroom_cap.webp'

// Register texture
registerTextureUrl(TextureId.AMBER_MUSHROOM_CAP, amberMushroomCapTexUrl)
// Emissive: the golden spots glow, breathing slowly
registerEmissiveTexture(TextureId.AMBER_MUSHROOM_CAP, { strength: 0.75, threshold: 0.25, pulse: { amount: 0.35, grain: 'wave' } })

const amberMushroomCapTexture = loadBlockTexture(amberMushroomCapTexUrl)
const amberMushroomCapMaterial = new THREE.MeshLambertMaterial({ map: amberMushroomCapTexture })

export class AmberMushroomCapBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.AMBER_MUSHROOM_CAP,
    name: 'amber_mushroom_cap',
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
    return TextureId.AMBER_MUSHROOM_CAP
  }

  protected getMaterials(): THREE.Material {
    return amberMushroomCapMaterial
  }

  getDrops(): IItem[] {
    return [new AmberMushroomCapBlockItem()]
  }
}
