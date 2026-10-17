import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { RimeCrystalItem } from '../../../../items/materials/rime_crystal/RimeCrystalItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/rime-crystal-ore.webp'

registerTextureUrl(TextureId.RIME_CRYSTAL_ORE, texUrl)
// The crystal flecks glow icy cyan; the rimestone around them stays dark
registerEmissiveTexture(TextureId.RIME_CRYSTAL_ORE, { strength: 1.4, threshold: 0.36 })

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Rime crystal ore - glowing icy-cyan crystal veins in the rimestone and lake
 * ice of Cocytus. The Hell-unique resource of the biome: needs a diamond
 * pickaxe (force 5) and drops 1-2 rime crystals (iceskin potions, hellbane
 * boots, frost lanterns).
 */
export class RimeCrystalOreBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.RIME_CRYSTAL_ORE,
    name: 'rime_crystal_ore',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // blockHP = 20 * 5 = 100; diamond pickaxe ~78 dps on rock -> ~1.3 s
    hardness: 20,
    lightLevel: 5,
    lightBlocking: 15,
    demolitionForceRequired: 5,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.RIME_CRYSTAL_ORE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    const count = 1 + (Math.random() < 0.4 ? 1 : 0)
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) drops.push(new RimeCrystalItem())
    return drops
  }
}
