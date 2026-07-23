import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GeyserBlockItem } from '../../../../items/blocks/geyser/GeyserBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import geyserActiveTexUrl from './assets/geyser_active.webp'

// Register texture for atlas
registerTextureUrl(TextureId.GEYSER_ACTIVE, geyserActiveTexUrl)

const geyserActiveTexture = loadBlockTexture(geyserActiveTexUrl)
const geyserActiveMaterial = new THREE.MeshLambertMaterial({ map: geyserActiveTexture })

/**
 * Geyser block (erupting) - the transient hot state of a GEYSER vent while it
 * erupts. Bright white-hot cracks and strong light emission warn the player
 * before the upward blast. The GeyserSystem reverts it to GEYSER after the
 * eruption; mining it just drops the regular geyser block item.
 */
export class GeyserActiveBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GEYSER_ACTIVE,
    name: 'geyser_active',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 10, // Blazing molten glow while erupting
    lightBlocking: 15,
    demolitionForceRequired: 1, // Requires pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GEYSER_ACTIVE
  }

  protected getMaterials(): THREE.Material {
    return geyserActiveMaterial
  }

  getDrops(): IItem[] {
    // Reverts to (and drops as) the dormant geyser block
    return [new GeyserBlockItem()]
  }
}
