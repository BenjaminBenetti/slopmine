import { applyUIScale, UI_SCALE } from '../ui/uiScale.ts'
import type { ChapterDef, MilestoneDef } from './MilestoneTypes.ts'
import type { MilestoneState, ProgressionManager } from './ProgressionManager.ts'

/**
 * The Journal overlay: a two-page book. Left page lists the chapters with
 * their progress; right page shows the next goal and the selected chapter's
 * milestones (done with their flavour, current with an actionable hint,
 * locked with what they need). Pure DOM - input routing lives in
 * setupProgression.ts.
 */

export interface JournalUIOptions {
  /** Icon URL of an item id (undefined: no icon) */
  getIconUrl(itemId: string): string | undefined
  /** Initial state of the "next goal on screen" toggle */
  hudHintEnabled: boolean
  onHudHintToggle(enabled: boolean): void
  /** Close button / backdrop click */
  onCloseRequested(): void
}

export interface JournalUI {
  readonly root: HTMLDivElement
  readonly isOpen: boolean
  open(): void
  close(): void
  /** Re-render from the manager (no-op while closed) */
  refresh(): void
  destroy(): void
}

const INK = '#3a2817'
const MUTED_INK = '#7a6648'
const DONE_GREEN = '#3f6e2c'
const NEXT_RED = '#9a3a1c'
const PARCHMENT = '#efe4c8'
const PARCHMENT_EDGE = '#d6c399'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration> = {},
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  Object.assign(node.style, style)
  if (text !== undefined) node.textContent = text
  return node
}

