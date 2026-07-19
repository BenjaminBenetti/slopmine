import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PineTableBlockItem } from '../../../../items/blocks/pine_table/PineTableBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { tableGeometry } from '../oak_table/TableGeometry.ts'

// Reuse the pine planks texture (shared asset lives in the planks block dir)
import pinePlanksTexUrl from '../pine_planks/assets/pine-planks.webp'

const pinePlanksTexture = loadBlockTexture(pinePlanksTexUrl)
const pineTableMaterial = new THREE.MeshLambertMaterial({ map: pinePlanksTexture })

/**
 * Pine table - a full-width top board on 4 corner legs.
 */
export class PineTableBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_TABLE,
    name: 'pine_table',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.8,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.PINE_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return tableGeometry
  }

  protected getMaterials(): THREE.Material {
    return pineTableMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new PineTableBlockItem()]
  }
}
