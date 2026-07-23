import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { ColumnarBasaltBlockItem } from '../../../../items/blocks/columnar_basalt/ColumnarBasaltBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import columnarBasaltSideTexUrl from './assets/columnar-basalt-side.webp'
import columnarBasaltTopTexUrl from './assets/columnar-basalt-top.webp'

// Register textures for atlas
registerTextureUrl(TextureId.COLUMNAR_BASALT_SIDE, columnarBasaltSideTexUrl)
registerTextureUrl(TextureId.COLUMNAR_BASALT_TOP, columnarBasaltTopTexUrl)

const sideTexture = loadBlockTexture(columnarBasaltSideTexUrl)
const topTexture = loadBlockTexture(columnarBasaltTopTexUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: sideTexture })
const topMaterial = new THREE.MeshLambertMaterial({ map: topTexture })

/**
 * Columnar basalt - packed hexagonal basalt columns (Giant's Causeway style).
 * Used by BasaltColumnsFeature pillars so they stand out against plain basalt
 * ground: vertical fluted column sides, honeycomb of column ends on top/bottom.
 */
export class ColumnarBasaltBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.COLUMNAR_BASALT,
    name: 'columnar_basalt',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.25,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1, // Requires pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.COLUMNAR_BASALT_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      sideMaterial, // +X (right) - fluted column sides
      sideMaterial, // -X (left) - fluted column sides
      topMaterial,  // +Y (top) - hexagonal column ends
      topMaterial,  // -Y (bottom) - hexagonal column ends
      sideMaterial, // +Z (front) - fluted column sides
      sideMaterial, // -Z (back) - fluted column sides
    ]
  }

  /**
   * Return texture ID for each face for greedy meshing.
   * TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: // TOP
      case 1: // BOTTOM
        return TextureId.COLUMNAR_BASALT_TOP
      default:
        return TextureId.COLUMNAR_BASALT_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new ColumnarBasaltBlockItem()]
  }
}
