import type { GameEvent, GameEventBus } from '../events/GameEvents.ts'
import type { ChapterDef, MilestoneDef, ObtainTrigger } from './MilestoneTypes.ts'

/** How far (in arc stages) an open goal may trail the furthest milestone and still be the next goal. */
const NEXT_GOAL_MAX_LAG = 100

/** Persisted journal state (player data key 'progression'). */
export interface ProgressionSaveData {
  version: 1
  /** Completed milestone id → completion time (ms since epoch) */
  completed: Record<string, number>
  /** Watched item ids (and `tag:<tag>` entries) the player has ever had */
  obtained: string[]
  /** The "Press J" introduction toast was shown */
  introShown: boolean
}

/** What the manager reads from the game (kept tiny so it stays testable). */
export interface ProgressionContext {
  /** Visit every item stack the player carries (toolbar + inventory). */
  forEachCarriedItem(visit: (itemId: string, tags: ReadonlyArray<string>) => void): void
  /** Tags of an item id (for item ids seen only in events). */
  getItemTags(itemId: string): ReadonlyArray<string>
  /** Player feet Y. */
  getPlayerY(): number
}

export interface MilestoneCompletion {
  readonly milestone: MilestoneDef
  readonly chapter: ChapterDef
  /** No notification: implied by another completion, or a save migration */
  readonly silent: boolean
}

export type MilestoneState = 'done' | 'current' | 'locked'

const POLL_INTERVAL_S = 1

/**
 * Tracks journal milestones: evaluates their triggers against gameplay
 * events, a ~1 Hz poll of the carried items and the player's depth, and
 * reports completions (with a silent flag for implied/migrated ones).
 *
 * "Obtain" triggers are evaluated against every watched item the player has
 * EVER carried (recorded on pickup, craft and poll), so equipping armor or
 * spending an item later never un-satisfies a milestone and set milestones
 * can be collected over time.
 */
export class ProgressionManager {
  readonly chapters: readonly ChapterDef[]

  private readonly context: ProgressionContext
  private readonly milestones = new Map<string, MilestoneDef>()
  private readonly chapterOf = new Map<string, ChapterDef>()
  /** Item ids referenced by obtain triggers */
  private readonly watchedItems = new Set<string>()
  /** Item tags referenced by obtain triggers */
  private readonly watchedTags = new Set<string>()

  private readonly completed = new Map<string, number>()
  private readonly obtained = new Set<string>()
  private introShown = false

  private ready = false
  private pollTimer = 0
  private readonly unsubscribers: Array<() => void> = []

  private readonly completionListeners = new Set<(completion: MilestoneCompletion) => void>()
  private readonly chapterListeners = new Set<(chapter: ChapterDef) => void>()
  private readonly changeListeners = new Set<() => void>()

