import type * as THREE from 'three'
import type { GuardianEntity } from '../entities/guardians/GuardianEntity.ts'

/**
 * Registry of dungeon guardians (bosses), keyed by the index a worker feature
 * writes into the guardian spawner's metadata:
 *
 * ```ts
 * chunk.setBlockId(lx, ly, lz, BlockIds.GUARDIAN_SPAWNER)
 * chunk.setMetadata(lx, ly, lz, GUARDIAN_INDEX)   // molten 1, ossuary 2, embergrove 3, crystal 4, cocytus 5
 * ```
 *
 * Main thread only (it references entity classes); register from your
 * main.ts wiring section. Workers never need it - they only write the index.
 */

/** Default horizontal player distance (blocks) from the spawner that summons the guardian. */
export const DEFAULT_GUARDIAN_ACTIVATION_RADIUS = 12

/** Default max |player Y - spawner Y| (blocks) for activation. */
export const DEFAULT_GUARDIAN_ACTIVATION_HEIGHT = 8

export interface GuardianDefinition {
  /** Stable id; `guardian-defeated.guardianId` (e.g. 'pyre_tyrant'). Must equal the entity's `guardianId`. */
  readonly id: string
  /** Spawner metadata index, 1-255 (molten 1, ossuary 2, embergrove 3, crystal 4, cocytus 5). */
  readonly index: number
  /** Human-readable name (boss bar, journal). */
  readonly displayName: string
  /** Horizontal player distance from the spawner that summons the guardian. Default 12. */
  readonly activationRadius?: number
  /** Max |player Y - spawner Y| for activation (roughly "same floor"). Default 8. */
  readonly activationHeight?: number
  /**
   * Build the guardian. `position` is the top centre of the spawner block
   * (x + 0.5, y + 1, z + 0.5) - the guardian's feet. Offset it here if the
   * boss should appear elsewhere in the arena; the guardian's arena centre
   * (leash home) defaults to the position its config receives.
   */
  create(position: THREE.Vector3): GuardianEntity
}

const byIndex = new Map<number, GuardianDefinition>()
const byId = new Map<string, GuardianDefinition>()

/** Register a guardian. A later registration for the same index replaces the earlier one (warned). */
export function registerGuardian(definition: GuardianDefinition): void {
  const { index, id } = definition
  if (!Number.isInteger(index) || index < 1 || index > 255) {
    console.error(`[GuardianRegistry] '${id}': index must be an integer 1-255 (got ${index})`)
    return
  }
  const previous = byIndex.get(index)
  if (previous && previous.id !== id) {
    console.warn(`[GuardianRegistry] index ${index} re-registered: '${previous.id}' -> '${id}'`)
    byId.delete(previous.id)
  }
  byIndex.set(index, definition)
  byId.set(id, definition)
}

/** The guardian a spawner with this metadata index summons, if registered. */
export function getGuardianDefinition(index: number): GuardianDefinition | undefined {
  return byIndex.get(index)
}

/** Look a guardian up by its id ('pyre_tyrant', ...). */
export function getGuardianDefinitionById(id: string): GuardianDefinition | undefined {
  return byId.get(id)
}

/** Every registered guardian, ordered by index. */
export function getGuardianDefinitions(): GuardianDefinition[] {
  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index)
}
