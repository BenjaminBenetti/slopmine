import * as THREE from 'three'
import { daylightUniform } from '../renderer/worldLightShader.ts'

/**
 * Daytime insects: one GPU point cloud (one draw call) of BUTTERFLY_COUNT
 * butterflies flitting over open ground and DRAGONFLY_COUNT dragonflies
 * darting over water, around the player. Like the fireflies, the CPU only
 * picks where each one lives (its anchor: open ground in a butterfly biome,
 * or a water surface; re-picked when its life runs out or the player walks
 * away); the vertex shader moves it (butterflies: erratic flutter and little
 * hops with each wingbeat; dragonflies: fast straight darts between hover
 * spots, body pointing the way they fly) and the fragment shader draws it
 * procedurally - no textures: a butterfly's two pairs of wings flap by
 * squeezing their width, a dragonfly's four glassy wings shimmer.
 *
 * Opaque cutouts (depth-written, dithered fade in/out), fogged like the
 * world, dimmed with daylight so they don't glow at dusk.
 */

export const BUTTERFLY_COUNT = 110
export const DRAGONFLY_COUNT = 12
const TOTAL = BUTTERFLY_COUNT + DRAGONFLY_COUNT
/** Insects live within this many blocks (horizontally) of the player. */
export const BUTTERFLY_RADIUS = 28
/** Dragonflies keep closer: water is rarer, and they're small. */
const DRAGONFLY_RADIUS = 24

/** How many anchors may be (re)picked per frame (each costs a short column scan). */
const ANCHORS_PER_FRAME = 10
/** Seconds an insect lives at one anchor before fading out to a new one. */
const LIFE_RANGE: readonly [number, number] = [20, 60]
/** A rejected spot (wrong biome, no ground, under a roof) is retried after this long. */
const RETRY_RANGE: readonly [number, number] = [1.5, 5]
/** Butterflies flutter this high above the ground (blocks). */
const BUTTERFLY_HOVER: readonly [number, number] = [0.5, 2.5]
/** Dragonflies skim this high above the water (blocks). */
const DRAGONFLY_HOVER: readonly [number, number] = [0.4, 1.4]
/** Ground is searched from this far above the player's feet down to this far below. */
const SCAN_UP = 12
const SCAN_DOWN = 24
/** Out in the open only: no butterflies in caves, under roofs or deep in canopies. */
const MIN_SKY_LIGHT = 12
/** Bare ground is accepted this often; a spot over plants (grass, flowers) always. */
const BARE_GROUND_CHANCE = 0.35

/** Wing colours (sRGB): white, pale yellow, monarch orange, sky blue, lilac. */
const BUTTERFLY_COLOURS = [0xf4f1e6, 0xf2e27a, 0xe8822a, 0x7cb8ec, 0xc4a4e4]
/** Dragonfly body colours (sRGB): iridescent blue-green family. */
const DRAGONFLY_COLOURS = [0x2fa8b8, 0x3f8fd8, 0x38b07a]

/** What the swarm needs from the world (plain functions: no world imports here). */
export interface ButterflyWorld {
  /** Butterfly density of the biome at a position, 0 (none) to 1. */
  butterflyDensityAt(x: number, y: number, z: number): number
  /** Whether dragonflies live in the biome at a position. */
  hasDragonflies(x: number, y: number, z: number): boolean
  /** Whether a cell is ground an insect flies over: solid (not leaves) or a liquid surface. */
  isGround(x: number, y: number, z: number): boolean
  /** Whether a cell is a water (or swamp water) source surface. */
  isWater(x: number, y: number, z: number): boolean
  /** Whether a cell is a plant (grass, flower, fern: non-solid, not air, not liquid). */
  isPlant(x: number, y: number, z: number): boolean
  /** Whether a cell is free air (or a plant) to fly through. */
  isOpen(x: number, y: number, z: number): boolean
  /** Sky light level (0-15) of a cell. */
  skyLight(x: number, y: number, z: number): number
}

