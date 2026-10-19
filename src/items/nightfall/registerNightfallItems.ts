import type { IItem } from '../Item.ts'
import { WitchstrawItem } from '../materials/witchstraw/WitchstrawItem.ts'
import { MothDustItem } from '../materials/moth_dust/MothDustItem.ts'
import { SandmawFangItem } from '../materials/sandmaw_fang/SandmawFangItem.ts'
import { CinderCoreItem } from '../materials/cinder_core/CinderCoreItem.ts'
import { AnglerLureItem } from '../materials/angler_lure/AnglerLureItem.ts'
import { GhostAntlerItem } from '../materials/ghost_antler/GhostAntlerItem.ts'
import { MantisScytheItem } from '../materials/mantis_scythe/MantisScytheItem.ts'
import { WardLanternBlockItem } from '../blocks/ward_lantern/WardLanternBlockItem.ts'
import { FoxfireMushroomBlockItem } from '../blocks/foxfire_mushroom/FoxfireMushroomBlockItem.ts'
import { FoxfireMushroomCapBlockItem } from '../blocks/foxfire_mushroom_cap/FoxfireMushroomCapBlockItem.ts'
import { AmberMushroomBlockItem } from '../blocks/amber_mushroom/AmberMushroomBlockItem.ts'
import { AmberMushroomCapBlockItem } from '../blocks/amber_mushroom_cap/AmberMushroomCapBlockItem.ts'
import { GlowmossBlockItem } from '../blocks/glowmoss/GlowmossBlockItem.ts'
import { GlimmercapBlockItem } from '../blocks/glimmercap/GlimmercapBlockItem.ts'
import { LumenFernBlockItem } from '../blocks/lumen_fern/LumenFernBlockItem.ts'
import { GlowkelpBlockItem } from '../blocks/glowkelp/GlowkelpBlockItem.ts'
import { LanternweedBlockItem } from '../blocks/lanternweed/LanternweedBlockItem.ts'

/**
 * Register the day-and-night items - the night creatures' trophies (tag
 * `night_trophy`), the Ward Lantern and the swamp's bioluminescent blocks
 * (foxfire and amber mushrooms, glowmoss, glimmercap, lumen fern, glowkelp,
 * lanternweed) - with the
 * persistence item registry (the registrar is ItemRegistry's
 * registerItemFactory, passed in to keep this module free of a circular
 * import).
 */
export function registerNightfallItems(register: (id: string, factory: () => IItem) => void): void {
  register('witchstraw', () => new WitchstrawItem())
  register('moth_dust', () => new MothDustItem())
  register('sandmaw_fang', () => new SandmawFangItem())
  register('cinder_core', () => new CinderCoreItem())
  register('angler_lure', () => new AnglerLureItem())
  register('ghost_antler', () => new GhostAntlerItem())
  register('mantis_scythe', () => new MantisScytheItem())
  register('ward_lantern_block', () => new WardLanternBlockItem())
  register('foxfire_mushroom_block', () => new FoxfireMushroomBlockItem())
  register('foxfire_mushroom_cap_block', () => new FoxfireMushroomCapBlockItem())
  register('amber_mushroom_block', () => new AmberMushroomBlockItem())
  register('amber_mushroom_cap_block', () => new AmberMushroomCapBlockItem())
  register('glowmoss_block', () => new GlowmossBlockItem())
  register('glimmercap_block', () => new GlimmercapBlockItem())
  register('lumen_fern_block', () => new LumenFernBlockItem())
  register('glowkelp_block', () => new GlowkelpBlockItem())
  register('lanternweed_block', () => new LanternweedBlockItem())
}
