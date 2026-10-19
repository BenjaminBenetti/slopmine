import { applyUIScale } from '../ui/uiScale.ts'
import { MIN_ATTACK_CHARGE } from './PlayerAttack.ts'

export interface AttackChargeIndicatorUI {
  readonly element: HTMLDivElement
  /**
   * Show the charge (0-1). The bar is only drawn while recovering
   * (charge < 1) and `visible`; a full charge hides it. The fill stays dim
   * until a click can land a hit (MIN_ATTACK_CHARGE).
   */
  update(charge: number, visible: boolean): void
  destroy(): void
}

const BAR_WIDTH_PX = 20
const BAR_HEIGHT_PX = 3
const FILL_READY = 'rgba(255, 255, 255, 0.92)'
const FILL_RECOVERING = 'rgba(255, 255, 255, 0.4)'

/**
 * A small attack-charge bar just under the crosshair (Minecraft 1.9 style).
 * Appears after a hit, fills as the arm recovers and vanishes when the next
 * hit is at full strength - invisible the rest of the time.
 */
export function createAttackChargeIndicator(parent: HTMLElement = document.body): AttackChargeIndicatorUI {
  const el = document.createElement('div')
  el.style.position = 'fixed'
  el.style.left = '50%'
  el.style.top = '50%'
  el.style.width = `${BAR_WIDTH_PX}px`
  el.style.height = `${BAR_HEIGHT_PX}px`
  // Centred horizontally, a few px below the crosshair dot
  el.style.transform = 'translate(-50%, 8px)'
  // Faint track + dark rim so it reads on sky and on dark rock alike
  el.style.background = 'rgba(255, 255, 255, 0.22)'
  el.style.boxShadow = '0 0 0 1px rgba(0, 0, 0, 0.55)'
  el.style.borderRadius = '1px'
  el.style.pointerEvents = 'none'
  el.style.zIndex = '30'
  el.style.display = 'none'
  applyUIScale(el)

  const fill = document.createElement('div')
  fill.style.height = '100%'
  fill.style.width = '0%'
  fill.style.background = FILL_RECOVERING
  fill.style.borderRadius = '1px'
  el.appendChild(fill)

  parent.appendChild(el)

  let shown = false
  let lastPercent = -1
  let lastCanHit = false

  return {
    element: el,

    update(charge: number, visible: boolean): void {
      const show = visible && charge < 1
      if (show !== shown) {
        shown = show
        el.style.display = show ? '' : 'none'
      }
      if (!show) return
      const percent = Math.round(Math.max(0, charge) * 100)
      if (percent !== lastPercent) {
        lastPercent = percent
        fill.style.width = `${percent}%`
      }
      const canHit = charge >= MIN_ATTACK_CHARGE
      if (canHit !== lastCanHit) {
        lastCanHit = canHit
        fill.style.background = canHit ? FILL_READY : FILL_RECOVERING
      }
    },

    destroy(): void {
      if (el.parentElement === parent) {
        parent.removeChild(el)
      }
    },
  }
}
