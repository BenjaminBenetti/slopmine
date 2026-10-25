import * as THREE from 'three'
import { HELL_CEILING_Y } from '../world/generate/GenerationConfig.ts'
import { WEATHER_FIELD_GLSL, WEATHER_MARCH_MAX, weatherFieldParams, weatherFieldUniforms } from './weather/WeatherFieldShader.ts'

/**
 * Spherical fog: three.js measures fog depth along the view axis
 * (-mvPosition.z), so at our 100° FOV the screen edges get ~36% less fog than
 * the center and the chunk edge peeks out at the sides. Measuring true
 * distance instead makes the fog a sphere around the camera. Patched on the
 * shared chunk at module load, before any fogged material compiles.
 *
 * `vFogOffset` is the fragment's offset from the camera in world space (the
 * view-space offset rotated back: v · R = Rᵀv): its height for the cavern
 * ceiling haze and ground fog, its direction for the weather far off.
 */
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = length( mvPosition.xyz );
	vFogOffset = mvPosition.xyz * mat3( viewMatrix );
#endif
`
THREE.ShaderChunk.fog_pars_vertex = THREE.ShaderChunk.fog_pars_vertex.replace(
  'varying float vFogDepth;',
  'varying float vFogDepth;\n\tvarying vec3 vFogOffset;'
)

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
 * Cavern ceiling haze (the Hell layer): smoke gathers under the cavern's rock
 * ceiling (HELL_CEILING_Y, the underside of the surface layer). Its density
 * per block is CEILING_HAZE_DENSITY at the ceiling and falls off downward
 * exponentially over CEILING_HAZE_SCALE_HEIGHT blocks; there is none above
 * the ceiling (inside the rock, and the whole surface world). The ceiling
 * seen straight up from anywhere in the cavern is hazed 1 - exp(-0.12 * 8)
 * = 62%, more at an angle (75% at 45°) - it reads as dark rock fading into
 * the haze, not as a lit slab with an edge, and tall pillars and spires fade
 * into it toward the top. Near the floor the haze is negligible; standing
 * high (Y 125) it hazes a level view by ~30% at 20 blocks.
 */
const CEILING_HAZE_DENSITY = 0.12
const CEILING_HAZE_SCALE_HEIGHT = 8

/**
 * Ground fog (weather: valley fog, sea fog, ghost fog...): a layer of fog
 * of `x` density per block up to world height `y`, thinning out above it over
 * `z` blocks. One plain object shared by every fogged program: three copies
 * uniform values that are vectors or colours per material, but passes a
 * plain object through by reference, so setting it here reaches them all.
 * Materials whose uniforms lack it read 0 (no ground fog).
 */
export const groundFogParams = { x: 0, y: 0, z: 4 }
;(THREE.UniformsLib.fog as Record<string, THREE.IUniform>).slopGroundFog = { value: groundFogParams }
// The weather far off (renderer/weather/WeatherFieldShader.ts): every fogged material reads the weather map
Object.assign(THREE.UniformsLib.fog, weatherFieldUniforms)
for (const shader of Object.values(THREE.ShaderLib)) {
  if (shader.uniforms && 'fogColor' in shader.uniforms) {
    shader.uniforms.slopGroundFog = { value: groundFogParams }
    for (const [name, uniform] of Object.entries(weatherFieldUniforms)) shader.uniforms[name] = { value: uniform.value }
  }
}

/** GLSL float literal. */
function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

/**
 * Fragment declarations for the fog: three's (fogColor, fogNear/far, the
 * depth varying) plus the rise varying and the ceiling haze function.
 *
 * slopCeilingHaze: opacity of the ceiling smoke between the camera (world
 * height camY) and a fragment `rise` blocks above it at distance `dist`. The
 * optical depth is the distance times the mean density along the straight
 * ray, integrated analytically over height (exp((y - ceiling) / H), clamped
 * at the ceiling); a level ray uses the density at its height.
 */
THREE.ShaderChunk.fog_pars_fragment = THREE.ShaderChunk.fog_pars_fragment.replace(
  'varying float vFogDepth;',
  /* glsl */ `varying float vFogDepth;
	varying vec3 vFogOffset;
	${WEATHER_FIELD_GLSL}
	float slopCeilingHaze( float camY, float rise, float dist ) {
		const float ceilingY = ${glslFloat(HELL_CEILING_Y)};
		const float scaleHeight = ${glslFloat(CEILING_HAZE_SCALE_HEIGHT)};
		const float density = ${glslFloat(CEILING_HAZE_DENSITY)};
		float g0 = exp( ( min( camY, ceilingY ) - ceilingY ) / scaleHeight );
		float g1 = exp( ( min( camY + rise, ceilingY ) - ceilingY ) / scaleHeight );
		// A level ray has the density at the camera's height - none above the
		// ceiling (g0 is clamped to 1 there: using it painted a fog-coloured
		// line at eye level across the whole surface world)
		float levelDensity = camY < ceilingY ? density * g0 : 0.0;
		float meanDensity = abs( rise ) > 0.01 ? density * scaleHeight * ( g1 - g0 ) / rise : levelDensity;
		return 1.0 - exp( - dist * meanDensity );
	}
	uniform vec3 slopGroundFog;
	// Ground fog's optical depth up to height y (density x below y, thinning above over z blocks)
	float slopGroundDepth( float y ) {
		float over = max( y - slopGroundFog.y, 0.0 );
		return slopGroundFog.x * ( min( y, slopGroundFog.y ) + slopGroundFog.z * ( 1.0 - exp( - over / slopGroundFog.z ) ) );
	}
	float slopGroundFogAmount( float camY, float rise, float dist ) {
		if ( slopGroundFog.x <= 0.0 ) return 0.0;
		float levelDensity = slopGroundFog.x * exp( - max( camY - slopGroundFog.y, 0.0 ) / slopGroundFog.z );
		float meanDensity = abs( rise ) > 0.01 ? ( slopGroundDepth( camY + rise ) - slopGroundDepth( camY ) ) / rise : levelDensity;
		return 1.0 - exp( - dist * max( meanDensity, 0.0 ) );
	}`
)

/**
 * The linear THREE.Fog path (fog_fragment) reinterpreted as three layers, for
 * every fogged material (patched globally, like fog_vertex):
 * - `fogFar` is where the drawn world ends; an edge ramp from
 *   EDGE_START_FRACTION·fogFar to fogFar hides it completely;
 * - `fogNear` is the aerial haze distance: exponential haze toward the fog
 *   color (1 - exp(-d / fogNear)) that tints and softens the far view without
 *   erasing it;
 * - the cavern ceiling haze (slopCeilingHaze), zero outside the Hell cavern;
 * - the weather's ground fog (slopGroundFogAmount, groundFogParams).
 * They combine as independent layers. Over them goes the weather: far off
 * from the weather map along the ray (a storm on the horizon - land in the
 * edge fog reads as far as the sky behind it does, so it melts into the same
 * weather), then the weather here over the ray's first stretch, in the fog
 * colour. FogExp2 is untouched (unused).
 */
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogEdge = smoothstep( fogFar * ${EDGE_START_FRACTION}, fogFar, vFogDepth );
		float fogHaze = 1.0 - exp( - vFogDepth / max( fogNear, 1.0 ) );
		float fogCeiling = slopCeilingHaze( cameraPosition.y, vFogOffset.y, vFogDepth );
		float fogGround = slopGroundFogAmount( cameraPosition.y, vFogOffset.y, vFogDepth );
		float fogFactor = 1.0 - ( 1.0 - fogEdge ) * ( 1.0 - fogHaze ) * ( 1.0 - fogCeiling ) * ( 1.0 - fogGround );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#ifndef FOG_EXP2
		vec4 slopWxFar = slopWeatherFar( cameraPosition, vFogOffset / max( vFogDepth, 1e-3 ), mix( vFogDepth, ${glslFloat(WEATHER_MARCH_MAX)}, fogEdge ) );
		gl_FragColor.rgb = gl_FragColor.rgb * ( 1.0 - slopWxFar.a ) + slopWxFar.rgb;
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, slopWeatherNear( vFogDepth ) );
	#endif
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
  /** Cave haze (caves/CaveAtmosphere.ts): haze distance in a cave, blended in by how far underground the camera is. */
  private caveHaze = Infinity
  private caveWeight = 0
  /** Weather haze here: extinction per block (setWeatherHaze), and whether the weather map has weather to show far off. */
  private weatherExtinction = 0
  private weatherField = 0

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

  /**
   * Thicker haze in caves: blends the haze distance toward `haze` blocks
   * (each cave biome's own, e.g. 90) by `weight` (0 surface .. 1 deep in a
   * cave). The fog colour is the sky's horizon, which darkens to the cave's
   * fog colour at the same time (Skybox.setCaveUnderground).
   */
  setCaveHaze(haze: number, weight: number): void {
    this.caveHaze = haze
    this.caveWeight = weight
  }

  /**
   * Weather haze here (rain, sandstorms, fog): extinction per block (1 / its
   * visibility distance), over the near part of every ray while the weather
   * map is read (setWeatherField), else over all of it. Caves keep their own
   * haze.
   */
  setWeatherHaze(extinction: number): void {
    this.weatherExtinction = Math.max(0, extinction)
  }

  /** Read the weather map along rays (renderer/weather/WeatherFieldShader.ts): 0 off .. 1 on. */
  setWeatherField(amount: number): void {
    this.weatherField = Math.min(1, Math.max(0, amount))
  }

  /**
   * Weather ground fog: `density` per block up to world height `top`,
   * thinning out above over `scale` blocks (0 density = none).
   */
  setGroundFog(density: number, top: number, scale = 5): void {
    groundFogParams.x = Math.max(0, density) * (1 - this.caveWeight)
    groundFogParams.y = top
    groundFogParams.z = Math.max(0.5, scale)
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

  /** Current aerial haze distance in blocks (63% haze; the weather's haze is a layer of its own). */
  getHazeDistance(): number {
    const open = CLEAR_HAZE_DISTANCE / Math.pow(this.density, HAZE_DENSITY_EXPONENT)
    if (this.caveWeight <= 0) return open
    // Blend in log space: a steady thickening from open air into the cave
    return Math.exp(Math.log(open) + (Math.log(Math.min(open, this.caveHaze)) - Math.log(open)) * this.caveWeight)
  }

  /** Push the current state to the fog object. Call once per frame. */
  update(): void {
    const fog = this.fog
    if (this.override) {
      fog.color.copy(this.override.color)
      fog.near = this.override.haze
      fog.far = this.override.far
      weatherFieldParams.y = 0
      weatherFieldParams.z = 0
      return
    }
    // The weather's haze thins out into a cave, and nothing is read far off from one
    weatherFieldParams.y = this.weatherField * (1 - this.caveWeight)
    weatherFieldParams.w = (performance.now() / 1000) % 3600
    weatherFieldParams.z = this.weatherExtinction * (1 - this.caveWeight)
    fog.color.copy(this.color)
    fog.near = this.getHazeDistance()
    fog.far = this.viewDistance * EDGE_END_FRACTION
  }
}
