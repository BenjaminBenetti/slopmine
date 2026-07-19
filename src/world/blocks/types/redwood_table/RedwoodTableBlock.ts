import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { RedwoodTableBlockItem } from '../../../../items/blocks/redwood_table/RedwoodTableBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { tableGeometry } from '../oak_table/TableGeometry.ts'

// Reuse the redwood planks texture (shared asset lives in the planks block dir)
import redwoodPlanksTexUrl from '../redwood_planks/assets/redwood-planks.webp'

const redwoodPlanksTexture = loadBlockTexture(redwoodPlanksTexUrl)
const redwoodTableMaterial = new THREE.MeshLambertMaterial({ map: redwoodPlanksTexture })

/**
 * Redwood table - a full-width top board on 4 corner legs.
 */
export class RedwoodTableBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_TABLE,
    name: 'redwood_table',
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
    return TextureId.REDWOOD_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return tableGeometry
  }

  protected getMaterials(): THREE.Material {
    return redwoodTableMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new RedwoodTableBlockItem()]
  }
}
