import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CharredLogBlockItem } from '../../../../items/blocks/charred_log/CharredLogBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import charredLogTexUrl from './assets/charred_log.webp'

// Register texture for atlas
registerTextureUrl(TextureId.CHARRED_LOG, charredLogTexUrl)

const charredLogTexture = loadBlockTexture(charredLogTexUrl)
const charredLogMaterial = new THREE.MeshLambertMaterial({ map: charredLogTexture })

/**
 * Charred log - blackened, burnt wood with ember-orange cracks. Found in the
 * ruined frames of charred mining camps in volcanic biomes.
 *
 * Deliberately a plain SolidBlock (NOT a LogBlock subclass): charred structural
 * beams must not participate in tree-felling cluster collapse or sustain
 * leaves, so it stays out of LOG_BLOCK_IDS.
 */
export class CharredLogBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CHARRED_LOG,
    name: 'charred_log',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.2, // brittle burnt wood, slightly softer than fresh logs
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.CHARRED_LOG
  }

  protected getMaterials(): THREE.Material {
    return charredLogMaterial
  }

  getDrops(): IItem[] {
    return [new CharredLogBlockItem()]
  }
}
