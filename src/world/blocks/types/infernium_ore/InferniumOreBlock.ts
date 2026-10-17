import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { RawInferniumItem } from '../../../../items/ores/infernium/RawInferniumItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import inferniumOreTexUrl from './assets/infernium-ore.webp'

registerTextureUrl(TextureId.INFERNIUM_ORE, inferniumOreTexUrl)
// The molten-gold veins glow (only they: the dark rock stays below threshold)
registerEmissiveTexture(TextureId.INFERNIUM_ORE, { strength: 1.4, threshold: 0.45 })

const inferniumOreMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(inferniumOreTexUrl) })

/**
 * Infernium ore: dark hell rock shot through with glowing molten-gold veins,
 * found in the Molten Wastes (deep, richest under the lava sea and in the
 * roots of the great pillars). The progression pull into Hell: it needs a
 * diamond pickaxe (force 5) and smelts into the tier 6 metal.
 *
 * Its veins glow (emissive texels) and it emits a faint light (3) so a vein
 * in a cliff or a cave wall can be spotted from a distance in the dark.
 */
export class InferniumOreBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNIUM_ORE,
    name: 'infernium_ore', // DESIGN §11: the journal listens for this name
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 6.0,
    lightLevel: 3,
    lightBlocking: 15,
    demolitionForceRequired: 5, // diamond pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNIUM_ORE
  }

  protected getMaterials(): THREE.Material {
    return inferniumOreMaterial
  }

  getDrops(): IItem[] {
    return [new RawInferniumItem()]
  }
}
