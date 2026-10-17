import type { IItemStack } from '../player/PlayerState.ts'
import { ARMOR_SLOTS } from '../items/armor/ArmorTiers.ts'
import { renderStackInSlot } from './SlotRenderer.ts'
import { CHESTPLATE_PATH, SLOT_SILHOUETTE_PATHS } from './ArmorIcons.ts'

/**
 * The four armor slots shown left of the inventory grid (head, chest, legs,
 * feet, top to bottom). Empty slots show a faint silhouette of the piece
 * they take; below them a caption shows armor points, the damage reduction
 * and any set bonus. Drag/drop runs through DragDropHandler (the slots are
 * an extra container); this module only renders.
 */
export interface EquipmentPanelUI {
  readonly root: HTMLDivElement
  readonly slots: HTMLDivElement[]
  /** Re-render slot contents and the caption */
  sync(
    stacks: ReadonlyArray<IItemStack | null>,
    armorPoints: number,
    reduction: number,
    setBonusText: string | null,
  ): void
}

const SLOT_TITLES = ['Helmet', 'Chestplate', 'Leggings', 'Boots']

export function createEquipmentPanelUI(slotSizePx = 44): EquipmentPanelUI {
  // Plain block root: InventoryInput hides it with display 'none' and
  // restores '' while a block UI owns the overlay
  const root = document.createElement('div')

  const column = document.createElement('div')
  column.style.display = 'flex'
  column.style.flexDirection = 'column'
  column.style.alignItems = 'center'
  column.style.gap = '0.4rem'
  root.appendChild(column)

  const slots: HTMLDivElement[] = []
  const silhouettes: HTMLDivElement[] = []

  ARMOR_SLOTS.forEach((slotType, i) => {
    const slot = document.createElement('div')
    slot.dataset.equipmentSlot = slotType
    // Fixed size like the inventory grid's slots: the inventory panel
    // scales down as a whole on small windows
    slot.style.width = `${slotSizePx}px`
    slot.style.height = `${slotSizePx}px`
    slot.style.background = 'rgba(14, 12, 10, 0.98)'
    slot.style.border = '2px solid rgba(214, 196, 168, 0.38)'
    slot.style.borderRadius = '4px'
    slot.style.boxShadow = 'inset 0 0 0 1px rgba(0, 0, 0, 0.7)'
    slot.style.display = 'flex'
    slot.style.alignItems = 'center'
    slot.style.justifyContent = 'center'
    slot.style.position = 'relative'

    const silhouette = document.createElement('div')
    silhouette.style.position = 'absolute'
    silhouette.style.inset = '18%'
    silhouette.style.pointerEvents = 'none'
    silhouette.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
        <path d="${SLOT_SILHOUETTE_PATHS[slotType]}" fill="rgba(255,255,255,0.13)"
              stroke="rgba(255,255,255,0.2)" stroke-width="0.7" stroke-linejoin="round"/>
      </svg>`
    slot.appendChild(silhouette)

    silhouettes.push(silhouette)
    slots.push(slot)
    column.appendChild(slot)
  })

  const caption = document.createElement('div')
  caption.style.marginTop = '0.15rem'
  caption.style.display = 'flex'
  caption.style.flexDirection = 'column'
  caption.style.alignItems = 'center'
  caption.style.gap = '1px'
  caption.style.maxWidth = `${slotSizePx + 8}px`
  caption.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  caption.style.textAlign = 'center'
  caption.style.pointerEvents = 'none'
  column.appendChild(caption)

  const pointsLine = document.createElement('div')
  pointsLine.style.display = 'flex'
  pointsLine.style.alignItems = 'center'
  pointsLine.style.gap = '3px'
  pointsLine.style.fontSize = '0.8rem'
  pointsLine.style.fontWeight = 'bold'
  pointsLine.style.color = 'rgba(232, 238, 244, 0.95)'
  pointsLine.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
      <path d="${CHESTPLATE_PATH}" fill="#c4ccd4" stroke="#eef2f5" stroke-width="0.6"/>
    </svg>`
  const pointsText = document.createElement('span')
  pointsLine.appendChild(pointsText)

  const reductionLine = document.createElement('div')
  reductionLine.style.fontSize = '0.65rem'
  reductionLine.style.color = 'rgba(200, 210, 220, 0.75)'

  const bonusLine = document.createElement('div')
  bonusLine.style.fontSize = '0.6rem'
  bonusLine.style.lineHeight = '1.15'
  bonusLine.style.color = 'rgba(255, 170, 90, 0.95)'

  caption.append(pointsLine, reductionLine, bonusLine)

  return {
    root,
    slots,
    sync(stacks, armorPoints, reduction, setBonusText): void {
      for (let i = 0; i < slots.length; i++) {
        const stack = stacks[i] ?? null
        renderStackInSlot(slots[i], stack)
        silhouettes[i].style.display = stack ? 'none' : ''
        // Empty slots name the piece they take; filled ones get the item tooltip
        slots[i].title = stack ? '' : SLOT_TITLES[i]
      }
      pointsText.textContent = String(armorPoints)
      reductionLine.textContent = armorPoints > 0 ? `-${Math.round(reduction * 100)}% dmg` : ''
      bonusLine.textContent = setBonusText ?? ''
      bonusLine.style.display = setBonusText ? '' : 'none'
    },
  }
}
