import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { LeafBlock, LEAF_DECAY_TICK_INTERVAL } from '../leaf_shared/LeafBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { RedwoodLeavesBlockItem } from '../../../../items/blocks/redwood_leaves/RedwoodLeavesBlockItem.ts'
import redwoodLeavesTexUrl from './assets/redwood-leaves.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.REDWOOD_LEAVES, redwoodLeavesTexUrl, true)

const redwoodLeavesTexture = loadBlockTexture(redwoodLeavesTexUrl)

const redwoodLeavesMaterial = new THREE.MeshLambertMaterial({
  map: redwoodLeavesTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class RedwoodLeavesBlock extends LeafBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_LEAVES,
    name: 'redwood_leaves',
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
    return TextureId.REDWOOD_LEAVES
  }

  protected getMaterials(): THREE.Material {
    return redwoodLeavesMaterial
  }

  getDrops(): IItem[] {
    return [new RedwoodLeavesBlockItem()]
  }
}
