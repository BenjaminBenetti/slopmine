import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { InfernalChainBlockItem } from '../../../../items/blocks/infernal_chain/InfernalChainBlockItem.ts'
import { buildDecorGeometry, FLOOR, type DecorBox } from '../molten_decor/DecorGeometry.ts'

// Four alternating links per cell (open rings as two crossed frames)
const boxes: DecorBox[] = []
for (let i = 0; i < 4; i++) {
  const y = FLOOR + i * 0.25
  const turned = i % 2 === 1
  const w = turned ? 0.05 : 0.16
  const d = turned ? 0.16 : 0.05
  boxes.push({ w, h: 0.05, d, x: 0, y, z: 0, m: 0 })
  boxes.push({ w, h: 0.05, d, x: 0, y: y + 0.2, z: 0, m: 0 })
  boxes.push({ w: turned ? 0.05 : 0.04, h: 0.25, d: turned ? 0.04 : 0.05, x: turned ? 0 : -0.06, y, z: turned ? -0.06 : 0, m: 0 })
  boxes.push({ w: turned ? 0.05 : 0.04, h: 0.25, d: turned ? 0.04 : 0.05, x: turned ? 0 : 0.06, y, z: turned ? 0.06 : 0, m: 0 })
}
const geometry = buildDecorGeometry(boxes)
const materials = [new THREE.MeshLambertMaterial({ color: 0x3a3330 })]

/**
 * Infernal chain: heavy iron chain hanging through the cell - from bastion
 * ceilings, holding ember lanterns, in the prison cells. Walk-through.
 */
export class InfernalChainBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_CHAIN,
    name: 'infernal_chain',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_CHAIN
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  isGreedyMeshable(): boolean {
    return false
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.38, 0, 0.38), new THREE.Vector3(0.62, 1, 0.62))
  }

  getDrops(): IItem[] {
    return [new InfernalChainBlockItem()]
  }
}
