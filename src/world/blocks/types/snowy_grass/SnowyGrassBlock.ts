import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { DirtBlockItem } from '../../../../items/blocks/dirt/DirtBlockItem.ts'
import snowyGrassTexUrl from './assets/snowy-grass.webp'
import snowyGrassSideTexUrl from './assets/snowy-grass-side.webp'
import dirtTexUrl from './assets/dirt.webp'

// Register textures for atlas (DIRT is registered by DirtBlock)
registerTextureUrl(TextureId.SNOWY_GRASS_TOP, snowyGrassTexUrl)
registerTextureUrl(TextureId.SNOWY_GRASS_SIDE, snowyGrassSideTexUrl)

const snowyGrassTexture = loadBlockTexture(snowyGrassTexUrl)
const dirtTexture = loadBlockTexture(dirtTexUrl)
const snowyGrassSideTexture = loadBlockTexture(snowyGrassSideTexUrl)

const snowyGrassMaterial = new THREE.MeshLambertMaterial({ map: snowyGrassTexture })
const dirtMaterial = new THREE.MeshLambertMaterial({ map: dirtTexture })
const snowyGrassSideMaterial = new THREE.MeshLambertMaterial({ map: snowyGrassSideTexture })

/**
 * Snow-dusted grass covering the pine forest's surface above the alpine
 * snow line (see src/world/generate/biomes/pineForestConstants.ts).
 * Mirrors GrassBlock: snowy top, snowy sides, dirt bottom, same drops.
 */
export class SnowyGrassBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SNOWY_GRASS,
    name: 'snowy_grass',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.SNOWY_GRASS_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      snowyGrassSideMaterial, // +X (right)
      snowyGrassSideMaterial, // -X (left)
      snowyGrassMaterial,     // +Y (top)
      dirtMaterial,           // -Y (bottom)
      snowyGrassSideMaterial, // +Z (front)
      snowyGrassSideMaterial, // -Z (back)
    ]
  }

  /**
   * Return texture ID for each face for greedy meshing.
   * TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: return TextureId.SNOWY_GRASS_TOP   // TOP
      case 1: return TextureId.DIRT              // BOTTOM (same as dirt block)
      default: return TextureId.SNOWY_GRASS_SIDE // All sides
    }
  }

  getDrops(): IItem[] {
    // Same drops as grass: dirt
    return [new DirtBlockItem()]
  }
}
