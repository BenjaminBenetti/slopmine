import type { IItem } from '../Item.ts'
import { BlackIceBlockItem } from '../blocks/black_ice/BlackIceBlockItem.ts'
import { RimestoneBlockItem } from '../blocks/rimestone/RimestoneBlockItem.ts'
import { AshSnowBlockItem } from '../blocks/ash_snow/AshSnowBlockItem.ts'
import { GlacialIceBlockItem } from '../blocks/glacial_ice/GlacialIceBlockItem.ts'
import { PolishedIceBlockItem } from '../blocks/polished_ice/PolishedIceBlockItem.ts'
import { GlacialBrickBlockItem } from '../blocks/glacial_brick/GlacialBrickBlockItem.ts'
import { FrozenMagmaBlockItem } from '../blocks/frozen_magma/FrozenMagmaBlockItem.ts'
import { FrostCrystalBlockItem } from '../blocks/frost_crystal/FrostCrystalBlockItem.ts'
import { FrostLanternBlockItem } from '../blocks/frost_lantern/FrostLanternBlockItem.ts'
import { RimeCrystalItem } from '../materials/rime_crystal/RimeCrystalItem.ts'
import { RimeSigilItem } from '../materials/rime_sigil/RimeSigilItem.ts'
import { CarvedGlacialBrickBlockItem } from '../blocks/carved_glacial_brick/CarvedGlacialBrickBlockItem.ts'
import { FrostedGlacialBrickBlockItem } from '../blocks/frosted_glacial_brick/FrostedGlacialBrickBlockItem.ts'
import { IcePillarBlockItem } from '../blocks/ice_pillar/IcePillarBlockItem.ts'
import { GlacialTilesBlockItem } from '../blocks/glacial_tiles/GlacialTilesBlockItem.ts'
import { RimeGrateBlockItem } from '../blocks/rime_grate/RimeGrateBlockItem.ts'
import { FrostboundPlanksBlockItem } from '../blocks/frostbound_planks/FrostboundPlanksBlockItem.ts'
import { FrozenBookshelfBlockItem } from '../blocks/frozen_bookshelf/FrozenBookshelfBlockItem.ts'
import { GlacialBrickStairsBlockItem } from '../blocks/glacial_brick_stairs/GlacialBrickStairsBlockItem.ts'
import { GlacialBrickSlabBlockItem } from '../blocks/glacial_brick_slab/GlacialBrickSlabBlockItem.ts'
import { FrozenBannerBlockItem } from '../blocks/frozen_banner/FrozenBannerBlockItem.ts'
import { IceKnightStatueBlockItem } from '../blocks/ice_knight_statue/IceKnightStatueBlockItem.ts'

/**
 * Register every Cocytus item with the persistence item registry (the
 * registrar is ItemRegistry's registerItemFactory, passed in to keep this
 * module free of a circular import).
 */
export function registerCocytusItems(register: (id: string, factory: () => IItem) => void): void {
  register('black_ice_block', () => new BlackIceBlockItem())
  register('rimestone_block', () => new RimestoneBlockItem())
  register('ash_snow_block', () => new AshSnowBlockItem())
  register('glacial_ice_block', () => new GlacialIceBlockItem())
  register('polished_ice_block', () => new PolishedIceBlockItem())
  register('glacial_brick_block', () => new GlacialBrickBlockItem())
  register('frozen_magma_block', () => new FrozenMagmaBlockItem())
  register('frost_crystal_block', () => new FrostCrystalBlockItem())
  register('frost_lantern_block', () => new FrostLanternBlockItem())
  register('rime_crystal', () => new RimeCrystalItem())
  register('rime_sigil', () => new RimeSigilItem())
  register('carved_glacial_brick_block', () => new CarvedGlacialBrickBlockItem())
  register('frosted_glacial_brick_block', () => new FrostedGlacialBrickBlockItem())
  register('ice_pillar_block', () => new IcePillarBlockItem())
  register('glacial_tiles_block', () => new GlacialTilesBlockItem())
  register('rime_grate_block', () => new RimeGrateBlockItem())
  register('frostbound_planks_block', () => new FrostboundPlanksBlockItem())
  register('frozen_bookshelf_block', () => new FrozenBookshelfBlockItem())
  register('glacial_brick_stairs_block', () => new GlacialBrickStairsBlockItem())
  register('glacial_brick_slab_block', () => new GlacialBrickSlabBlockItem())
  register('frozen_banner_block', () => new FrozenBannerBlockItem())
  register('ice_knight_statue_block', () => new IceKnightStatueBlockItem())
}
