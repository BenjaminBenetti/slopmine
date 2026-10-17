import * as THREE from 'three'
import type { IBlock, IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CrystalGlassBlockItem } from '../../../../items/blocks/crystal_glass/CrystalGlassBlockItem.ts'
import texUrl from './assets/crystal-glass.webp'

registerTextureUrl(TextureId.CRYSTAL_GLASS, texUrl)

const INSET = 0.002
const geometry = new THREE.BoxGeometry(1 - INSET * 2, 1 - INSET * 2, 1 - INSET * 2)
const material = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(texUrl),
  transparent: true,
  opacity: 0.72,
  side: THREE.DoubleSide,
})

/**
 * Crystal glass - violet stained crystal panes in dark leading: the windows,
 * transoms and oculi of the Prism Sanctum. Part of the walls, so it is a
 * dungeon structural block (force 6) - the way in stays the door.
 */
export class CrystalGlassBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRYSTAL_GLASS,
    name: 'crystal_glass',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 40.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRYSTAL_GLASS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    if (neighbor.properties.isOpaque) return false
    return neighbor.properties.id !== BlockIds.CRYSTAL_GLASS
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new CrystalGlassBlockItem()]
  }
}
