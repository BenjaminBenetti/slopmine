import { registerBlock } from '../../BlockRegistry.ts'
import { BlackIceBlock } from '../black_ice/BlackIceBlock.ts'
import { RimestoneBlock } from '../rimestone/RimestoneBlock.ts'
import { FrostedRimestoneBlock } from '../frosted_rimestone/FrostedRimestoneBlock.ts'
import { AshSnowBlock } from '../ash_snow/AshSnowBlock.ts'
import { GlacialIceBlock } from '../glacial_ice/GlacialIceBlock.ts'
import { PolishedIceBlock } from '../polished_ice/PolishedIceBlock.ts'
import { GlacialBrickBlock } from '../glacial_brick/GlacialBrickBlock.ts'
import { RimeCrystalOreBlock } from '../rime_crystal_ore/RimeCrystalOreBlock.ts'
import { FrozenMagmaBlock } from '../frozen_magma/FrozenMagmaBlock.ts'
import {
  EntombedUprightUpperBlock,
  EntombedUprightLowerBlock,
  EntombedLyingHeadBlock,
  EntombedLyingFeetBlock,
} from '../entombed_figure/EntombedFigureBlocks.ts'
import { FrostCrystalBlock } from '../frost_crystal/FrostCrystalBlock.ts'
import { IcicleBlock } from '../icicle/IcicleBlock.ts'
import { FrostLanternBlock } from '../frost_lantern/FrostLanternBlock.ts'
import { RimeBrazierBlock } from '../rime_brazier/RimeBrazierBlock.ts'
import { CarvedGlacialBrickBlock } from '../carved_glacial_brick/CarvedGlacialBrickBlock.ts'
import { FrostedGlacialBrickBlock } from '../frosted_glacial_brick/FrostedGlacialBrickBlock.ts'
import { IcePillarBlock } from '../ice_pillar/IcePillarBlock.ts'
import { GlacialTilesBlock } from '../glacial_tiles/GlacialTilesBlock.ts'
import { RimeGrateBlock } from '../rime_grate/RimeGrateBlock.ts'
import { RimeGlyphBlock } from '../rime_glyph/RimeGlyphBlock.ts'
import { FrostboundPlanksBlock } from '../frostbound_planks/FrostboundPlanksBlock.ts'
import { FrozenBookshelfBlock } from '../frozen_bookshelf/FrozenBookshelfBlock.ts'
import { GlacialBrickStairsBlock } from '../glacial_brick_stairs/GlacialBrickStairsBlock.ts'
import { GlacialBrickSlabBlock } from '../glacial_brick_slab/GlacialBrickSlabBlock.ts'
import { FrozenBannerBlock } from '../frozen_banner/FrozenBannerBlock.ts'
import { HangingFrostLanternBlock } from '../hanging_frost_lantern/HangingFrostLanternBlock.ts'
import { IceKnightStatueBlock } from '../ice_knight_statue/IceKnightStatueBlock.ts'

/**
 * Register the Cocytus (frozen Hell biome) blocks, ids 320-349. Called from
 * registerDefaultBlocks on the main thread and in every worker.
 */
export function registerCocytusBlocks(): void {
  registerBlock(new BlackIceBlock())
  registerBlock(new RimestoneBlock())
  registerBlock(new FrostedRimestoneBlock())
  registerBlock(new AshSnowBlock())
  registerBlock(new GlacialIceBlock())
  registerBlock(new PolishedIceBlock())
  registerBlock(new GlacialBrickBlock())
  registerBlock(new RimeCrystalOreBlock())
  registerBlock(new FrozenMagmaBlock())
  registerBlock(new EntombedUprightUpperBlock())
  registerBlock(new EntombedUprightLowerBlock())
  registerBlock(new EntombedLyingHeadBlock())
  registerBlock(new EntombedLyingFeetBlock())
  registerBlock(new FrostCrystalBlock())
  registerBlock(new IcicleBlock())
  registerBlock(new FrostLanternBlock())
  registerBlock(new RimeBrazierBlock())
  // Frozen Citadel castle kit (round 2)
  registerBlock(new CarvedGlacialBrickBlock())
  registerBlock(new FrostedGlacialBrickBlock())
  registerBlock(new IcePillarBlock())
  registerBlock(new GlacialTilesBlock())
  registerBlock(new RimeGrateBlock())
  registerBlock(new RimeGlyphBlock())
  registerBlock(new FrostboundPlanksBlock())
  registerBlock(new FrozenBookshelfBlock())
  registerBlock(new GlacialBrickStairsBlock())
  registerBlock(new GlacialBrickSlabBlock())
  registerBlock(new FrozenBannerBlock())
  registerBlock(new HangingFrostLanternBlock())
  registerBlock(new IceKnightStatueBlock())
}
