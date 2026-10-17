import type { IWorld } from '../interfaces/IBlock.ts'
import type { IItem } from '../../items/Item.ts'

/**
 * Worldgen chest loot tables.
 *
 * Worldgen chests are written by the generation workers as a bare CHEST id;
 * their contents are rolled lazily on first open (ChestBlock.
 * prepareInteractionState). Which table applies is decided by a *signature*:
 * a block that only the owning structure places, found within the table's
 * radius of the chest (e.g. CHARRED_LOG around a charred mining camp). Rolls
 * are deterministic from the chest's world position, so a chest always holds
 * the same loot, independent of the world seed and of when it is opened.
 *
 * Tables are registered on the MAIN thread only (main.ts); in workers this
 * registry stays empty and is never consulted. Keep this module free of heavy
 * imports (no ItemRegistry, no renderer) - the chest block, and so this file,
 * is bundled into every worker.
 */

/** One stack of rolled loot. */
export interface LootStack {
  readonly item: IItem
  readonly count: number
}

/**
 * Deterministic [0,1) roll for this chest: the same salt always gives the
 * same value at the same position. Use a distinct salt per decision.
 */
export type LootRoll = (salt: number) => number

export interface ChestLootTable {
  /** Unique id, e.g. 'charred-camp' or 'infernal-bastion'. */
  readonly id: string
  /** Block ids whose presence near the chest marks it as this table's. */
  readonly signatureBlocks: readonly number[]
  /** Chebyshev radius (blocks) of the signature scan; keep it small (≤ 8). */
  readonly signatureRadius: number
  /**
   * Higher wins when several tables' signatures are near one chest
   * (e.g. a dungeon vault table over its biome's generic ruin table).
   * Default 0.
   */
  readonly priority?: number
  /** Roll the chest's contents. Return [] for an intentionally empty chest. */
  roll(roll: LootRoll, x: number, y: number, z: number): LootStack[]
}

const tables: ChestLootTable[] = []

/** Register a loot table (main thread, at startup). Ids must be unique. */
export function registerChestLootTable(table: ChestLootTable): void {
  if (tables.some(t => t.id === table.id)) {
    throw new Error(`Chest loot table '${table.id}' is already registered`)
  }
  tables.push(table)
  tables.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

export function getChestLootTables(): readonly ChestLootTable[] {
  return tables
}

/**
 * Deterministic [0,1) hash of world position + salt (integer avalanche mix,
 * same style as the worldgen features' positionRandom / cave lining hash).
 * Seed-independent: a given chest position always rolls the same loot.
 */
export function lootHash01(x: number, y: number, z: number, salt: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 1610612741) ^
    Math.imul(salt | 0, 1013904223)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Find the highest-priority table whose signature block lies within its
 * radius of (x, y, z). One scan over the largest radius serves every table.
 */
export function findChestLootTable(
  world: IWorld,
  x: bigint,
  y: bigint,
  z: bigint
): ChestLootTable | null {
  if (tables.length === 0 || !world.getBlockId) return null

  let maxRadius = 0
  for (const table of tables) maxRadius = Math.max(maxRadius, table.signatureRadius)

  // Closest Chebyshev distance at which each signature block id was seen
  const nearest = new Map<number, number>()
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dz = -maxRadius; dz <= maxRadius; dz++) {
      for (let dx = -maxRadius; dx <= maxRadius; dx++) {
        const id = world.getBlockId(x + BigInt(dx), y + BigInt(dy), z + BigInt(dz))
        const d = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
        const seen = nearest.get(id)
        if (seen === undefined || d < seen) nearest.set(id, d)
      }
    }
  }

  // tables are kept sorted by priority (highest first)
  for (const table of tables) {
    for (const blockId of table.signatureBlocks) {
      const d = nearest.get(blockId)
      if (d !== undefined && d <= table.signatureRadius) return table
    }
  }
  return null
}

/** Minimal slot surface of a chest state (ChestBlockState satisfies it). */
export interface ILootSlots {
  getSlotCount(): number
  getStack(index: number): { item: IItem; count: number } | null
  setStack(index: number, stack: { item: IItem; count: number } | null): void
}

/**
 * Scatter rolled stacks over the chest's slots (deterministic slot picks
 * with linear probing) so a chest reads as a packed cache, not a list.
 * Stacks larger than the item's max stack size are split.
 */
export function scatterLoot(
  slots: ILootSlots,
  stacks: readonly LootStack[],
  roll: LootRoll
): void {
  const slotCount = slots.getSlotCount()
  let n = 0
  for (const stack of stacks) {
    let remaining = stack.count
    while (remaining > 0) {
      const count = Math.min(remaining, stack.item.maxStackSize)
      remaining -= count
      let slot = Math.floor(roll(1000 + n++) * slotCount)
      let placed = false
      for (let probe = 0; probe < slotCount; probe++) {
        if (!slots.getStack(slot)) {
          slots.setStack(slot, { item: stack.item, count })
          placed = true
          break
        }
        slot = (slot + 1) % slotCount
      }
      if (!placed) return // chest full
    }
  }
}

/**
 * Roll and place a table's loot into an (empty) chest at (x, y, z).
 */
export function fillChestFromTable(
  table: ChestLootTable,
  slots: ILootSlots,
  x: bigint,
  y: bigint,
  z: bigint
): void {
  const xi = Number(x)
  const yi = Number(y)
  const zi = Number(z)
  const roll: LootRoll = salt => lootHash01(xi, yi, zi, salt)
  scatterLoot(slots, table.roll(roll, xi, yi, zi), roll)
}