const VERTEX_SHADER = /* glsl */ `
attribute vec4 aAnchor; // xyz anchor, w 1 = placed / 0 = dormant
attribute vec4 aSeed;   // x phase, y speed, z wingbeat rate, w rank (0-1: lower ranks come out first in the morning)
attribute vec4 aStyle;  // rgb colour (linear), w kind (0 butterfly, 1 dragonfly)
attribute vec2 aLife;   // born, dies (seconds on uTime)
uniform float uTime;
uniform float uDay;
uniform float uPixelScale;
uniform vec3 uCenter;
uniform float uRadius;
varying vec3 vColour;
varying float vShow;
varying float vOpen;
varying float vKind;
varying vec2 vDir;
#include <common>
#include <fog_pars_vertex>

float insectHash( float n ) {
  return fract( sin( n ) * 43758.5453123 );
}

// Dragonfly hover spot k (a few blocks around the anchor)
vec3 dartTarget( float k ) {
  float n = k * 17.13 + aSeed.x * 113.0;
  return aAnchor.xyz + vec3( insectHash( n ) - 0.5, ( insectHash( n + 3.1 ) - 0.5 ) * 0.12, insectHash( n + 7.7 ) - 0.5 ) * 5.0;
}

void main() {
  float t = uTime;
  float ph = aSeed.x * 6.2832;
  float s = aSeed.y;
  vec3 p = aAnchor.xyz;
  vec3 heading = vec3( 0.0, 0.0, 1.0 );
  if ( aStyle.w < 0.5 ) {
    // Butterfly: wandering loops, quick zig-zags, a little hop with each wingbeat
    float beat = abs( sin( t * aSeed.z + ph ) );
    p.x += sin( t * 0.9 * s + ph ) * 1.1 + sin( t * 2.3 * s + ph * 2.1 ) * 0.35 + sin( t * 5.1 * s + ph * 3.7 ) * 0.08;
    p.z += cos( t * 0.7 * s + ph * 1.4 ) * 1.1 + sin( t * 2.1 * s + ph * 0.7 ) * 0.35 + cos( t * 4.7 * s + ph * 1.9 ) * 0.08;
    p.y += sin( t * 1.3 * s + ph * 0.6 ) * 0.35 + beat * 0.07;
    vOpen = 0.12 + 0.88 * beat;
  } else {
    // Dragonfly: hover, then a fast straight dart to the next spot
    float period = 1.2 + s * 1.4;
    float cycle = t / period + aSeed.x;
    float k = floor( cycle );
    vec3 from = dartTarget( k - 1.0 );
    vec3 to = dartTarget( k );
    p = mix( from, to, smoothstep( 0.0, 0.2, fract( cycle ) ) );
    p += vec3( sin( t * 13.0 + ph * 7.0 ), sin( t * 9.0 + ph * 3.0 ) * 0.6, cos( t * 11.0 + ph * 5.0 ) ) * 0.02;
    heading = to - from;
    if ( dot( heading.xz, heading.xz ) < 1.0e-4 ) heading = vec3( 1.0, 0.0, 0.0 );
    vOpen = 0.65 + 0.35 * abs( sin( t * 60.0 + ph * 9.0 ) );
  }

  float life = smoothstep( aLife.x, aLife.x + 2.0, t ) * ( 1.0 - smoothstep( aLife.y - 2.5, aLife.y, t ) );
  float near = 1.0 - smoothstep( uRadius * 0.75, uRadius, distance( p.xz, uCenter.xz ) );
  float show = smoothstep( aSeed.w, aSeed.w + 0.08, uDay ) * aAnchor.w;
  vShow = life * near * show;
  vColour = aStyle.rgb;
  vKind = aStyle.w;

  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  // The flight direction on screen: a dragonfly's body points along it
  vec4 ahead = modelViewMatrix * vec4( p + normalize( heading ) * 0.3, 1.0 );
  vec2 screenDir = ahead.xy / max( -ahead.z, 0.1 ) - mvPosition.xy / max( -mvPosition.z, 0.1 );
  vDir = dot( screenDir, screenDir ) > 1.0e-10 ? normalize( screenDir ) : vec2( 0.0, 1.0 );

  gl_Position = projectionMatrix * mvPosition;
  float size = aStyle.w < 0.5 ? 0.26 : 0.34;
  gl_PointSize = vShow > 0.02 ? clamp( uPixelScale * size / max( -mvPosition.z, 0.1 ), 2.0, 56.0 ) : 0.0;
  #include <fog_vertex>
}
`

