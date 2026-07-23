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
import geyserTexUrl from './assets/geyser.webp'

// Register texture for atlas
registerTextureUrl(TextureId.GEYSER, geyserTexUrl)

const geyserTexture = loadBlockTexture(geyserTexUrl)
const geyserMaterial = new THREE.MeshLambertMaterial({ map: geyserTexture })

/**
 * Geyser block (dormant) - a cracked basalt vent found on volcanic surfaces.
 * A faint ember glow smolders in the central cracks. Periodically erupts
 * (driven by the GeyserSystem main-thread task): the block swaps to
 * GEYSER_ACTIVE as a warning, then blasts anything in the vent column upward.
 */
export class GeyserBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GEYSER,
    name: 'geyser',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 2, // Dim ember glow from the dormant cracks
    lightBlocking: 15,
    demolitionForceRequired: 1, // Requires pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GEYSER
  }

  protected getMaterials(): THREE.Material {
    return geyserMaterial
  }

  getDrops(): IItem[] {
    return [new GeyserBlockItem()]
  }
}
