import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { MirrorPanelBlockItem } from '../../../../items/blocks/mirror_panel/MirrorPanelBlockItem.ts'
import texUrl from './assets/mirror-panel.webp'

registerTextureUrl(TextureId.MIRROR_PANEL, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Mirror panel - a gold-framed polished mirror panel lining the prism galleries
 * and the lens chamber. Dungeon structural block (force 6).
 * Drops itself (a building block for the player); hardness keeps breaking
 * in slow even with infernium tools.
 */
export class MirrorPanelBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MIRROR_PANEL,
    name: 'mirror_panel',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.MIRROR_PANEL
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new MirrorPanelBlockItem()]
  }
}