export function createJournalUI(manager: ProgressionManager, options: JournalUIOptions): JournalUI {
  // --- Frame -----------------------------------------------------------------
  const overlay = el('div', {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.55)',
    zIndex: '45',
  })
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) options.onCloseRequested()
  })

  const book = el('div', {
    display: 'flex',
    flexDirection: 'column',
    // Sized in fitBook() (CSS px inside the UI zoom)
    width: '860px',
    height: '560px',
    padding: '10px 10px 0 10px',
    background: 'linear-gradient(160deg, #5a3520, #3b2214 60%, #2e1a0f)',
    borderRadius: '10px',
    border: '1px solid #1d1009',
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.6), inset 0 0 0 2px rgba(214, 170, 100, 0.25)',
    fontFamily: "Georgia, 'Times New Roman', serif",
    color: INK,
    boxSizing: 'border-box',
  })
  applyUIScale(book)
  overlay.appendChild(book)

  const pages = el('div', {
    display: 'flex',
    flex: '1 1 0',
    minHeight: '0',
    borderRadius: '4px',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 12px rgba(80, 50, 20, 0.35)',
  })
  book.appendChild(pages)

  const leftPage = el('div', {
    flex: '0 0 36%',
    overflowY: 'auto',
    padding: '18px 14px 18px 18px',
    background: `linear-gradient(90deg, ${PARCHMENT_EDGE} 0%, ${PARCHMENT} 5%, ${PARCHMENT} 88%, #d2bd92 100%)`,
    boxSizing: 'border-box',
  })
  const rightPage = el('div', {
    flex: '1 1 auto',
    overflowY: 'auto',
    padding: '18px 22px 18px 22px',
    background: `linear-gradient(90deg, #d2bd92 0%, ${PARCHMENT} 4%, ${PARCHMENT} 96%, ${PARCHMENT_EDGE} 100%)`,
    boxSizing: 'border-box',
  })
  pages.appendChild(leftPage)
  pages.appendChild(rightPage)

  // --- Footer (on the leather) ---------------------------------------------------
  const footer = el('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flex: '0 0 34px',
    padding: '0 6px',
    color: '#e9d8b4',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '12px',
  })
  const hudToggleLabel = el('label', { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' })
  const hudToggle = el('input')
  hudToggle.type = 'checkbox'
  hudToggle.checked = options.hudHintEnabled
  hudToggle.style.cursor = 'pointer'
  hudToggle.addEventListener('change', () => options.onHudHintToggle(hudToggle.checked))
  hudToggleLabel.appendChild(hudToggle)
  hudToggleLabel.appendChild(document.createTextNode('Show next goal on screen'))
  const keysHint = el('span', { opacity: '0.75' }, 'J or Esc to close')
  const closeButton = el(
    'button',
    {
      background: 'rgba(0, 0, 0, 0.25)',
      color: '#e9d8b4',
      border: '1px solid rgba(233, 216, 180, 0.35)',
      borderRadius: '4px',
      padding: '2px 10px',
      cursor: 'pointer',
      fontSize: '12px',
      fontFamily: 'inherit',
    },
    'Close'
  )
  closeButton.addEventListener('click', () => options.onCloseRequested())
  const footerRight = el('div', { display: 'flex', alignItems: 'center', gap: '12px' })
  footerRight.appendChild(keysHint)
  footerRight.appendChild(closeButton)
  footer.appendChild(hudToggleLabel)
  footer.appendChild(footerRight)
  book.appendChild(footer)

  document.body.appendChild(overlay)

  let isOpen = false
  let selectedChapterId: string | null = null

  /** Fit the book to the viewport (its size is in zoomed CSS px). */
  const fitBook = (): void => {
    const availableW = window.innerWidth / UI_SCALE
    const availableH = window.innerHeight / UI_SCALE
    book.style.width = `${Math.round(Math.min(860, availableW * 0.94))}px`
    book.style.height = `${Math.round(Math.min(560, availableH * 0.9))}px`
  }
  window.addEventListener('resize', () => {
    if (isOpen) fitBook()
  })

  // --- Rendering ---------------------------------------------------------------

  const iconBox = (itemId: string | undefined, state: MilestoneState | 'chapter'): HTMLElement => {
    const box = el('div', {
      width: '30px',
      height: '30px',
      flex: '0 0 30px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '5px',
      background: 'rgba(58, 40, 23, 0.08)',
      border: '1px solid rgba(58, 40, 23, 0.18)',
    })
    const url = itemId ? options.getIconUrl(itemId) : undefined
    if (url) {
      const img = el('img', {
        width: '24px',
        height: '24px',
        objectFit: 'contain',
        imageRendering: 'pixelated',
        filter: state === 'locked' ? 'grayscale(1) opacity(0.6)' : 'none',
      })
      img.src = url
      img.alt = ''
      box.appendChild(img)
    } else {
      box.appendChild(el('div', { width: '8px', height: '8px', borderRadius: '50%', background: MUTED_INK }))
    }
    return box
  }

  const titleOf = (id: string): string => manager.getMilestone(id)?.title ?? id

  const renderMilestone = (milestone: MilestoneDef, nextGoalId: string | null): HTMLElement => {
    const state = manager.getState(milestone)
    const isNext = milestone.id === nextGoalId
    const row = el('div', {
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-start',
      padding: '8px 10px',
      marginBottom: '6px',
      borderRadius: '6px',
      background:
        state === 'done' ? 'rgba(90, 130, 60, 0.12)' : state === 'current' ? 'rgba(255, 255, 255, 0.4)' : 'transparent',
      border: isNext
        ? `2px solid ${NEXT_RED}`
        : state === 'current'
          ? '1px solid rgba(58, 40, 23, 0.2)'
          : '1px solid transparent',
      opacity: state === 'locked' ? '0.6' : '1',
    })
    row.dataset.milestone = milestone.id
    row.dataset.state = state
    row.appendChild(iconBox(milestone.icon, state))

    const text = el('div', { flex: '1 1 auto', minWidth: '0' })
    const titleLine = el('div', { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' })
    titleLine.appendChild(
      el(
        'span',
        {
          fontWeight: '700',
          fontSize: '15px',
          color: state === 'done' ? DONE_GREEN : INK,
        },
        milestone.title
      )
    )
    const badge = (label: string, color: string): HTMLElement =>
      el(
        'span',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          fontWeight: '700',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color,
        },
        label
      )
    if (state === 'done') titleLine.appendChild(badge('✓ done', DONE_GREEN))
    if (isNext) titleLine.appendChild(badge('next goal', NEXT_RED))
    if (milestone.optional && state !== 'done') titleLine.appendChild(badge('optional', MUTED_INK))
    if (state === 'locked') titleLine.appendChild(badge('locked', MUTED_INK))
    text.appendChild(titleLine)

    let detail: string
    let italic = false
    if (state === 'done') {
      detail = milestone.flavour
      italic = true
    } else if (state === 'current') {
      detail = milestone.hint
    } else {
      const chapter = manager.getChapterOf(milestone.id)
      const missing = (
        chapter && !manager.isChapterUnlocked(chapter) ? chapter.requires ?? [] : milestone.requires ?? []
      ).filter((id) => !manager.isDone(id))
      detail = missing.length > 0 ? `Requires: ${missing.map(titleOf).join(', ')}` : milestone.hint
    }
    text.appendChild(
      el(
        'div',
        {
          fontSize: '13px',
          lineHeight: '1.4',
          marginTop: '2px',
          color: state === 'current' ? INK : MUTED_INK,
          fontStyle: italic ? 'italic' : 'normal',
        },
        detail
      )
    )
    row.appendChild(text)
    return row
  }

  const renderChapterButton = (chapter: ChapterDef, index: number, selected: boolean): HTMLElement => {
    const unlocked = manager.isChapterUnlocked(chapter)
    const complete = manager.isChapterComplete(chapter)
    const progress = manager.getChapterProgress(chapter)
    const button = el('button', {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      textAlign: 'left',
      padding: '7px 8px',
      marginBottom: '4px',
      borderRadius: '6px',
      border: selected ? '1px solid rgba(122, 46, 26, 0.35)' : '1px solid transparent',
      background: selected ? 'rgba(122, 46, 26, 0.12)' : 'transparent',
      cursor: 'pointer',
      fontFamily: 'inherit',
      color: INK,
      opacity: unlocked ? '1' : '0.55',
    })
    button.dataset.chapter = chapter.id
    button.appendChild(
      el(
        'span',
        { width: '30px', flex: '0 0 30px', fontWeight: '700', color: complete ? DONE_GREEN : '#7a2e1a', fontSize: '14px' },
        ROMAN[index] ?? String(index + 1)
      )
    )
    const middle = el('div', { flex: '1 1 auto', minWidth: '0' })
    middle.appendChild(el('div', { fontWeight: '700', fontSize: '14px' }, chapter.title))
    const bar = el('div', {
      height: '4px',
      marginTop: '4px',
      borderRadius: '2px',
      background: 'rgba(58, 40, 23, 0.15)',
      overflow: 'hidden',
    })
    const fraction = progress.total > 0 ? progress.done / progress.total : 0
    bar.appendChild(
      el('div', {
        height: '100%',
        width: `${Math.round(fraction * 100)}%`,
        background: complete ? DONE_GREEN : chapter.accent,
      })
    )
    middle.appendChild(bar)
    button.appendChild(middle)
    button.appendChild(
      el(
        'span',
        { fontSize: '12px', color: complete ? DONE_GREEN : MUTED_INK, fontFamily: 'system-ui, sans-serif' },
        complete ? '✓' : unlocked ? `${progress.done}/${progress.total}` : 'locked'
      )
    )
    button.addEventListener('click', () => {
      selectedChapterId = chapter.id
      render()
    })
    return button
  }

  const render = (): void => {
    const next = manager.getNextGoal()
    const nextId = next?.id ?? null
    const chapters = manager.chapters
    if (!selectedChapterId || !chapters.some((c) => c.id === selectedChapterId)) {
      selectedChapterId = (next ? manager.getChapterOf(next.id)?.id : undefined) ?? chapters[0]?.id ?? null
    }

    // Left page: title + chapters
    leftPage.replaceChildren()
    leftPage.appendChild(el('div', { fontSize: '24px', fontWeight: '700', letterSpacing: '0.02em' }, 'Journal'))
    const total = manager.getTotalProgress()
    leftPage.appendChild(
      el(
        'div',
        { fontSize: '12px', color: MUTED_INK, margin: '2px 0 14px 0', fontStyle: 'italic' },
        `${total.done} of ${total.total} milestones`
      )
    )
    chapters.forEach((chapter, index) => {
      leftPage.appendChild(renderChapterButton(chapter, index, chapter.id === selectedChapterId))
    })

    // Right page: next goal + selected chapter
    rightPage.replaceChildren()
    const goalBox = el('div', {
      padding: '10px 12px',
      marginBottom: '16px',
      borderRadius: '6px',
      background: 'rgba(154, 58, 28, 0.08)',
      borderLeft: `4px solid ${NEXT_RED}`,
    })
    goalBox.dataset.nextGoal = nextId ?? ''
    goalBox.appendChild(
      el(
        'div',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          fontWeight: '700',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: NEXT_RED,
        },
        'Next goal'
      )
    )
    if (next) {
      goalBox.appendChild(el('div', { fontSize: '16px', fontWeight: '700', marginTop: '2px' }, next.title))
      goalBox.appendChild(el('div', { fontSize: '13px', lineHeight: '1.4', marginTop: '2px' }, next.hint))
    } else {
      goalBox.appendChild(
        el('div', { fontSize: '15px', fontWeight: '700', marginTop: '2px' }, 'Every goal is met. You are Hellbane.')
      )
    }
    rightPage.appendChild(goalBox)

    const chapter = chapters.find((c) => c.id === selectedChapterId)
    if (!chapter) return
    const header = el('div', { marginBottom: '10px', borderBottom: `1px solid rgba(58, 40, 23, 0.2)`, paddingBottom: '8px' })
    header.appendChild(el('div', { fontSize: '20px', fontWeight: '700', color: INK }, chapter.title))
    header.appendChild(el('div', { fontSize: '13px', color: MUTED_INK, fontStyle: 'italic' }, chapter.blurb))
    if (!manager.isChapterUnlocked(chapter)) {
      const missing = (chapter.requires ?? []).filter((id) => !manager.isDone(id)).map(titleOf)
      header.appendChild(
        el('div', { fontSize: '12px', color: NEXT_RED, marginTop: '4px' }, `Unlocks after: ${missing.join(', ')}`)
      )
    }
    rightPage.appendChild(header)
    for (const milestone of chapter.milestones) {
      rightPage.appendChild(renderMilestone(milestone, nextId))
    }
  }

  const api: JournalUI = {
    root: overlay,
    get isOpen() {
      return isOpen
    },
    open(): void {
      isOpen = true
      // Always open on the chapter of the current goal
      selectedChapterId = null
      fitBook()
      render()
      overlay.style.display = 'flex'
      rightPage.scrollTop = 0
      // Bring the next goal into view in long chapters
      const nextRow = rightPage.querySelector<HTMLElement>(`[data-milestone="${manager.getNextGoal()?.id ?? ''}"]`)
      nextRow?.scrollIntoView({ block: 'nearest' })
    },
    close(): void {
      isOpen = false
      overlay.style.display = 'none'
    },
    refresh(): void {
      if (isOpen) render()
    },
    destroy(): void {
      overlay.remove()
    },
  }
  return api
}
