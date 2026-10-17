import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { FrostboundPlanksBlockItem } from '../../../../items/blocks/frostbound_planks/FrostboundPlanksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/frostbound-planks.webp'

registerTextureUrl(TextureId.FROSTBOUND_PLANKS, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Frostbound planks - old dark timber locked in frost: the drawbridge,
 * walkways, bunks and tables of the Frozen Citadel.
 */
export class FrostboundPlanksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FROSTBOUND_PLANKS,
    name: 'frostbound_planks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.FROSTBOUND_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new FrostboundPlanksBlockItem()]
  }
}
