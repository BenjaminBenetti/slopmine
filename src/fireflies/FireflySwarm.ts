import * as THREE from 'three'

/**
 * The fireflies: one GPU point cloud (one draw call) of up to FIREFLY_COUNT
 * glowing dots around the player. The CPU only picks where each one hovers
 * (its anchor: a spot of open ground in a firefly biome, re-picked when its
 * life runs out or the player walks away from it); the vertex shader makes
 * it wander around the anchor and blink, and fades it in and out with its
 * life, its distance and the night.
 *
 * Self-lit and additive: no fog (they live within ~30 blocks), no depth write.
 */

export const FIREFLY_COUNT = 200
/** Fireflies hover within this many blocks (horizontally) of the player. */
export const FIREFLY_RADIUS = 28

/** How many anchors may be (re)picked per frame (each costs a short column scan). */
const ANCHORS_PER_FRAME = 12
/** Seconds a firefly lives at one anchor before drifting off (fading out) to a new one. */
const LIFE_RANGE: readonly [number, number] = [25, 70]
/** A spot rejected (wrong biome, no ground, under a roof) is retried after this long. */
const RETRY_RANGE: readonly [number, number] = [2, 6]
/** Hover height above the ground (blocks). */
const HOVER_RANGE: readonly [number, number] = [0.4, 3.0]
/** Ground is searched from this far above the player's feet down to this far below. */
const SCAN_UP = 12
const SCAN_DOWN = 24
/** Fireflies keep to (mostly) open sky: never deep under roofs or in caves. */
const MIN_SKY_LIGHT = 7
/** World size of a firefly's glow (blocks). */
const GLOW_SIZE = 0.3

/** What the swarm needs from the world (plain functions: no world imports here). */
export interface FireflyWorld {
  /** Firefly density of the biome at a position, 0 (none) to 1 (the swamp). */
  densityAt(x: number, y: number, z: number): number
  /** Whether a cell is ground a firefly hovers over: solid (not leaves) or a liquid surface. */
  isGround(x: number, y: number, z: number): boolean
  /** Whether a cell is free air to hover in. */
  isAir(x: number, y: number, z: number): boolean
  /** Sky light level (0-15) of a cell. */
  skyLight(x: number, y: number, z: number): number
}

const VERTEX_SHADER = /* glsl */ `
attribute vec4 aAnchor; // xyz anchor, w 1 = placed / 0 = dormant
attribute vec4 aSeed;   // x phase, y wander speed, z blink rate, w rank (0-1: lower ranks come out first at dusk)
attribute vec2 aLife;   // born, dies (seconds on uTime)
uniform float uTime;
uniform float uNight;
uniform float uPixelScale;
uniform vec3 uCenter;
uniform float uRadius;
varying float vGlow;

void main() {
  float t = uTime;
  float ph = aSeed.x * 6.2832;
  float s = aSeed.y;
  vec3 p = aAnchor.xyz;
  // Lazy wandering loops around the anchor, with a little bob
  p.x += sin( t * 0.37 * s + ph ) * 1.6 + sin( t * 0.93 * s + ph * 2.7 ) * 0.5;
  p.z += cos( t * 0.29 * s + ph * 1.3 ) * 1.6 + sin( t * 0.81 * s + ph * 0.6 ) * 0.5;
  p.y += sin( t * 0.53 * s + ph * 0.8 ) * 0.45 + sin( t * 1.9 * s + ph * 3.1 ) * 0.12;

  // Blink: a soft flash every few seconds over a dimmer glow
  float wave = 0.5 + 0.5 * sin( t * aSeed.z + ph * 7.0 );
  float blink = 0.3 + 0.7 * smoothstep( 0.55, 0.95, wave );

  float life = smoothstep( aLife.x, aLife.x + 2.0, t ) * ( 1.0 - smoothstep( aLife.y - 2.5, aLife.y, t ) );
  float near = 1.0 - smoothstep( uRadius * 0.75, uRadius, distance( p.xz, uCenter.xz ) );
  float show = smoothstep( aSeed.w, aSeed.w + 0.08, uNight ) * aAnchor.w;
  vGlow = blink * life * near * show;

  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = vGlow > 0.002 ? clamp( uPixelScale * ${GLOW_SIZE.toFixed(3)} / max( -mvPosition.z, 0.1 ), 3.0, 40.0 ) : 0.0;
}
`

const FRAGMENT_SHADER = /* glsl */ `
varying float vGlow;

void main() {
  float r = length( gl_PointCoord - 0.5 ) * 2.0;
  if ( r > 1.0 ) discard;
  float core = 1.0 - smoothstep( 0.0, 0.3, r );
  float halo = 1.0 - r;
  halo *= halo;
  // Yellow-green halo around a pale core (display colours, additive)
  vec3 colour = vec3( 0.66, 1.0, 0.2 ) * halo * 1.1 + vec3( 1.0, 1.0, 0.75 ) * core;
  gl_FragColor = vec4( colour * vGlow, 1.0 );
}
`

function between(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0])
}

export class FireflySwarm {
  readonly object: THREE.Points

