import { BlockIds } from '../../../../blocks/BlockIds.ts'
import type { DungeonKit } from '../../DungeonTypes.ts'
import { registerDungeonKit } from '../../DungeonKitRegistry.ts'
import { defaultBaseY } from '../../LayoutGenerator.ts'
import { INFERNAL_BASTION } from './BastionConfig.ts'
import { CS, FH } from './BastionBuild.ts'
import { BASTION_MODULES } from './BastionModules.ts'
import { bastionExterior, bastionFoundation } from './BastionPasses.ts'
import { BASTION_EXTERIOR_MARGIN } from './BastionGeometry.ts'

/**
 * The Infernal Bastion - the Pyre Tyrant's war-forge fortress in the
 * Molten Wastes, grown procedurally from the modules in BastionModules.ts:
 * a walled bailey on a brick plinth (standing in the lava sea, or cut into
 * the badlands), a portcullis gatehouse and a causeway, barracks, forge,
 * kennels and armories around open yards, keep halls above them, an
 * undercroft of prisons, lava cisterns, treasury and vaults below, the
 * obsidian citadel spire as the landmark, and the Throne Crucible - the
 * boss arena - at the deepest point.
 *
 * Loot tiers (block under each chest; tables in src/molten/InfernalBastionLoot.ts):
 * 0 infernal tiles (stores near the gate), 1 charred planks (deeper rooms),
 * 2 gilded infernal bricks (treasury, forge), 3 obsidian bricks (vaults).
 */
export const infernalBastionKit: DungeonKit = {
  id: INFERNAL_BASTION.kitId,
  cellSize: CS,
  floorHeight: FH,
  gridRadius: 5,
  levels: [-1, 3],
  // Under the Hell ceiling: sub-chunk 4 (Y 128+) belongs to the surface biome
  worldYRange: [4, 126],
  modules: BASTION_MODULES,
  targetModules: [24, 34],
  require: [
    { tag: 'garrison', count: 4 },
    { tag: 'vault', count: 1 },
    { tag: 'treasury', count: 1 },
    { tag: 'landmark', count: 1 },
    { tag: 'courtyard', count: 1 },
  ],
  palette: {
    wall: [
      [BlockIds.INFERNAL_BRICKS, 70],
      [BlockIds.CRACKED_INFERNAL_BRICKS, 16],
      [BlockIds.SCORCHED_INFERNAL_BRICKS, 14],
    ],
    wallDark: [
      [BlockIds.SCORCHED_INFERNAL_BRICKS, 60],
      [BlockIds.INFERNAL_BRICKS, 25],
      [BlockIds.CRACKED_INFERNAL_BRICKS, 15],
    ],
    roof: [
      [BlockIds.SCORCHED_INFERNAL_BRICKS, 80],
      [BlockIds.CRACKED_INFERNAL_BRICKS, 20],
    ],
    rubble: [
      [BlockIds.CRACKED_INFERNAL_BRICKS, 60],
      [BlockIds.SCORCHED_INFERNAL_BRICKS, 40],
    ],
    trim: BlockIds.INFERNAL_BRICK_PILLAR,
    floor: BlockIds.INFERNAL_TILES,
    planks: BlockIds.CHARRED_PLANKS,
    obsidian: BlockIds.OBSIDIAN_BRICKS,
    gilded: BlockIds.GILDED_INFERNAL_BRICKS,
    magma: BlockIds.MAGMA_BRICKS,
    glyph: BlockIds.EMBER_GLYPH,
    ash: BlockIds.HELL_ASH,
    foundation: [
      [BlockIds.INFERNAL_BRICKS, 75],
      [BlockIds.CRACKED_INFERNAL_BRICKS, 25],
    ],
    light: BlockIds.EMBER_LANTERN,
  },
  door: [3, 4],
  lootTierBlocks: [
    BlockIds.INFERNAL_TILES,
    BlockIds.CHARRED_PLANKS,
    BlockIds.GILDED_INFERNAL_BRICKS,
    BlockIds.OBSIDIAN_BRICKS,
  ],
  exteriorMargin: BASTION_EXTERIOR_MARGIN,
  foundationDepth: 48,
  exteriorHeight: 16,
  maxAttempts: 40,
  // A few blocks above the lava sea; badland castles sit on their ground
  baseY: defaultBaseY,
  baseYRange: [50, 68],
  tierFor(module, layout) {
    const tags = module.def.tags ?? []
    if (tags.includes('boss') || tags.includes('vault')) return 3
    if (tags.includes('treasury') || tags.includes('forge')) return 2
    return module.depth * 2 > layout.maxDepth ? 1 : 0
  },
  foundation: bastionFoundation,
  exterior: bastionExterior,
}

registerDungeonKit(infernalBastionKit)
