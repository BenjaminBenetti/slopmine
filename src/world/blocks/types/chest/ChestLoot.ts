import type { IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { CoalItem } from '../../../../items/ores/coal/CoalItem.ts'
import { IronOreItem } from '../../../../items/ores/iron/IronOreItem.ts'
import { CopperOreItem } from '../../../../items/ores/copper/CopperOreItem.ts'
import { GoldOreItem } from '../../../../items/ores/gold/GoldOreItem.ts'
import { DiamondItem } from '../../../../items/ores/diamond/DiamondItem.ts'
import { SulfurItem } from '../../../../items/ores/sulfur/SulfurItem.ts'
import { CHEST_SLOT_COUNT, type ChestBlockState } from './ChestBlockState.ts'

/**
 * Metadata bit 6: this chest's worldgen loot has been resolved (filled, or
 * decided to be empty). Set on player placement (a player chest never holds
 * worldgen loot) and on a worldgen chest's first E-interaction; because the
 * bit is block metadata it persists with the chunk, so a looted or resolved
 * chest can never re-roll its loot after save/load. Bits 0-2 are facing,
 * bit 3 is 3D rotation, bit 4 is vertical flip, bit 7 is
 * PERSISTENT_PLACED_METADATA_BIT (see BlockFacing.ts); bit 5 remains free.
 */
export const CHEST_LOOT_RESOLVED_METADATA_BIT = 0b0100_0000

/**
 * Radius of the charred-camp signature scan: a CHARRED_LOG within this many
 * blocks marks the chest as camp loot. The camp's shelter posts sit 1-3
 * blocks from its chest, so 6 has generous margin without reaching into
 * neighboring player builds.
 */
const CAMP_SIGNATURE_RADIUS = 6

/**
 * Deterministic [0,1) hash of world position + salt (integer avalanche mix,
 * same style as the worldgen features' positionRandom / cave lining hash).
 * Seed-independent: a given chest position always rolls the same loot.
 */
function coordHash01(x: number, y: number, z: number, salt: number): number {
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
 * Charred-camp signature: is there a CHARRED_LOG block within
 * CAMP_SIGNATURE_RADIUS of this position? Guards the loot fill so only
 * chests generated at a charred mining camp ever receive loot — any other
 * stateless chest (defensive flows, legacy saves) resolves to empty.
 */
export function isNearCharredCampSignature(
  world: IWorld,
  x: bigint,
  y: bigint,
  z: bigint
): boolean {
  if (!world.getBlockId) return false
  const r = CAMP_SIGNATURE_RADIUS
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (
          world.getBlockId(x + BigInt(dx), y + BigInt(dy), z + BigInt(dz)) ===
          BlockIds.CHARRED_LOG
        ) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * Fill a chest state with the charred mining camp's ore reward, derived
 * deterministically from the chest's world position:
 * - 6-10 coal, 4-7 raw iron, 3-5 raw copper, 2-4 raw gold, 2-4 sulfur
 * - 30% chance of 1-2 diamonds
 * Stacks are scattered across the 27 slots (deterministic slot picks with
 * linear probing) so the chest reads as a packed miners' cache, not a list.
 */
export function fillCharredCampChestLoot(
  state: ChestBlockState,
  x: bigint,
  y: bigint,
  z: bigint
): void {
  const xi = Number(x)
  const yi = Number(y)
  const zi = Number(z)
  const roll = (salt: number) => coordHash01(xi, yi, zi, salt)

  const stacks: Array<{ item: IItem; count: number }> = [
    { item: new CoalItem(), count: 6 + Math.floor(roll(1) * 5) }, // 6-10
    { item: new IronOreItem(), count: 4 + Math.floor(roll(2) * 4) }, // 4-7
    { item: new CopperOreItem(), count: 3 + Math.floor(roll(3) * 3) }, // 3-5
    { item: new GoldOreItem(), count: 2 + Math.floor(roll(4) * 3) }, // 2-4
    { item: new SulfurItem(), count: 2 + Math.floor(roll(5) * 3) }, // 2-4
  ]
  if (roll(6) < 0.3) {
    stacks.push({ item: new DiamondItem(), count: 1 + Math.floor(roll(7) * 2) }) // 1-2
  }

  for (let i = 0; i < stacks.length; i++) {
    // Deterministic scatter: hash a starting slot, probe forward to a free one
    let slot = Math.floor(roll(10 + i) * CHEST_SLOT_COUNT)
    for (let probe = 0; probe < CHEST_SLOT_COUNT; probe++) {
      if (!state.getStack(slot)) break
      slot = (slot + 1) % CHEST_SLOT_COUNT
    }
    state.setStack(slot, stacks[i])
  }
}
