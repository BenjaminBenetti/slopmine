import * as THREE from 'three'
import { caveBiomeAt, type CaveBiomeId, type CaveBiomeSample } from '../world/generate/caves/CaveBiomes.ts'
import { HELL_CEILING_Y } from '../world/generate/GenerationConfig.ts'
import { BlockTags } from '../world/blocks/tags/BlockTags.ts'
import type { IBlock } from '../world/interfaces/IBlock.ts'

/** A cave biome's mood: fog colour (sRGB), haze distance (blocks), light floor (linear RGB). */
interface CavePalette {
  readonly fog: string
  readonly haze: number
  readonly floor: readonly [number, number, number]
}

/**
 * Each cave biome's atmosphere. Fog colours stay darker than anything lit
 * (the haze must never brighten a dark wall - see HellGenerator's note on
 * inverted aerial perspective); floors are the light left where no light
 * reaches, tinted for the cave's mood (default floor 0.025 grey).
 */
const PALETTES: Readonly<Record<CaveBiomeId, CavePalette>> = {
  dripstone_caverns: { fog: '#2b241c', haze: 90, floor: [0.032, 0.028, 0.022] },
  mossy_grotto: { fog: '#17281a', haze: 80, floor: [0.026, 0.045, 0.028] },
  glowworm_grotto: { fog: '#0b1e26', haze: 110, floor: [0.018, 0.038, 0.05] },
  crystal_geode: { fog: '#1c2340', haze: 100, floor: [0.035, 0.042, 0.07] },
  fungal_hollow: { fog: '#152826', haze: 70, floor: [0.028, 0.045, 0.045] },
  frozen_cave: { fog: '#23323e', haze: 80, floor: [0.045, 0.055, 0.07] },
  magma_chamber: { fog: '#3a1a0e', haze: 60, floor: [0.09, 0.04, 0.018] },
  webbed_hollow: { fog: '#1a1816', haze: 55, floor: [0.022, 0.021, 0.02] },
}

/** Sky light at or below which the camera counts as fully in a cave (with rock overhead). */
const DARK_SKY_LIGHT = 2
/** Sky light at or above which it doesn't count at all. */
const OPEN_SKY_LIGHT = 9
/** How far up natural rock is looked for (blocks). */
const ROOF_SCAN = 32
/** Seconds between position probes (rock overhead, cave biome). */
const PROBE_INTERVAL = 0.25
/** Zone strength at the camera from which it counts as in that cave (journal, sounds). */
const IN_POCKET_STRENGTH = 0.4

export interface CaveAtmosphereDeps {
  readonly seed: number
  /** Packed light (sky << 4 | block) at a world position. */
  getPackedLight(x: number, y: number, z: number): number
  getBlock(x: number, y: number, z: number): IBlock
  /** Surface (layer 1) biome name at a world position (biomeRegistry region lookup). */
  getSurfaceBiome(x: number, z: number): string
}

/**
 * The cave atmosphere around the camera: how far underground it is (from
 * sky light, counted only under natural rock - a roofed house stays a house)
 * and which cave zone it is in (caveBiomeAt, the same function the
 * generation worker dresses caves with). The 'skybox' task eases toward a
 * special zone's palette and blends it in by `weight` (underground factor ×
 * zone strength): sky/fog darken to the cave's fog colour
 * (Skybox.setCaveUnderground), haze thickens to its haze distance
 * (DistanceFog.setCaveHaze), and the light floor takes its tint. Plain caves
 * (weight 0) keep the underground look they always had.
 */
export class CaveAtmosphere {
  /** 0 above ground .. 1 deep in a cave (eased). */
  factor = 0
  /** How strongly the zone's mood shows: factor × zone strength, eased (0 in plain caves). */
  weight = 0
  /** The special cave zone the camera is in, while underground (null above ground and in plain caves). */
  biome: CaveBiomeId | null = null
  readonly fogColor = new THREE.Color(0x000000)
  hazeDistance = 100
  readonly lightFloor = new THREE.Color(0.025, 0.025, 0.025)

  private probeTimer = 0
  private rockOverhead = false
  /** The last special zone probed (kept in plain caves, so its mood fades out instead of snapping). */
  private targetBiome: CaveBiomeId | null = null
  private zoneStrength = 0
  private readonly sample: CaveBiomeSample = { biome: null, strength: 0 }
  private readonly targetFog = new THREE.Color()
  private readonly targetFloor = new THREE.Color()
  private readonly blended = new THREE.Color()

  constructor(private readonly deps: CaveAtmosphereDeps) {}

  update(dt: number, camera: THREE.Vector3): void {
    this.probeTimer -= dt
    if (this.probeTimer <= 0) {
      this.probeTimer = PROBE_INTERVAL
      this.rockOverhead = camera.y > HELL_CEILING_Y && this.hasRockOverhead(camera)
      this.zoneStrength = 0
      if (this.rockOverhead) {
        caveBiomeAt(camera.x, camera.z, this.deps.seed, this.deps.getSurfaceBiome, this.sample)
        if (this.sample.biome) {
          this.targetBiome = this.sample.biome
          this.zoneStrength = this.sample.strength
        }
      }
    }
    const sky = this.deps.getPackedLight(camera.x, camera.y, camera.z) >> 4
    const target = this.rockOverhead
      ? Math.min(1, Math.max(0, (OPEN_SKY_LIGHT - sky) / (OPEN_SKY_LIGHT - DARK_SKY_LIGHT)))
      : 0
    this.factor += (target - this.factor) * Math.min(1, dt * 1.2)
    this.weight += (target * this.zoneStrength - this.weight) * Math.min(1, dt * 1.2)
    this.biome = this.factor > 0.5 && this.zoneStrength >= IN_POCKET_STRENGTH ? this.targetBiome : null

    if (!this.targetBiome) return
    const palette = PALETTES[this.targetBiome]
    this.targetFog.set(palette.fog)
    this.targetFloor.setRGB(palette.floor[0], palette.floor[1], palette.floor[2])
    const k = Math.min(1, dt * 1.5)
    this.fogColor.lerp(this.targetFog, k)
    this.lightFloor.lerp(this.targetFloor, k)
    this.hazeDistance += (palette.haze - this.hazeDistance) * k
  }

  /** The light floor to use: the biome atmosphere's, blended toward the zone's by the weight. */
  blendLightFloor(open: THREE.Color): THREE.Color {
    return this.blended.copy(open).lerp(this.lightFloor, this.weight)
  }

  private hasRockOverhead(camera: THREE.Vector3): boolean {
    const x = Math.floor(camera.x)
    const z = Math.floor(camera.z)
    const y0 = Math.floor(camera.y) + 1
    for (let y = y0; y < y0 + ROOF_SCAN; y++) {
      const props = this.deps.getBlock(x, y, z).properties
      if (props.isOpaque && (props.tags.includes(BlockTags.ROCK) || props.tags.includes(BlockTags.SOIL))) return true
    }
    return false
  }
}
