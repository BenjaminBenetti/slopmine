import { gameEvents } from '../events/GameEvents.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import type { IPlayerState } from '../player/PlayerState.ts'
import type { InventoryUI } from '../ui/Inventory.ts'
import type { CameraControls } from '../player/FirstPersonCameraControls.ts'
import type { PersistenceManager } from '../persistence/PersistenceManager.ts'
import { createItemFromId, isItemRegistered } from '../persistence/ItemRegistry.ts'
import { showToast } from '../ui/Toasts.ts'
import { registerModalOverlay } from '../ui/ModalOverlays.ts'
import { JOURNAL_CHAPTERS } from './milestones.ts'
import { ProgressionManager } from './ProgressionManager.ts'
import { createJournalUI, type JournalUI } from './JournalUI.ts'
import { createJournalHud } from './JournalHud.ts'
import { playSound } from '../audio/SoundHooks.ts'

/**
 * Wires the Journal: progression tracking, completion toasts, the journal
 * overlay (J key + inventory sidebar button), the HUD goal line and the
 * player-data persistence. Called once from main.ts.
 */

export interface ProgressionSetupOptions {
  scheduler: TaskScheduler
  playerState: IPlayerState
  /** Player feet position */
  playerPosition: { readonly y: number }
  inventoryUI: InventoryUI
  cameraControls: CameraControls
  persistenceManager: PersistenceManager
  /** The game canvas (pointer lock target) */
  domElement: HTMLElement
  isLoading(): boolean
  isPlayerDead(): boolean
}

export interface ProgressionSystem {
  readonly manager: ProgressionManager
  readonly journal: JournalUI
  openJournal(): void
  closeJournal(): void
}

const PLAYER_DATA_KEY = 'progression'
const HUD_PREF_KEY = 'slopmine:journalHudHint'
const SAVE_DEBOUNCE_MS = 1500
const INTRO_DELAY_S = 4

