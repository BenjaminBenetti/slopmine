import type { ITask, ITaskResult } from '../../core/interfaces/ITask.ts'
import { TaskPriority } from '../../core/interfaces/ITask.ts'
import type { IBlock, IWorld } from '../interfaces/IBlock.ts'
import type { SubChunk } from '../chunks/SubChunk.ts'
import type { ChunkColumn } from '../chunks/ChunkColumn.ts'

/** Average seconds between two random ticks of one block. */
export const RANDOM_TICK_INTERVAL = 20

/** Chunks around the player (horizontally) whose blocks get random ticks. */
const RANDOM_TICK_RADIUS = 6

/** Sub-chunks scanned for tickable blocks per run (32k cells each). */
const SCANS_PER_RUN = 6

/** Seconds between runs (ticks are spread over the elapsed time). */
const RUN_INTERVAL = 0.25

/** Block ids with onRandomTick, set once at startup. */
let tickable: Uint8Array | null = null

export interface RandomTickDeps {
  readonly world: IWorld
  getColumn(cx: number, cz: number): ChunkColumn | undefined
  getPlayerPosition(): { readonly x: number; readonly z: number }
  getBlock(id: number): IBlock
  /** Every registered block id. */
  readonly blockIds: readonly number[]
}

interface TickList {
  readonly dataVersion: number
  readonly cells: Int32Array
}

/**
 * Random block ticks: blocks near the player with `onRandomTick` (crops,
 * regrowing bushes, saplings, farmland) are visited at random, each about
 * once per RANDOM_TICK_INTERVAL seconds - the hook rolls whether anything
 * happens. Unlike scheduled ticks nothing is saved or scheduled: generated,
 * loaded and placed blocks all tick, so a farm keeps growing across reloads
 * (only while the player is within RANDOM_TICK_RADIUS chunks, like
 * Minecraft).
 *
 * Each sub-chunk's tickable cells are listed once (a scan of its block
 * array, a few sub-chunks per run) and re-listed when its data version
 * changes; the per-run cost is then proportional to the number of tickable
 * blocks, not the world.
 */
export class RandomBlockTicks implements ITask {
  readonly id = 'random-block-ticks'
  readonly priority = TaskPriority.NORMAL
  enabled = true

  private readonly lists = new WeakMap<SubChunk, TickList>()
  private elapsed = 0
  private readonly result: ITaskResult = { completed: true, elapsedMs: 0, workUnits: 0 }

  constructor(private readonly deps: RandomTickDeps) {
    if (!tickable) {
      tickable = new Uint8Array(Math.max(...deps.blockIds) + 1)
      for (const id of deps.blockIds) {
        if (typeof deps.getBlock(id).onRandomTick === 'function') tickable[id] = 1
      }
    }
  }

  execute(deltaTime: number): ITaskResult {
    this.elapsed += deltaTime
    if (this.elapsed < RUN_INTERVAL) {
      this.result.elapsedMs = 0
      this.result.workUnits = 0
      return this.result
    }
    const start = performance.now()
    const step = Math.min(this.elapsed, 2)
    this.elapsed = 0

    const player = this.deps.getPlayerPosition()
    const pcx = Math.floor(player.x / 32)
    const pcz = Math.floor(player.z / 32)
    let scans = 0
    let ticks = 0
    for (let dz = -RANDOM_TICK_RADIUS; dz <= RANDOM_TICK_RADIUS; dz++) {
      for (let dx = -RANDOM_TICK_RADIUS; dx <= RANDOM_TICK_RADIUS; dx++) {
        const column = this.deps.getColumn(pcx + dx, pcz + dz)
        if (!column) continue
        for (let subY = 0; subY < 16; subY++) {
          const sub = column.getSubChunk(subY)
          if (!sub || !sub.lightReady) continue
          let list = this.lists.get(sub)
          if (!list || list.dataVersion !== sub.dataVersion) {
            if (scans >= SCANS_PER_RUN) continue
            scans++
            list = this.scan(sub)
            this.lists.set(sub, list)
          }
          if (list.cells.length > 0) ticks += this.tickSubChunk(sub, list.cells, step)
        }
      }
    }
    this.result.elapsedMs = performance.now() - start
    this.result.workUnits = ticks
    return this.result
  }

  private scan(sub: SubChunk): TickList {
    const blocks = sub.getBlockData()
    const table = tickable!
    const found: number[] = []
    for (let i = 0; i < blocks.length; i++) {
      const id = blocks[i]
      if (id < table.length && table[id] === 1) found.push(i)
    }
    return { dataVersion: sub.dataVersion, cells: Int32Array.from(found) }
  }

  private tickSubChunk(sub: SubChunk, cells: Int32Array, step: number): number {
    // Each listed block ticks with probability step / interval this run
    const expected = (cells.length * step) / RANDOM_TICK_INTERVAL
    let count = Math.floor(expected)
    if (Math.random() < expected - count) count++
    if (count === 0) return 0
    const blocks = sub.getBlockData()
    const table = tickable!
    const baseX = sub.cx * 32
    const baseY = sub.worldYOffset
    const baseZ = sub.cz * 32
    for (let k = 0; k < count; k++) {
      const index = cells[Math.floor(Math.random() * cells.length)]
      const id = blocks[index]
      if (id >= table.length || table[id] !== 1) continue // changed since the scan
      const x = index & 31
      const z = (index >> 5) & 31
      const y = index >> 10
      this.deps.getBlock(id).onRandomTick!(
        this.deps.world,
        BigInt(baseX + x),
        BigInt(baseY + y),
        BigInt(baseZ + z),
      )
      // A tick that changed the sub-chunk re-lists it next run; stop using
      // the stale list now
      if (this.lists.get(sub)?.dataVersion !== sub.dataVersion) break
    }
    return count
  }
}
