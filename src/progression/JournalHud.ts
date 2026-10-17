import { HudOrder, mountHudElement } from '../ui/hudLayout.ts'
import type { MilestoneDef } from './MilestoneTypes.ts'

/**
 * Small, unobtrusive "Next: ..." line at the top of the HUD's top-left column
 * (status effect badges stack below it) showing the journal's current goal
 * (toggled from the journal). Capped to the column width with an ellipsis.
 * Never takes input.
 */
export interface JournalHud {
  readonly root: HTMLDivElement
  setGoal(goal: MilestoneDef | null): void
  setVisible(visible: boolean): void
  /** Brief highlight after the goal changed */
  flash(): void
}

export function createJournalHud(): JournalHud {
  const root = document.createElement('div')
  root.style.maxWidth = '100%'
  root.style.boxSizing = 'border-box'
  root.style.padding = '4px 10px 4px 8px'
  root.style.borderLeft = '3px solid #c8963e'
  root.style.borderRadius = '4px'
  root.style.background = 'rgba(20, 14, 8, 0.5)'
  root.style.color = 'rgba(243, 233, 210, 0.92)'
  root.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  root.style.fontSize = '12px'
  root.style.lineHeight = '1.35'
  root.style.whiteSpace = 'nowrap'
  root.style.overflow = 'hidden'
  root.style.textOverflow = 'ellipsis'
  root.style.pointerEvents = 'none'
  root.style.display = 'none'
  root.style.transition = 'background 0.6s ease, box-shadow 0.6s ease'

  const label = document.createElement('span')
  label.textContent = 'Next: '
  label.style.color = '#e0b25a'
  label.style.fontWeight = '700'
  const title = document.createElement('span')
  title.style.fontWeight = '600'
  const hint = document.createElement('span')
  hint.style.opacity = '0.75'
  const key = document.createElement('span')
  key.textContent = '  [J]'
  key.style.opacity = '0.5'

  root.append(label, title, hint, key)
  mountHudElement(root, 'topLeft', HudOrder.JOURNAL_GOAL)

  let visible = false
  let hasGoal = false
  let flashTimer = 0

  const apply = (): void => {
    root.style.display = visible && hasGoal ? 'block' : 'none'
  }

  return {
    root,
    setGoal(goal: MilestoneDef | null): void {
      hasGoal = goal !== null
      title.textContent = goal?.title ?? ''
      hint.textContent = goal ? ` — ${goal.hint}` : ''
      root.title = goal ? `${goal.title}: ${goal.hint}` : ''
      apply()
    },
    setVisible(next: boolean): void {
      if (next === visible) return
      visible = next
      apply()
    },
    flash(): void {
      root.style.background = 'rgba(150, 100, 30, 0.75)'
      root.style.boxShadow = '0 0 12px rgba(224, 178, 90, 0.6)'
      window.clearTimeout(flashTimer)
      flashTimer = window.setTimeout(() => {
        root.style.background = 'rgba(20, 14, 8, 0.5)'
        root.style.boxShadow = 'none'
      }, 900)
    },
  }
}