const FRAGMENT_SHADER = /* glsl */ `
uniform float uDaylight;
varying vec3 vColour;
varying float vShow;
varying float vOpen;
varying float vKind;
varying vec2 vDir;
#include <common>
#include <fog_pars_fragment>

float insectDither( vec2 p ) {
  return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

void main() {
  // Fade in and out by screen-door dithering (opaque cutout, no sorting)
  if ( vShow < insectDither( gl_FragCoord.xy ) ) discard;
  vec2 c = ( gl_PointCoord - 0.5 ) * 2.0;
  c.y = -c.y;
  vec3 colour;
  if ( vKind < 0.5 ) {
    // Butterfly, body upright: wings flap by squeezing their width
    float body = step( abs( c.x ), 0.07 ) * step( abs( c.y + 0.02 ), 0.42 );
    vec2 w = vec2( abs( c.x ) / max( vOpen, 0.12 ), c.y );
    vec2 fore = ( w - vec2( 0.5, 0.2 ) ) / vec2( 0.46, 0.4 );
    vec2 hind = ( w - vec2( 0.36, -0.28 ) ) / vec2( 0.32, 0.3 );
    float df = dot( fore, fore );
    float dh = dot( hind, hind );
    float wing = step( min( df, dh ), 1.0 ) * step( 0.06, abs( c.x ) );
    if ( body < 0.5 && wing < 0.5 ) discard;
    // Dark wing margins and a pale spot on each forewing
    vec3 wingColour = mix( vColour, vColour * 0.25, smoothstep( 0.62, 0.9, min( df, dh ) ) * 0.85 );
    vec2 spot = fore - vec2( 0.25, 0.2 );
    wingColour = mix( wingColour, vec3( 0.92 ), step( dot( spot, spot ), 0.05 ) * 0.6 );
    colour = body > 0.5 ? vec3( 0.02, 0.018, 0.015 ) : wingColour;
  } else {
    // Dragonfly, turned to its flight direction (f.y forward)
    vec2 f = vec2( c.x * vDir.y - c.y * vDir.x, c.x * vDir.x + c.y * vDir.y );
    float body = step( abs( f.x ), 0.06 ) * step( -0.85, f.y ) * step( f.y, 0.55 );
    vec2 headOffset = f - vec2( 0.0, 0.62 );
    float head = step( dot( headOffset, headOffset ), 0.012 );
    vec2 side = vec2( abs( f.x ), f.y );
    vec2 fore = ( side - vec2( 0.42, 0.28 ) ) / vec2( 0.42 * vOpen, 0.09 );
    vec2 hind = ( side - vec2( 0.4, 0.08 ) ) / vec2( 0.4 * vOpen, 0.08 );
    float wing = step( min( dot( fore, fore ), dot( hind, hind ) ), 1.0 );
    float solid = max( body, head );
    if ( solid < 0.5 && wing < 0.5 ) discard;
    // Glassy wings: pale, and half of their pixels let the world through
    if ( solid < 0.5 && insectDither( gl_FragCoord.xy + 7.0 ) > 0.55 ) discard;
    colour = solid > 0.5 ? mix( vColour, vColour * 0.45, 1.0 - smoothstep( -0.8, 0.0, f.y ) ) : vec3( 0.6, 0.78, 0.86 );
  }
  // Lit roughly like the world around them: dimmer as the day fades
  colour *= mix( 0.4, 1.0, uDaylight );
  gl_FragColor = vec4( colour, 1.0 );
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

function between(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0])
}

export class ButterflySwarm {
  readonly object: THREE.Points

  private readonly anchors: Float32Array
  private readonly lives: Float32Array
  private readonly anchorAttribute: THREE.BufferAttribute
  private readonly lifeAttribute: THREE.BufferAttribute
  private readonly material: THREE.ShaderMaterial
  /** Next time (uTime) each insect needs a new anchor. */
  private readonly nextAnchorAt: Float32Array
  private time = 0
  private cursor = 0

  constructor(private readonly world: ButterflyWorld) {
    const geometry = new THREE.BufferGeometry()
    this.anchors = new Float32Array(TOTAL * 4)
    this.lives = new Float32Array(TOTAL * 2)
    const seeds = new Float32Array(TOTAL * 4)
    const styles = new Float32Array(TOTAL * 4)
    const colour = new THREE.Color()
    for (let i = 0; i < TOTAL; i++) {
      const dragonfly = i >= BUTTERFLY_COUNT
      seeds[i * 4] = Math.random()
      seeds[i * 4 + 1] = 0.7 + Math.random() * 0.6
      // Wingbeat (rad/s): butterflies ~3-4 beats a second
      seeds[i * 4 + 2] = 18 + Math.random() * 8
      seeds[i * 4 + 3] = Math.random() * 0.85
      const palette = dragonfly ? DRAGONFLY_COLOURS : BUTTERFLY_COLOURS
      colour.setHex(palette[Math.floor(Math.random() * palette.length)]) // sRGB → linear
      styles[i * 4] = colour.r
      styles[i * 4 + 1] = colour.g
      styles[i * 4 + 2] = colour.b
      styles[i * 4 + 3] = dragonfly ? 1 : 0
    }
    this.nextAnchorAt = new Float32Array(TOTAL)
    this.anchorAttribute = new THREE.BufferAttribute(this.anchors, 4)
    this.anchorAttribute.setUsage(THREE.DynamicDrawUsage)
    this.lifeAttribute = new THREE.BufferAttribute(this.lives, 2)
    this.lifeAttribute.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aAnchor', this.anchorAttribute)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    geometry.setAttribute('aStyle', new THREE.BufferAttribute(styles, 4))
    geometry.setAttribute('aLife', this.lifeAttribute)
    // three needs a position attribute to size the draw; the shader never reads it
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TOTAL * 3), 3))

    this.material = new THREE.ShaderMaterial({
      name: 'ButterflyMaterial',
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uDay: { value: 0 },
        uPixelScale: { value: 300 },
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: BUTTERFLY_RADIUS },
        uDaylight: daylightUniform,
      },
      fog: true,
    })
    this.object = new THREE.Points(geometry, this.material)
    this.object.name = 'Butterflies'
    // Positions live in the shader: the geometry's bounds mean nothing
    this.object.frustumCulled = false
    // Next to the fireflies, after the sky dome. Always visible - at night
    // every point has size 0 - so the loading screen's shader warm-up
    // compiles its program and the first morning never stalls on a link
    this.object.renderOrder = 510
  }

  /**
   * Advance one frame.
   * @param day 0 (night, or not on the surface) to 1 (full day)
   * @param center the player's feet
   * @param pixelScale drawing-buffer height / (2·tan(fov/2)): world size → pixels at depth 1
   */
  update(deltaTime: number, day: number, center: THREE.Vector3, pixelScale: number): void {
    this.time += deltaTime
    const uniforms = this.material.uniforms
    uniforms.uTime.value = this.time
    uniforms.uDay.value = day
    uniforms.uPixelScale.value = pixelScale
    ;(uniforms.uCenter.value as THREE.Vector3).copy(center)

    if (day <= 0.01) {
      // Night: nobody is out; everyone picks a fresh spot in the morning
      this.nextAnchorAt.fill(0)
      return
    }

    // Re-anchor insects whose life ran out or who were left behind, a few per frame
    let budget = ANCHORS_PER_FRAME
    let anchorsChanged = false
    const reachSq = (BUTTERFLY_RADIUS + 4) * (BUTTERFLY_RADIUS + 4)
    for (let n = 0; n < TOTAL && budget > 0; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % TOTAL
      const dx = this.anchors[i * 4] - center.x
      const dz = this.anchors[i * 4 + 2] - center.z
      const leftBehind = this.anchors[i * 4 + 3] > 0 && dx * dx + dz * dz > reachSq
      if (this.time < this.nextAnchorAt[i] && !leftBehind) continue
      if (i < BUTTERFLY_COUNT) this.placeButterfly(i, center)
      else this.placeDragonfly(i, center)
      anchorsChanged = true
      budget--
    }
    if (anchorsChanged) {
      this.anchorAttribute.needsUpdate = true
      this.lifeAttribute.needsUpdate = true
    }
  }

  /** Pick a new spot over open ground for butterfly `i` (or leave it dormant). */
  private placeButterfly(i: number, center: THREE.Vector3): void {
    const { x, z } = this.randomSpot(center, BUTTERFLY_RADIUS)
    const groundY = this.findGround(x, center.y, z)
    if (groundY === null || this.world.isWater(x, groundY, z)) return this.leaveDormant(i)
    if (Math.random() >= this.world.butterflyDensityAt(x, center.y, z)) return this.leaveDormant(i)
    // Drawn to plants: bare ground only sometimes
    if (!this.world.isPlant(x, groundY + 1, z) && Math.random() >= BARE_GROUND_CHANCE) return this.leaveDormant(i)
    const hoverY = groundY + 1 + between(BUTTERFLY_HOVER)
    if (!this.world.isOpen(x, hoverY, z) || this.world.skyLight(x, hoverY, z) < MIN_SKY_LIGHT) return this.leaveDormant(i)
    this.place(i, x, hoverY, z)
  }

  /** Pick a new spot over open water for dragonfly `i` (or leave it dormant). */
  private placeDragonfly(i: number, center: THREE.Vector3): void {
    const { x, z } = this.randomSpot(center, DRAGONFLY_RADIUS)
    const groundY = this.findGround(x, center.y, z)
    if (groundY === null || !this.world.isWater(x, groundY, z)) return this.leaveDormant(i)
    if (!this.world.hasDragonflies(x, center.y, z)) return this.leaveDormant(i)
    const hoverY = groundY + 1 + between(DRAGONFLY_HOVER)
    if (!this.world.isOpen(x, hoverY, z) || this.world.skyLight(x, hoverY, z) < MIN_SKY_LIGHT) return this.leaveDormant(i)
    this.place(i, x, hoverY, z)
  }

  private randomSpot(center: THREE.Vector3, radius: number): { x: number; z: number } {
    const angle = Math.random() * Math.PI * 2
    // Linear in distance (not area): more of them close by, where they show
    const distance = 2 + Math.random() * (radius - 2)
    return { x: center.x + Math.cos(angle) * distance, z: center.z + Math.sin(angle) * distance }
  }

  private place(i: number, x: number, y: number, z: number): void {
    const life = between(LIFE_RANGE)
    this.anchors[i * 4] = x
    this.anchors[i * 4 + 1] = y
    this.anchors[i * 4 + 2] = z
    this.anchors[i * 4 + 3] = 1
    this.lives[i * 2] = this.time
    this.lives[i * 2 + 1] = this.time + life
    this.nextAnchorAt[i] = this.time + life
  }

  private leaveDormant(i: number): void {
    this.anchors[i * 4 + 3] = 0
    this.lives[i * 2] = this.time
    this.lives[i * 2 + 1] = this.time
    this.nextAnchorAt[i] = this.time + between(RETRY_RANGE)
  }

  /** Top of the ground (or water surface) under (x, z) near the player's height, or null. */
  private findGround(x: number, feetY: number, z: number): number | null {
    const top = Math.floor(feetY) + SCAN_UP
    const bottom = Math.floor(feetY) - SCAN_DOWN
    for (let y = top; y >= bottom; y--) {
      if (this.world.isGround(x, y, z)) return y
    }
    return null
  }

  dispose(): void {
    this.object.geometry.dispose()
    this.material.dispose()
  }
}
