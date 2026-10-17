import type { DungeonKit } from './DungeonTypes.ts'

/**
 * Registry of dungeon kits (worker + main thread: kits are plain code, no
 * DOM). Kits register themselves at module load; `kits/index.ts` imports
 * every production kit, so importing it (ProceduralDungeonFeature does)
 * makes them available in every worker.
 */
const kits = new Map<string, DungeonKit>()

export function registerDungeonKit(kit: DungeonKit): void {
  const previous = kits.get(kit.id)
  if (previous && previous !== kit) console.warn(`[dungeons] kit '${kit.id}' registered twice - keeping the last`)
  kits.set(kit.id, kit)
}

export function getDungeonKit(id: string): DungeonKit | undefined {
  return kits.get(id)
}

export function getDungeonKits(): DungeonKit[] {
  return Array.from(kits.values())
}
