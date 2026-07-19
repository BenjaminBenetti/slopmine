import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { RedwoodFenceBlockItem } from '../../../../items/blocks/redwood_fence/RedwoodFenceBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { fenceGeometry } from '../oak_fence/OakFenceBlock.ts'

// Fence blocks reuse their wood's planks texture (shared asset lives in the planks block dir)
import redwoodPlanksTexUrl from '../redwood_planks/assets/redwood-planks.webp'

// Load texture and create the module-level material for redwood fence
const redwoodPlanksTexture = loadBlockTexture(redwoodPlanksTexUrl)
const redwoodFenceMaterial = new THREE.MeshLambertMaterial({ map: redwoodPlanksTexture })

/**
 * Redwood fence - decorative post-and-rail barrier built from redwood planks.
 */
export class RedwoodFenceBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_FENCE,
    name: 'redwood_fence',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.REDWOOD_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return fenceGeometry
  }

  protected getMaterials(): THREE.Material {
    return redwoodFenceMaterial
  }

  getDrops(): IItem[] {
    return [new RedwoodFenceBlockItem()]
  }

  isGreedyMeshable(): boolean {
    return false
  }
}
