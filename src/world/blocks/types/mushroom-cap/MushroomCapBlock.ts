import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { MushroomCapBlockItem } from '../../../../items/blocks/mushroom-cap/MushroomCapBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import mushroomCapTexUrl from './assets/mushroom-cap.webp'

// Register texture for atlas
registerTextureUrl(TextureId.MUSHROOM_CAP, mushroomCapTexUrl)

const mushroomCapTexture = loadBlockTexture(mushroomCapTexUrl)
const mushroomCapMaterial = new THREE.MeshLambertMaterial({ map: mushroomCapTexture })

export class MushroomCapBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MUSHROOM_CAP,
    name: 'mushroom_cap',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.MUSHROOM_CAP
  }

  protected getMaterials(): THREE.Material {
    return mushroomCapMaterial
  }

  getDrops(): IItem[] {
    return [new MushroomCapBlockItem()]
  }
}
