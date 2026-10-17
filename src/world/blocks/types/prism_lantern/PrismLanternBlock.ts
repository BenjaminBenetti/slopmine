import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PrismLanternBlockItem } from '../../../../items/blocks/prism_lantern/PrismLanternBlockItem.ts'
import { mergeByMaterial, part, sanctumCrystalCoreMaterial, sanctumGoldMaterial, nonIndexed } from '../sanctum_shared/sanctumMaterials.ts'

// Hangs from the cell's top: a chain, a gold cage (plates + 4 bars) and a
// full-bright crystal heart inside.
const heart = new THREE.OctahedronGeometry(0.15)
heart.scale(1, 1.5, 1)
heart.translate(0, -0.08, 0)
const bars: THREE.BufferGeometry[] = []
for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
  bars.push(part(0.05, 0.42, 0.05, x, -0.08, z))
}
const geometry = mergeByMaterial([
  [
    part(0.06, 0.22, 0.06, 0, 0.39, 0), // chain
    part(0.44, 0.05, 0.44, 0, 0.15, 0), // top plate
    part(0.3, 0.06, 0.3, 0, 0.2, 0),
    part(0.44, 0.05, 0.44, 0, -0.31, 0), // bottom plate
    part(0.12, 0.08, 0.12, 0, -0.37, 0), // finial
    ...bars,
  ],
  [nonIndexed(heart)],
])
const materials = [sanctumGoldMaterial, sanctumCrystalCoreMaterial]

/**
 * Prism lantern - a gold-caged crystal heart hanging from a ceiling (light
 * 14): the main light of the Prism Sanctum's halls. Walk-through decor.
 */
export class PrismLanternBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PRISM_LANTERN,
    name: 'prism_lantern',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 1.0,
    lightLevel: 14,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.PRISM_LANTERN
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  shouldRenderFace(): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.27, 0.15, 0.27), new THREE.Vector3(0.73, 1, 0.73))
  }

  getDrops(): IItem[] {
    return [new PrismLanternBlockItem()]
  }
}
