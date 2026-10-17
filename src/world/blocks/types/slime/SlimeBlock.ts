import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { SlimeBlockItem } from '../../../../items/blocks/slime/SlimeBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import slimeTexUrl from './assets/slime.webp'

// Register texture
registerTextureUrl(TextureId.SLIME, slimeTexUrl)

const slimeTexture = loadBlockTexture(slimeTexUrl)
const slimeMaterial = new THREE.MeshLambertMaterial({ map: slimeTexture })

/**
 * Slime block: a springy jelly cube crafted from slime balls. Landing on it
 * cancels fall damage and bounces the player back up (SlimeBounce.ts).
 */
export class SlimeBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SLIME,
    name: 'slime',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.SLIME
  }

  protected getMaterials(): THREE.Material {
    return slimeMaterial
  }

  getDrops(): IItem[] {
    return [new SlimeBlockItem()]
  }
}
