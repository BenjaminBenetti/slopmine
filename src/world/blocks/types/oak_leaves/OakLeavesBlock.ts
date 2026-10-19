import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { LeafBlock, LEAF_DECAY_TICK_INTERVAL } from '../leaf_shared/LeafBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { OakLeavesBlockItem } from '../../../../items/blocks/oak_leaves/OakLeavesBlockItem.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import oakLeavesTexUrl from './assets/oak-leaves.webp'

// Register texture
registerTextureUrl(TextureId.OAK_LEAVES, oakLeavesTexUrl)

const oakLeavesTexture = loadBlockTexture(oakLeavesTexUrl)

const oakLeavesMaterial = new THREE.MeshLambertMaterial({
  map: oakLeavesTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/** Chance a mined or decaying oak leaf drops an oak sapling. */
const OAK_SAPLING_CHANCE = 0.06

export class OakLeavesBlock extends LeafBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_LEAVES,
    name: 'oak_leaves',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.05,
    lightLevel: 0,
    lightBlocking: 1,
    demolitionForceRequired: 0,
    tags: [BlockTags.LEAVES],
    tickInterval: LEAF_DECAY_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.OAK_LEAVES
  }

  protected getMaterials(): THREE.Material {
    return oakLeavesMaterial
  }

  getDrops(): IItem[] {
    return Math.random() < OAK_SAPLING_CHANCE
      ? [new OakLeavesBlockItem(), new PlantBlockItem('oak_sapling', 'Oak Sapling')]
      : [new OakLeavesBlockItem()]
  }

  protected getDecayDrops(): IItem[] {
    return Math.random() < OAK_SAPLING_CHANCE ? [new PlantBlockItem('oak_sapling', 'Oak Sapling')] : []
  }
}
