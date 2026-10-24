import type { PoiKindId } from '../PoiCatalog.ts'
import type { PoiBuildDef } from '../PoiBuilder.ts'
import { ANCIENT_KINDS } from './ancient.ts'
import { TREASURE_KINDS } from './treasure.ts'
import { NATURE_KINDS } from './nature.ts'
import { DWELLING_KINDS } from './dwellings.ts'
import { WONDER_KINDS } from './wonders.ts'
import { RUIN_KINDS } from './ruins.ts'
import { SACRED_KINDS } from './sacred.ts'
import { OUTLAW_KINDS } from './outlaws.ts'
import { WILD_KINDS } from './wilds.ts'

/** Every point of interest's builder, by kind (a kind without a builder is never placed). */
export const POI_BUILD_DEFS: ReadonlyMap<PoiKindId, PoiBuildDef> = new Map(
  [
    ...ANCIENT_KINDS, ...TREASURE_KINDS, ...NATURE_KINDS, ...DWELLING_KINDS, ...WONDER_KINDS,
    ...RUIN_KINDS, ...SACRED_KINDS, ...OUTLAW_KINDS, ...WILD_KINDS,
  ].map((def) => [def.kind.id, def])
)
