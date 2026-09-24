import * as THREE from 'three'

/**
 * Spherical fog: three.js measures fog depth along the view axis
 * (-mvPosition.z), so at our 100° FOV the screen edges get ~36% less fog than
 * the center and the chunk edge peeks out at the sides. Measuring true
 * distance instead makes the fog a sphere around the camera. Patched on the
 * shared chunk at module load, before any fogged material compiles.
 */
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = length( mvPosition.xyz );
#endif
`

/** Where the edge fog starts, as a fraction of where it ends. */
const EDGE_START_FRACTION = 0.6

/** Edge fog end as a fraction of the view distance (the drawn world's radius). */
const EDGE_END_FRACTION = 0.97

/**
 * Aerial-perspective haze distance in clear air (blocks): distant terrain
 * takes on the horizon color, 1 - 1/e (63%) of it at this distance. Absolute,
 * so the look doesn't change with the render distance or the LOD ring.
 */
const CLEAR_HAZE_DISTANCE = 1500

/** How strongly a biome's fog density shortens the haze distance. */
const HAZE_DENSITY_EXPONENT = 1.5

/**
 * The linear THREE.Fog path (fog_fragment) reinterpreted as two layers, for
 * every fogged material (patched globally, like fog_vertex):
 * - `fogFar` is where the drawn world ends; an edge ramp from
 *   EDGE_START_FRACTION·fogFar to fogFar hides it completely;
 * - `fogNear` is the aerial haze distance: exponential haze toward the fog
 *   color (1 - exp(-d / fogNear)) that tints and softens the far view without
 *   erasing it.
 * The two combine as independent layers. FogExp2 is untouched (unused).
 */
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogEdge = smoothstep( fogFar * ${EDGE_START_FRACTION}, fogFar, vFogDepth );
		float fogHaze = 1.0 - exp( - vFogDepth / max( fogNear, 1.0 ) );
		float fogFactor = 1.0 - ( 1.0 - fogEdge ) * ( 1.0 - fogHaze );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`

/**
 * A temporary fog that replaces the distance fog (e.g. while submerged):
 * `far` is where everything is fog color, `haze` the distance at which the
 * fog already hides 63% (exponential falloff before the far edge).
 */
export interface FogOverride {
  readonly color: THREE.Color
  readonly haze: number
  readonly far: number
}

/**
 * Owns the scene's single persistent THREE.Fog. Distance fog hides the edge of
 * the drawn world by fading terrain into the sky's horizon color, and an
 * absolute aerial haze (thicker in hazy biomes) gives the long view depth.
 * The fog object is never swapped or removed (that would recompile every
 * material); overrides such as underwater fog just change its parameters.
 *
 * THREE.Fog's fields carry this model's parameters (see the fog_fragment
 * patch above): `fog.far` = edge end, `fog.near` = haze distance.
 */
export class DistanceFog {
  readonly fog: THREE.Fog

  private viewDistance = 256
  private density = 1
  private readonly color = new THREE.Color(0xffffff)
  private override: FogOverride | null = null

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.Fog(0xffffff, CLEAR_HAZE_DISTANCE, 1000)
    scene.fog = this.fog
    this.update()
  }

  /** Set the radius (in blocks) at which the drawn world ends. Applies immediately. */
  setViewDistance(blocks: number): void {
    this.viewDistance = blocks
    this.update()
  }

  /** Set the fog color (linear), normally the sky's horizon color. */
  setColor(c: THREE.Color): void {
    this.color.copy(c)
  }

  /**
   * Haze thickness multiplier (>= 1) for hazy biomes: shortens the aerial
   * haze distance (density 2 → about a third). The edge fog is unaffected,
   * so haze tints and softens the far view rather than cutting it off.
   */
  setDensity(scale: number): void {
    this.density = Math.max(1, scale)
  }

  /** Replace the distance fog with a fixed one (null restores it). Applies immediately. */
  setOverride(override: FogOverride | null): void {
    this.override = override
    this.update()
  }

  /** The override's fog color while one is set (e.g. underwater), else null. */
  getOverrideColor(): THREE.Color | null {
    return this.override ? this.override.color : null
  }

  /** Current aerial haze distance in blocks (63% haze). */
  getHazeDistance(): number {
    return CLEAR_HAZE_DISTANCE / Math.pow(this.density, HAZE_DENSITY_EXPONENT)
  }

  /** Push the current state to the fog object. Call once per frame. */
  update(): void {
    const fog = this.fog
    if (this.override) {
      fog.color.copy(this.override.color)
      fog.near = this.override.haze
      fog.far = this.override.far
      return
    }
    fog.color.copy(this.color)
    fog.near = this.getHazeDistance()
    fog.far = this.viewDistance * EDGE_END_FRACTION
  }
}