  private readonly anchors: Float32Array
  private readonly lives: Float32Array
  private readonly anchorAttribute: THREE.BufferAttribute
  private readonly lifeAttribute: THREE.BufferAttribute
  private readonly material: THREE.ShaderMaterial
  /** Next time (uTime) each firefly needs a new anchor. */
  private readonly nextAnchorAt: Float32Array
  private time = 0
  private cursor = 0

  constructor(private readonly world: FireflyWorld) {
    const geometry = new THREE.BufferGeometry()
    this.anchors = new Float32Array(FIREFLY_COUNT * 4)
    this.lives = new Float32Array(FIREFLY_COUNT * 2)
    const seeds = new Float32Array(FIREFLY_COUNT * 4)
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      seeds[i * 4] = Math.random()
      seeds[i * 4 + 1] = 0.6 + Math.random() * 0.8
      seeds[i * 4 + 2] = 1.1 + Math.random() * 1.4
      seeds[i * 4 + 3] = Math.random() * 0.9
    }
    this.nextAnchorAt = new Float32Array(FIREFLY_COUNT)
    this.anchorAttribute = new THREE.BufferAttribute(this.anchors, 4)
    this.anchorAttribute.setUsage(THREE.DynamicDrawUsage)
    this.lifeAttribute = new THREE.BufferAttribute(this.lives, 2)
    this.lifeAttribute.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aAnchor', this.anchorAttribute)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    geometry.setAttribute('aLife', this.lifeAttribute)
    // three needs a position attribute to size the draw; the shader never reads it
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FIREFLY_COUNT * 3), 3))

    this.material = new THREE.ShaderMaterial({
      name: 'FireflyMaterial',
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uPixelScale: { value: 300 },
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: FIREFLY_RADIUS },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    this.object = new THREE.Points(geometry, this.material)
    this.object.name = 'Fireflies'
    // Positions live in the shader: the geometry's bounds mean nothing
    this.object.frustumCulled = false
    // After the sky dome (renderOrder 500). Always visible - by day every
    // point has size 0 - so the loading screen's shader warm-up compiles its
    // program and dusk never stalls on a link
    this.object.renderOrder = 510
  }

  /**
   * Advance one frame.
   * @param night 0 (day, or not on the surface) to 1 (full night)
   * @param center the player's feet
   * @param pixelScale drawing-buffer height / (2·tan(fov/2)): world size → pixels at depth 1
   */
  update(deltaTime: number, night: number, center: THREE.Vector3, pixelScale: number): void {
    this.time += deltaTime
    const uniforms = this.material.uniforms
    uniforms.uTime.value = this.time
    uniforms.uNight.value = night
    uniforms.uPixelScale.value = pixelScale
    ;(uniforms.uCenter.value as THREE.Vector3).copy(center)

    if (night <= 0.01) {
      // Day: nobody is out; everyone picks a fresh spot when the night comes
      this.nextAnchorAt.fill(0)
      return
    }

    // Re-anchor fireflies whose life ran out or who were left behind, a few per frame
    let budget = ANCHORS_PER_FRAME
    let anchorsChanged = false
    const reachSq = (FIREFLY_RADIUS + 4) * (FIREFLY_RADIUS + 4)
    for (let n = 0; n < FIREFLY_COUNT && budget > 0; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % FIREFLY_COUNT
      const dx = this.anchors[i * 4] - center.x
      const dz = this.anchors[i * 4 + 2] - center.z
      const leftBehind = this.anchors[i * 4 + 3] > 0 && dx * dx + dz * dz > reachSq
      if (this.time < this.nextAnchorAt[i] && !leftBehind) continue
      this.placeFirefly(i, center)
      anchorsChanged = true
      budget--
    }
    if (anchorsChanged) {
      this.anchorAttribute.needsUpdate = true
      this.lifeAttribute.needsUpdate = true
    }
  }

  /** Pick a new spot for firefly `i` (or leave it dormant and retry soon). */
  private placeFirefly(i: number, center: THREE.Vector3): void {
    const angle = Math.random() * Math.PI * 2
    // Linear in distance (not area): more of them close by, where they show
    const distance = 2 + Math.random() * (FIREFLY_RADIUS - 2)
    const x = center.x + Math.cos(angle) * distance
    const z = center.z + Math.sin(angle) * distance
    const groundY = this.findGround(x, center.y, z)
    const hoverY = groundY === null ? 0 : groundY + 1 + between(HOVER_RANGE)
    const placed = groundY !== null &&
      Math.random() < this.world.densityAt(x, center.y, z) &&
      this.world.isAir(x, hoverY, z) &&
      this.world.skyLight(x, hoverY, z) >= MIN_SKY_LIGHT

    if (!placed) {
      this.anchors[i * 4 + 3] = 0
      this.lives[i * 2] = this.time
      this.lives[i * 2 + 1] = this.time
      this.nextAnchorAt[i] = this.time + between(RETRY_RANGE)
      return
    }
    const life = between(LIFE_RANGE)
    this.anchors[i * 4] = x
    this.anchors[i * 4 + 1] = hoverY
    this.anchors[i * 4 + 2] = z
    this.anchors[i * 4 + 3] = 1
    this.lives[i * 2] = this.time
    this.lives[i * 2 + 1] = this.time + life
    this.nextAnchorAt[i] = this.time + life
  }

  /** Top of the ground under (x, z) near the player's height, or null. */
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
