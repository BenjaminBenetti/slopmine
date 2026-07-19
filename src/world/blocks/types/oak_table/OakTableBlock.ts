import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { OakTableBlockItem } from '../../../../items/blocks/oak_table/OakTableBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { tableGeometry } from './TableGeometry.ts'

// Reuse the oak planks texture (shared asset lives in the planks block dir)
import oakPlanksTexUrl from '../oak_planks/assets/oak-planks.webp'

const oakPlanksTexture = loadBlockTexture(oakPlanksTexUrl)
const oakTableMaterial = new THREE.MeshLambertMaterial({ map: oakPlanksTexture })

/**
 * Oak table - a full-width top board on 4 corner legs.
 */
export class OakTableBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_TABLE,
    name: 'oak_table',
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
    return TextureId.OAK_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return tableGeometry
  }

  protected getMaterials(): THREE.Material {
    return oakTableMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new OakTableBlockItem()]
  }
}