function readHudPreference(): boolean {
  try {
    return localStorage.getItem(HUD_PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

function writeHudPreference(enabled: boolean): void {
  try {
    localStorage.setItem(HUD_PREF_KEY, enabled ? 'on' : 'off')
  } catch {
    // storage unavailable: the toggle still applies for this session
  }
}

export function setupProgression(options: ProgressionSetupOptions): ProgressionSystem {
  const { playerState, persistenceManager, domElement, inventoryUI, cameraControls } = options

  // --- Item lookups (cached; other streams' ids may not be registered) ------
  const iconCache = new Map<string, string | undefined>()
  const tagCache = new Map<string, ReadonlyArray<string>>()
  const getIconUrl = (itemId: string): string | undefined => {
    if (iconCache.has(itemId)) return iconCache.get(itemId)
    const url = isItemRegistered(itemId) ? createItemFromId(itemId)?.iconUrl : undefined
    // Block icons are generated after startup: only cache hits
    if (url) iconCache.set(itemId, url)
    return url
  }
  const getItemTags = (itemId: string): ReadonlyArray<string> => {
    let tags = tagCache.get(itemId)
    if (!tags) {
      tags = (isItemRegistered(itemId) ? createItemFromId(itemId)?.tags : undefined) ?? []
      tagCache.set(itemId, tags)
    }
    return tags
  }

  // --- Manager ----------------------------------------------------------------
  const manager = new ProgressionManager(JOURNAL_CHAPTERS, {
    forEachCarriedItem(visit) {
      for (const stack of playerState.inventory.toolbar.slots) {
        if (stack) visit(stack.item.id, stack.item.tags ?? [])
      }
      for (const stack of playerState.inventory.inventory.slots) {
        if (stack) visit(stack.item.id, stack.item.tags ?? [])
      }
    },
    getItemTags,
    getPlayerY: () => options.playerPosition.y,
  })
  manager.attach(gameEvents)

  // --- Persistence ------------------------------------------------------------
  // Never save before the stored state was read (an empty journal would
  // overwrite it), nor after a failed read.
  let canSave = false
  let needsMigrationSweep = false
  persistenceManager.registerPlayerDataContributor(PLAYER_DATA_KEY, () =>
    canSave ? manager.serialize() : undefined
  )
  persistenceManager
    .initialize()
    .then(() => persistenceManager.loadPlayerData(PLAYER_DATA_KEY))
    .then((data) => {
      manager.load(data)
      // A save that predates the journal: pre-complete what the player
      // already has, silently, once the world (and inventory) is loaded
      needsMigrationSweep = data === null
      canSave = true
    })
    .catch((error) => {
      console.warn('[Progression] journal state unavailable, tracking this session only:', error)
      manager.load(null)
    })

  let saveTimer = 0
  const scheduleSave = (): void => {
    if (!canSave) return
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      persistenceManager.savePlayerData(PLAYER_DATA_KEY, manager.serialize()).catch((error) => {
        console.warn('[Progression] saving journal failed:', error)
      })
    }, SAVE_DEBOUNCE_MS)
  }

  // --- HUD goal line + journal overlay -------------------------------------------
  const hud = createJournalHud()
  let hudEnabled = readHudPreference()

  let openedFromGameplay = false
  const journal = createJournalUI(manager, {
    getIconUrl,
    hudHintEnabled: hudEnabled,
    onHudHintToggle: (enabled) => {
      hudEnabled = enabled
      writeHudPreference(enabled)
    },
    onCloseRequested: () => closeJournal(),
  })
  registerModalOverlay(() => journal.isOpen)

  const openJournal = (): void => {
    if (journal.isOpen) return
    openedFromGameplay = document.pointerLockElement === domElement
    journal.open()
    playSound('ui.open')
    if (openedFromGameplay) {
      cameraControls.setInputEnabled(false)
      // The settings handler sees the open journal (ModalOverlays) and
      // stays closed; the mouse is free to use the book
      document.exitPointerLock()
    }
  }

  const closeJournal = (): void => {
    if (!journal.isOpen) return
    journal.close()
    playSound('ui.close')
    // Opened over the inventory / a block UI: back to it. From gameplay:
    // back to the game (called from a key or click handler, so pointer lock
    // may be requested)
    if (openedFromGameplay && !inventoryUI.isOpen) {
      cameraControls.setInputEnabled(true)
      if (document.pointerLockElement !== domElement) {
        const request = domElement.requestPointerLock() as unknown
        if (request instanceof Promise) request.catch(() => {})
      }
    }
    openedFromGameplay = false
  }

  // J toggles; Esc/E close the journal before anything underneath sees them
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (journal.isOpen) {
        if (event.code === 'KeyJ' || event.code === 'Escape' || event.code === 'KeyE') {
          event.preventDefault()
          event.stopPropagation()
          closeJournal()
        }
        return
      }
      if (event.code !== 'KeyJ' || event.repeat) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (options.isLoading() || options.isPlayerDead()) return
      // In game, or over the inventory/block UI; never over the pause menu
      if (document.pointerLockElement !== domElement && !inventoryUI.isOpen) return
      event.preventDefault()
      openJournal()
    },
    true
  )

  // The journal never stays open under a re-locked pointer
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === domElement && journal.isOpen) {
      journal.close()
      openedFromGameplay = false
    }
  })

  // Inventory sidebar button (next to the recipe book toggle)
  const recipeBookButton = inventoryUI.contentWrapper.querySelector('button[title="Recipe Book"]')
  const sidebar = recipeBookButton?.parentElement ?? inventoryUI.contentWrapper.firstElementChild
  if (sidebar instanceof HTMLElement) {
    const button = document.createElement('button')
    button.title = 'Journal (J)'
    button.dataset.journalButton = 'true'
    button.style.width = '36px'
    button.style.height = '36px'
    button.style.padding = '0'
    button.style.background = 'rgba(12, 12, 12, 0.96)'
    button.style.border = '2px solid rgba(224, 178, 90, 0.45)'
    button.style.borderRadius = '6px'
    button.style.cursor = 'pointer'
    button.style.display = 'flex'
    button.style.alignItems = 'center'
    button.style.justifyContent = 'center'
    button.style.fontSize = '18px'
    button.textContent = '\u{1F4DC}' // Scroll
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(40, 40, 40, 0.96)'
    })
    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(12, 12, 12, 0.96)'
    })
    button.addEventListener('click', () => openJournal())
    sidebar.appendChild(button)
  }

  // --- Notifications -------------------------------------------------------------
  // The last milestone of a chapter completes the chapter in the same call:
  // then only the chapter fanfare plays (the two chimes would clash)
  let chapterChimeAt = -Infinity
  manager.onMilestoneCompleted(({ milestone, chapter, silent }) => {
    scheduleSave()
    if (silent) return
    queueMicrotask(() => {
      if (performance.now() - chapterChimeAt > 100) playSound('ui.milestone')
    })
    showToast({
      caption: `Journal · ${chapter.title}`,
      title: milestone.title,
      body: milestone.flavour,
      accent: chapter.accent,
      iconUrl: milestone.icon ? getIconUrl(milestone.icon) : undefined,
    })
    hud.flash()
  })
  manager.onChapterCompleted((chapter) => {
    chapterChimeAt = performance.now()
    playSound('ui.chapter')
    const next = manager.getNextGoal()
    showToast({
      caption: 'Chapter complete',
      title: chapter.title,
      body: next ? `Next: ${next.title}. Press J for your journal.` : 'Every goal is met. You are Hellbane.',
      accent: '#f0c040',
      durationMs: 7000,
    })
  })
  const refreshGoal = (): void => {
    hud.setGoal(manager.isReady ? manager.getNextGoal() : null)
    journal.refresh()
  }
  manager.onChange(refreshGoal)

  // --- Per-frame upkeep -------------------------------------------------------------
  let introTimer = INTRO_DELAY_S
  // CRITICAL: cheap (a 1 Hz poll of ~90 slots plus HUD state), and a NORMAL
  // task registered this late is starved by world streaming for long stretches
  options.scheduler.createTask({
    id: 'progression',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      const playing = !options.isLoading()
      hud.setVisible(playing && hudEnabled && !journal.isOpen && manager.isReady)
      if (!playing || !manager.isReady) return

      if (needsMigrationSweep) {
        needsMigrationSweep = false
        manager.completeSatisfiedSilently()
        scheduleSave()
      }
      manager.update(dt)

      if (!manager.wasIntroShown) {
        introTimer -= dt
        if (introTimer <= 0) {
          manager.markIntroShown()
          scheduleSave()
          showToast({
            caption: 'Journal',
            title: 'Press J to open your Journal',
            body: 'It tracks your progress and always shows your next goal.',
            accent: '#e0b25a',
            durationMs: 8000,
          })
        }
      }
    },
  })

  return { manager, journal, openJournal, closeJournal }
}