  constructor(chapters: readonly ChapterDef[], context: ProgressionContext) {
    this.chapters = chapters
    this.context = context
    for (const chapter of chapters) {
      for (const milestone of chapter.milestones) {
        if (this.milestones.has(milestone.id)) {
          console.warn(`[Progression] duplicate milestone id '${milestone.id}'`)
        }
        this.milestones.set(milestone.id, milestone)
        this.chapterOf.set(milestone.id, chapter)
        for (const trigger of milestone.triggers) {
          if (trigger.kind !== 'obtain') continue
          for (const item of trigger.items ?? []) this.watchedItems.add(item)
          for (const tag of trigger.tags ?? []) this.watchedTags.add(tag)
        }
      }
    }
    for (const milestone of this.milestones.values()) {
      for (const id of milestone.requires ?? []) {
        if (!this.milestones.has(id)) console.warn(`[Progression] '${milestone.id}' requires unknown '${id}'`)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Subscribe to gameplay events (they only count once {@link load} ran). */
  attach(events: GameEventBus): void {
    this.unsubscribers.push(events.onAny((event) => this.handleEvent(event)))
  }

  detach(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers.length = 0
  }

  /** Apply saved data (null: never saved). Tolerates missing/unknown fields. */
  load(data: unknown): void {
    this.completed.clear()
    this.obtained.clear()
    this.introShown = false
    if (data && typeof data === 'object') {
      const record = data as Partial<Record<keyof ProgressionSaveData, unknown>>
      if (record.completed && typeof record.completed === 'object') {
        for (const [id, time] of Object.entries(record.completed as Record<string, unknown>)) {
          // Unknown ids (removed milestones) are dropped; ids of not-yet-merged
          // content are kept by the milestone table, so nothing else is lost
          if (this.milestones.has(id)) this.completed.set(id, typeof time === 'number' ? time : 0)
        }
      }
      if (Array.isArray(record.obtained)) {
        for (const id of record.obtained) if (typeof id === 'string') this.obtained.add(id)
      }
      this.introShown = record.introShown === true
    }
    this.ready = true
    this.emitChange()
  }

  /** Data for the player-data store. */
  serialize(): ProgressionSaveData {
    return {
      version: 1,
      completed: Object.fromEntries(this.completed),
      obtained: Array.from(this.obtained),
      introShown: this.introShown,
    }
  }

  get isReady(): boolean {
    return this.ready
  }

  get wasIntroShown(): boolean {
    return this.introShown
  }

  markIntroShown(): void {
    this.introShown = true
  }

  /** Advance the carried-item / depth poll. */
  update(deltaTime: number): void {
    if (!this.ready) return
    this.pollTimer -= deltaTime
    if (this.pollTimer > 0) return
    this.pollTimer = POLL_INTERVAL_S
    this.poll(false)
  }

  /**
   * Complete, without notifications, every milestone the carried items
   * already satisfy (plus what they imply). Used once for saves that predate
   * the journal, so an established player is not greeted by a toast storm.
   */
  completeSatisfiedSilently(): void {
    if (!this.ready) return
    this.poll(true)

    // An established player carrying iron tools has also chopped wood and
    // built a forge: complete the legacy milestones below the furthest one
    // their items prove (new content - swords, armor, potions - stays open)
    let frontier = -Infinity
    for (const id of this.completed.keys()) {
      const milestone = this.milestones.get(id)
      if (milestone?.legacy) frontier = Math.max(frontier, milestone.stage)
    }
    for (const milestone of this.milestones.values()) {
      if (milestone.legacy && milestone.stage < frontier) this.complete(milestone, true)
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  isDone(id: string): boolean {
    return this.completed.has(id)
  }

  getCompletionTime(id: string): number | undefined {
    return this.completed.get(id)
  }

  getMilestone(id: string): MilestoneDef | undefined {
    return this.milestones.get(id)
  }

  getChapterOf(id: string): ChapterDef | undefined {
    return this.chapterOf.get(id)
  }

  isChapterUnlocked(chapter: ChapterDef): boolean {
    return (chapter.requires ?? []).every((id) => this.completed.has(id))
  }

  /** Done, unlocked (current), or locked (chapter or prerequisites missing). */
  getState(milestone: MilestoneDef): MilestoneState {
    if (this.completed.has(milestone.id)) return 'done'
    const chapter = this.chapterOf.get(milestone.id)
    if (chapter && !this.isChapterUnlocked(chapter)) return 'locked'
    for (const id of milestone.requires ?? []) {
      if (!this.completed.has(id)) return 'locked'
    }
    return 'current'
  }

  /** Every non-optional milestone of the chapter is done. */
  isChapterComplete(chapter: ChapterDef): boolean {
    return chapter.milestones.every((m) => m.optional || this.completed.has(m.id))
  }

  getChapterProgress(chapter: ChapterDef): { done: number; total: number } {
    let done = 0
    let total = 0
    for (const milestone of chapter.milestones) {
      const isDone = this.completed.has(milestone.id)
      // Optional milestones count only once done (bonus, never a blocker)
      if (milestone.optional && !isDone) continue
      total++
      if (isDone) done++
    }
    return { done, total }
  }

  getTotalProgress(): { done: number; total: number } {
    let done = 0
    let total = 0
    for (const chapter of this.chapters) {
      const progress = this.getChapterProgress(chapter)
      done += progress.done
      total += progress.total
    }
    return { done, total }
  }

  /**
   * The unlocked, unfinished, non-optional milestone earliest on the arc
   * (lowest stage; ties in journal order). Goals left more than
   * NEXT_GOAL_MAX_LAG stages behind the player's furthest milestone stay in
   * the journal but stop headlining, so a skipped early goal (never made a
   * sword) does not pin the HUD line for the rest of the game.
   */
  getNextGoal(): MilestoneDef | null {
    let frontier = -Infinity
    for (const id of this.completed.keys()) {
      const milestone = this.milestones.get(id)
      if (milestone && !milestone.optional) frontier = Math.max(frontier, milestone.stage)
    }
    let best: MilestoneDef | null = null
    let bestLagging: MilestoneDef | null = null
    for (const chapter of this.chapters) {
      if (!this.isChapterUnlocked(chapter)) continue
      for (const milestone of chapter.milestones) {
        if (milestone.optional || this.getState(milestone) !== 'current') continue
        if (milestone.stage < frontier - NEXT_GOAL_MAX_LAG) {
          if (!bestLagging || milestone.stage < bestLagging.stage) bestLagging = milestone
        } else if (!best || milestone.stage < best.stage) {
          best = milestone
        }
      }
    }
    return best ?? bestLagging
  }

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  onMilestoneCompleted(listener: (completion: MilestoneCompletion) => void): () => void {
    this.completionListeners.add(listener)
    return () => this.completionListeners.delete(listener)
  }

  /** A chapter became complete through a non-silent completion. */
  onChapterCompleted(listener: (chapter: ChapterDef) => void): () => void {
    this.chapterListeners.add(listener)
    return () => this.chapterListeners.delete(listener)
  }

  /** Any state change (completions, load). */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  private handleEvent(event: GameEvent): void {
    if (!this.ready) return

    if (event.type === 'item-added' || event.type === 'item-crafted') {
      if (this.recordObtained(event.itemId, this.context.getItemTags(event.itemId))) {
        this.evaluateObtain(false)
      }
    }

    for (const milestone of this.milestones.values()) {
      if (this.completed.has(milestone.id)) continue
      for (const trigger of milestone.triggers) {
        if (trigger.kind === 'event' && trigger.event === event.type && trigger.test(event)) {
          this.complete(milestone, false)
          break
        }
      }
    }
  }

  private poll(silent: boolean): void {
    let changed = false
    this.context.forEachCarriedItem((itemId, tags) => {
      if (this.recordObtained(itemId, tags)) changed = true
    })
    if (changed || silent) this.evaluateObtain(silent)

    const y = this.context.getPlayerY()
    for (const milestone of this.milestones.values()) {
      if (this.completed.has(milestone.id)) continue
      for (const trigger of milestone.triggers) {
        if (trigger.kind === 'depth' && y < trigger.belowY) {
          this.complete(milestone, silent)
          break
        }
      }
    }
  }

  /** Record a watched item (and its watched tags). Returns true if anything new was recorded. */
  private recordObtained(itemId: string, tags: ReadonlyArray<string>): boolean {
    let added = false
    if (this.watchedItems.has(itemId) && !this.obtained.has(itemId)) {
      this.obtained.add(itemId)
      added = true
    }
    for (const tag of tags) {
      const key = `tag:${tag}`
      if (this.watchedTags.has(tag) && !this.obtained.has(key)) {
        this.obtained.add(key)
        added = true
      }
    }
    return added
  }

  private isObtainSatisfied(trigger: ObtainTrigger): boolean {
    const items = trigger.items ?? []
    const tags = trigger.tags ?? []
    if (trigger.all) {
      return items.every((id) => this.obtained.has(id)) && tags.every((tag) => this.obtained.has(`tag:${tag}`))
    }
    return items.some((id) => this.obtained.has(id)) || tags.some((tag) => this.obtained.has(`tag:${tag}`))
  }

  private evaluateObtain(silent: boolean): void {
    for (const milestone of this.milestones.values()) {
      if (this.completed.has(milestone.id)) continue
      for (const trigger of milestone.triggers) {
        if (trigger.kind === 'obtain' && this.isObtainSatisfied(trigger)) {
          this.complete(milestone, silent)
          break
        }
      }
    }
  }

  /**
   * Complete a milestone and (silently) every prerequisite it implies, then
   * notify. Chapter completion is reported only for non-silent completions.
   */
  private complete(milestone: MilestoneDef, silent: boolean): void {
    if (this.completed.has(milestone.id)) return

    const chaptersBefore = new Set(this.chapters.filter((c) => this.isChapterComplete(c)))
    const now = Date.now()

    // Prerequisites first (depth-first), so listeners see a consistent order
    const implied: MilestoneDef[] = []
    const visit = (m: MilestoneDef): void => {
      for (const id of m.requires ?? []) {
        const prerequisite = this.milestones.get(id)
        if (!prerequisite || this.completed.has(id)) continue
        this.completed.set(id, now)
        visit(prerequisite)
        implied.push(prerequisite)
      }
    }
    this.completed.set(milestone.id, now)
    visit(milestone)

    // Tier tracks: the lower rungs of this milestone's tracks are moot now
    if (milestone.tracks && !milestone.optional) {
      for (const rung of this.milestones.values()) {
        if (rung.optional || rung.stage >= milestone.stage || this.completed.has(rung.id)) continue
        if (!rung.tracks?.some((track) => milestone.tracks!.includes(track))) continue
        this.completed.set(rung.id, now)
        visit(rung)
        implied.push(rung)
      }
    }

    for (const m of implied) this.notifyCompleted(m, true)
    this.notifyCompleted(milestone, silent)

    if (!silent) {
      for (const chapter of this.chapters) {
        if (!chaptersBefore.has(chapter) && this.isChapterComplete(chapter)) {
          for (const listener of this.chapterListeners) {
            try {
              listener(chapter)
            } catch (error) {
              console.error('[Progression] chapter listener threw:', error)
            }
          }
        }
      }
    }
    this.emitChange()
  }

  private notifyCompleted(milestone: MilestoneDef, silent: boolean): void {
    const chapter = this.chapterOf.get(milestone.id)
    if (!chapter) return
    const completion: MilestoneCompletion = { milestone, chapter, silent }
    for (const listener of this.completionListeners) {
      try {
        listener(completion)
      } catch (error) {
        console.error('[Progression] completion listener threw:', error)
      }
    }
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) {
      try {
        listener()
      } catch (error) {
        console.error('[Progression] change listener threw:', error)
      }
    }
  }
}
