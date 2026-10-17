import type { PlayerHealth } from '../PlayerHealth.ts'
import type { IPlayerState } from '../PlayerState.ts'
import type { InventoryInput } from '../InventoryInput.ts'
import type { InventoryUI } from '../../ui/Inventory.ts'
import type { ToolbarUI } from '../../ui/Toolbar.ts'
import type { HealthDisplayUI } from '../../ui/HealthDisplay.ts'
import type { PersistenceManager } from '../../persistence/PersistenceManager.ts'
import { PlayerEquipment } from './PlayerEquipment.ts'
import { getArmorSetBonus, getEquipmentReduction, registerArmorDamageModifier } from './ArmorDefense.ts'
import { isArmorItem } from '../../items/armor/ArmorItem.ts'
import { ARMOR_SLOTS } from '../../items/armor/ArmorTiers.ts'
import { createItemFromId } from '../../persistence/ItemRegistry.ts'
import { createEquipmentPanelUI } from '../../ui/EquipmentPanel.ts'
import { createArmorDisplayUI } from '../../ui/ArmorDisplay.ts'
import { showPlayerNotice } from '../../ui/PlayerNotice.ts'
import { playSound } from '../../audio/SoundHooks.ts'

/** Player-data key of worn armor + the Infernal Heart max-health bonus. */
export const EQUIPMENT_DATA_KEY = 'equipment'

/**
 * Saved under EQUIPMENT_DATA_KEY. Version 1; loaders tolerate missing or
 * unknown fields and unknown item ids (dropped with a warning).
 */
export interface SavedEquipment {
  version: 1
  /** Item id per slot name (head/chest/legs/feet), null = empty */
  slots: Partial<Record<string, string | null>>
  /** PlayerHealth max-health bonus (Infernal Hearts) */
  maxHealthBonus: number
  /** Health at save time: restored after the bonus so health above the base max survives a reload */
  currentHealth: number
}

export interface ArmorSystemOptions {
  playerState: IPlayerState
  playerHealth: PlayerHealth
  healthDisplay: HealthDisplayUI
  inventoryUI: InventoryUI
  inventoryInput: InventoryInput
  toolbarUI: ToolbarUI
  /** The game canvas (right-click to wear held armor while pointer-locked) */
  domElement: HTMLElement
  persistenceManager: PersistenceManager
}

export interface ArmorSystem {
  readonly equipment: PlayerEquipment
}

/**
 * Wire the armor system: worn-armor state, the inventory's armor slots
 * (drag/drop, shift+click), right-click-to-wear from the hotbar, the HUD
 * armor bar above the hearts, the damage modifier (armor reduction + set
 * bonuses) and persistence of worn armor + the max-health bonus.
 */
export function setupArmorSystem(options: ArmorSystemOptions): ArmorSystem {
  const { playerState, playerHealth, healthDisplay, inventoryUI, inventoryInput, toolbarUI, domElement } = options
  const equipment = new PlayerEquipment()

  // Inventory: armor slots left of the grid
  const panel = createEquipmentPanelUI()
  inventoryUI.attachBesideGrid(panel.root)
  inventoryInput.addDragDropContainer({
    root: panel.root,
    slots: panel.slots,
    getStack: (index) => equipment.getStack(index),
    setStack: (index, stack) => {
      equipment.setStack(index, stack)
    },
    accepts: (index, item) => equipment.accepts(index, item),
    quickTarget: (item) => (isArmorItem(item) ? equipment.indexOf(item.armorSlot) : -1),
  })

  // HUD: armor bar above the hearts
  const armorDisplay = createArmorDisplayUI()
  healthDisplay.attachAbove(armorDisplay.root)

  const refresh = (): void => {
    const points = equipment.armorPoints
    const bonus = getArmorSetBonus(equipment.fullSetId)
    const stacks = ARMOR_SLOTS.map((_, i) => equipment.getStack(i))
    panel.sync(stacks, points, getEquipmentReduction(equipment), bonus?.description ?? null)
    armorDisplay.update(points, bonus !== null && bonus.fireMultiplier < 1)
  }
  equipment.onChange(refresh)
  refresh()

  registerArmorDamageModifier(equipment)

  // Right-click with armor in the hand: wear it (swapping out what was worn)
  domElement.addEventListener('mousedown', (event: MouseEvent) => {
    if (event.button !== 2 || document.pointerLockElement !== domElement) return
    if (playerHealth.isDead) return
    const toolbar = playerState.inventory.toolbar
    const index = toolbar.selectedIndex
    const stack = toolbar.getStack(index)
    if (!stack || !isArmorItem(stack.item)) return
    const previous = equipment.equip(stack.item)
    toolbar.setStack(index, previous ? { item: previous, count: 1 } : null)
    toolbarUI.syncFromState(toolbar.slots)
    showPlayerNotice(`Equipped ${stack.item.displayName}`, 1400)
    playSound('item.equip')
  })

  // Persistence: load first, then contribute (never save an empty set over
  // armor that hasn't loaded yet)
  const { persistenceManager } = options
  persistenceManager
    .initialize()
    .then(async () => {
      const saved = await persistenceManager.loadPlayerData<Partial<SavedEquipment>>(EQUIPMENT_DATA_KEY)
      if (saved && typeof saved === 'object') applySavedEquipment(saved, equipment, playerHealth)
      persistenceManager.registerPlayerDataContributor(EQUIPMENT_DATA_KEY, (): SavedEquipment => {
        const slots: Record<string, string | null> = {}
        ARMOR_SLOTS.forEach((slot, i) => {
          slots[slot] = equipment.getStack(i)?.item.id ?? null
        })
        return {
          version: 1,
          slots,
          maxHealthBonus: playerHealth.maxHealthBonus,
          currentHealth: playerHealth.currentHealth,
        }
      })
    })
    .catch((error) => {
      console.error('[armor] Failed to load equipment:', error)
    })

  return { equipment }
}

function applySavedEquipment(saved: Partial<SavedEquipment>, equipment: PlayerEquipment, health: PlayerHealth): void {
  const slots = saved.slots && typeof saved.slots === 'object' ? saved.slots : {}
  ARMOR_SLOTS.forEach((slot, i) => {
    const id = slots[slot]
    if (typeof id !== 'string') return
    const item = createItemFromId(id)
    if (item && equipment.accepts(i, item)) {
      equipment.setStack(i, { item, count: 1 })
    } else {
      console.warn(`[armor] Dropping unknown saved ${slot} armor: ${id}`)
    }
  })
  if (typeof saved.maxHealthBonus === 'number') {
    health.setMaxHealthBonus(saved.maxHealthBonus)
  }
  if (typeof saved.currentHealth === 'number' && saved.currentHealth > 0) {
    health.setHealth(saved.currentHealth)
  }
}
