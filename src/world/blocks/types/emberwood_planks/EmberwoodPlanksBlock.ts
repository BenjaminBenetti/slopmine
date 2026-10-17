import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { EmberwoodPlanksBlockItem } from '../../../../items/blocks/emberwood_planks/EmberwoodPlanksBlockItem.ts'
import planksTexUrl from './assets/emberwood-planks.webp'

registerTextureUrl(TextureId.EMBERWOOD_PLANKS, planksTexUrl)

const planksMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(planksTexUrl) })

/** Emberwood planks - Hell's building wood, cut from emberwood stems. */
export class EmberwoodPlanksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.EMBERWOOD_PLANKS,
    name: 'emberwood_planks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.EMBERWOOD_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return planksMaterial
  }

  getDrops(): IItem[] {
    return [new EmberwoodPlanksBlockItem()]
  }
}
