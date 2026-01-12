import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { MudBlockItem } from '../../../../items/blocks/mud/MudBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import mudTexUrl from './assets/mud.webp'

// Register texture for atlas
registerTextureUrl(TextureId.MUD, mudTexUrl)

const mudTexture = loadBlockTexture(mudTexUrl)
const mudMaterial = new THREE.MeshLambertMaterial({ map: mudTexture })

export class MudBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MUD,
    name: 'mud',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.MUD],
  }

  protected get defaultTextureId(): number {
    return TextureId.MUD
  }

  protected getMaterials(): THREE.Material {
    return mudMaterial
  }

  getDrops(): IItem[] {
    return [new MudBlockItem()]
  }
}
