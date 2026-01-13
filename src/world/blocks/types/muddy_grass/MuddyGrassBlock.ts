import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { MudBlockItem } from '../../../../items/blocks/mud/MudBlockItem.ts'
import muddyGrassTopTexUrl from './assets/muddy_grass_top.webp'
import muddyGrassSideTexUrl from './assets/muddy_grass_side.webp'
import mudTexUrl from '../mud/assets/mud.webp'

// Register textures for atlas
registerTextureUrl(TextureId.MUDDY_GRASS_TOP, muddyGrassTopTexUrl)
registerTextureUrl(TextureId.MUDDY_GRASS_SIDE, muddyGrassSideTexUrl)

const muddyGrassTopTexture = loadBlockTexture(muddyGrassTopTexUrl)
const muddyGrassSideTexture = loadBlockTexture(muddyGrassSideTexUrl)
const mudTexture = loadBlockTexture(mudTexUrl)

const muddyGrassTopMaterial = new THREE.MeshLambertMaterial({ map: muddyGrassTopTexture })
const muddyGrassSideMaterial = new THREE.MeshLambertMaterial({ map: muddyGrassSideTexture })
const mudMaterial = new THREE.MeshLambertMaterial({ map: mudTexture })

export class MuddyGrassBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MUDDY_GRASS,
    name: 'muddy_grass',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.4,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.MUDDY_GRASS_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      muddyGrassSideMaterial, // +X (right)
      muddyGrassSideMaterial, // -X (left)
      muddyGrassTopMaterial,  // +Y (top)
      mudMaterial,            // -Y (bottom)
      muddyGrassSideMaterial, // +Z (front)
      muddyGrassSideMaterial, // -Z (back)
    ]
  }

  /**
   * Return texture ID for each face for greedy meshing.
   * TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: return TextureId.MUDDY_GRASS_TOP  // TOP
      case 1: return TextureId.MUD              // BOTTOM (same as mud block)
      default: return TextureId.MUDDY_GRASS_SIDE // All sides
    }
  }

  getDrops(): IItem[] {
    // Muddy grass drops mud (like grass drops dirt)
    return [new MudBlockItem()]
  }
}
