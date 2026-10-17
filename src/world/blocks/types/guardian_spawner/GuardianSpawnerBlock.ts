import * as THREE from 'three'
import type { BlockFace, IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GuardianSpawnerBlockEntity } from './GuardianSpawnerBlockEntity.ts'
import topTexUrl from './assets/guardian-spawner-top.webp'
import sideTexUrl from './assets/guardian-spawner-side.webp'

registerTextureUrl(TextureId.GUARDIAN_SPAWNER_TOP, topTexUrl)
registerTextureUrl(TextureId.GUARDIAN_SPAWNER_SIDE, sideTexUrl)
// The ember runes glow in the dark (the stone around them does not)
registerEmissiveTexture(TextureId.GUARDIAN_SPAWNER_TOP, { strength: 1.6, threshold: 0.1 })
registerEmissiveTexture(TextureId.GUARDIAN_SPAWNER_SIDE, { strength: 1.6, threshold: 0.1 })

const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(topTexUrl) })
const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sideTexUrl) })

/**
 * Guardian spawner - an ominous dark altar carved with glowing ember runes,
 * placed by dungeon features in each boss arena with the guardian's index in
 * its metadata (see src/dungeons/GuardianRegistry.ts). When the player comes
 * near, it summons the guardian; once the guardian falls it turns into the
 * cold, cracked GUARDIAN_SPAWNER_SPENT. Dungeon-structural: infernium-tier
 * force and very hard; never drops anything.
 */
export class GuardianSpawnerBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GUARDIAN_SPAWNER,
    name: 'guardian_spawner',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // blockHP = 200 * 5 = 1000: a long dig even with infernium tools
    hardness: 200.0,
    lightLevel: 7, // the runes cast an ominous glow
    lightBlocking: 15,
    demolitionForceRequired: 6, // infernium (dungeon structural)
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GUARDIAN_SPAWNER_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial]
  }

  /** TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5 */
  getTextureForFace(face: BlockFace): number {
    return face === 0 ? TextureId.GUARDIAN_SPAWNER_TOP : TextureId.GUARDIAN_SPAWNER_SIDE
  }

  getDrops(): IItem[] {
    return []
  }

  createBlockEntity(position: IWorldCoordinate, _world: IWorld): IBlockEntity {
    return new GuardianSpawnerBlockEntity(position)
  }
}
