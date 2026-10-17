import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GeodeCrustBlockItem } from '../../../../items/blocks/geode_crust/GeodeCrustBlockItem.ts'
import texUrl from './assets/geode-crust.webp'

registerTextureUrl(TextureId.GEODE_CRUST, texUrl)

const texture = loadBlockTexture(texUrl)
const material = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Geode crust - the pale calcite shell around Crystal Abyss geodes.
 */
export class GeodeCrustBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GEODE_CRUST,
    name: 'geode_crust',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 4.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GEODE_CRUST
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new GeodeCrustBlockItem()]
  }
}
