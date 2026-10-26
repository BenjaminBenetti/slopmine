import * as THREE from 'three'
import type { BiomeAtmosphere } from './BiomeAtmosphere.ts'
import { SKY_ZENITH_HEX } from './BiomeAtmosphere.ts'
import { createCloudNoiseTexture } from './cloudNoise.ts'
import type { DayNightState } from './DayNightSky.ts'
import { WEATHER_FIELD_GLSL, WEATHER_MARCH_MAX, weatherFieldSky, weatherFieldUniforms } from '../weather/WeatherFieldShader.ts'
import { VolumetricClouds } from '../clouds/VolumetricClouds.ts'
import { CLOUD_LIGHT_GLSL, cloudShadowUniforms } from '../worldLightShader.ts'

export interface SkyboxOptions {
  skyRadius?: number
  zenithColor?: THREE.Color
  sunColor?: THREE.Color
}

/** The moon's light on the clouds (linear colour × strength), and the sun's (× its colour). */
const MOONLIGHT = new THREE.Color(0.42, 0.5, 0.68).multiplyScalar(0.11)
const SUN_ON_CLOUDS = 0.95


/**
 * The weather as the sky shows it (setupWeather, every frame). Far off it
 * comes from the weather map (renderer/weather/WeatherFieldShader.ts: cloud
 * cover, storm darkness and tint under each patch of cloud; rain walls,
 * sandstorms and fog banks along the horizon), so a storm far off shows as a
 * dark deck and a grey wall on that side of the sky while the sun is out
 * overhead. These are the weather at the player.
 */
export interface SkyWeather {
  /** At the player: the dome greyed (overcast), dimmed (storm), tinted (sand, ash, mist). */
  skyGrey: number
  dim: number
  readonly tint: THREE.Color
  tintAmount: number
  /** Sun disc and glow hidden (0-1). */
  sunDim: number
  /** How far the weather has drifted (blocks): the clouds travel with their weather systems. */
  cloudDriftX: number
  cloudDriftZ: number
  /** Lightning: 0-1 brightness, toward flashDir (a far flash lights one side of the sky). */
  flash: number
  readonly flashDir: THREE.Vector3
  rainbow: number
  aurora: number
  meteors: number
  heatHaze: number
}

export function createSkyWeather(): SkyWeather {
  return {
    skyGrey: 0, dim: 1, tint: new THREE.Color(1, 1, 1), tintAmount: 0, sunDim: 0, cloudDriftX: 0, cloudDriftZ: 0,
    flash: 0, flashDir: new THREE.Vector3(0, 1, 0), rainbow: 0, aurora: 0, meteors: 0, heatHaze: 0,
  }
}

/**
 * Average strength of the twilight glow across all view directions at the
 * horizon (the shader's `0.18 + 0.82 * toward²` over a full turn): what the
 * distance fog takes from it.
 */
const TWILIGHT_FOG_SHARE = 0.49

/**
 * Sky dome: horizon-to-zenith gradient, sun disc + glow, moon and stars and a
 * drifting cloud layer, all computed per pixel in a single draw call. Biome
 * atmosphere (tint, brightness, horizon haze) comes from the shared
 * BiomeAtmosphere, the time of day from DayNightSky (setDayNight), and the
 * horizon color doubles as the distance-fog color (see getHorizonColor).
 */
export class Skybox {
  readonly skyMesh: THREE.Mesh
  private readonly atmosphere: BiomeAtmosphere
  private readonly skyMaterial: THREE.ShaderMaterial
  private readonly cloudTexture: THREE.DataTexture

  /** Current underground darkness factor (0 = open sky, 1 = underground). */
  private darkness = 0

  /** Time of day (null = always day). */
  private dayNight: DayNightState | null = null
  private skyTime = 0

  // Darkness transition thresholds
  private readonly darknessStartY = 180
  private readonly darknessEndY = 150
  /** Cave override (caves/CaveAtmosphere.ts): how far underground the camera is, and that cave's fog colour (linear). */
  private caveFactor = 0
  private readonly caveColor = new THREE.Color()
  private readonly mixedUnderground = new THREE.Color()
  /** The weather (setWeather); null until the weather system starts. */
  private weather: SkyWeather | null = null
  private readonly baseHorizon = new THREE.Color()
  /** The clouds: rendered just before the dome draws (skyMesh.onBeforeRender), composited by it. */
  private readonly clouds = new VolumetricClouds()
  private readonly screenSize = new THREE.Vector2()
  private readonly zenithNow = new THREE.Color()

  constructor(atmosphere: BiomeAtmosphere, options: SkyboxOptions = {}) {
    const {
      skyRadius = 500,
      zenithColor = new THREE.Color(SKY_ZENITH_HEX),
      sunColor = new THREE.Color(1.0, 0.93, 0.8),
    } = options

    this.atmosphere = atmosphere
    this.cloudTexture = createCloudNoiseTexture()
    this.skyMaterial = this.createSkyMaterial(zenithColor, sunColor)
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(skyRadius, 32, 16), this.skyMaterial)
    // The clouds render into their own target right before the dome draws (the camera's matrices are current)
    this.skyMesh.onBeforeRender = (renderer, _scene, camera) => this.renderClouds(renderer, camera)

    // Render after the world's opaque geometry (renderOrder 0) but before
    // debug overlays (999+) that skip depth writes; transparent meshes still
    // blend over it. At the far plane it only shades uncovered pixels.
    this.skyMesh.renderOrder = 500
    this.skyMesh.frustumCulled = false
  }

  private createSkyMaterial(zenithColor: THREE.Color, sunColor: THREE.Color): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        zenithColor: { value: zenithColor },
        horizonColor: { value: new THREE.Color() },
        undergroundColor: { value: new THREE.Color() },
        skyTint: { value: new THREE.Color(1, 1, 1) },
        skyBrightness: { value: 1.0 },
        darkness: { value: 0.0 },
        fogOverrideColor: { value: new THREE.Color() },
        fogOverride: { value: 0.0 },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: sunColor },
        cloudNoise: { value: this.cloudTexture },
        uClouds: { value: null },
        uCloudsOn: { value: 0.0 },
        uScreenSize: { value: new THREE.Vector2(1, 1) },
        moonDirection: { value: new THREE.Vector3(0, -1, 0) },
        night: { value: 0.0 },
        twilight: { value: 0.0 },
        twilightColor: { value: new THREE.Color() },
        nightZenith: { value: new THREE.Color() },
        nightHorizon: { value: new THREE.Color() },
        skyTime: { value: 0.0 },
        ...weatherFieldUniforms,
        ...cloudShadowUniforms,
        uFogColor: { value: new THREE.Color() },
        uSkyGrey: { value: 0.0 },
        uWeatherDim: { value: 1.0 },
        uWeatherTint: { value: new THREE.Color(1, 1, 1) },
        uWeatherTintAmount: { value: 0.0 },
        uSunDim: { value: 0.0 },
        uFlash: { value: 0.0 },
        uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
        uRainbow: { value: 0.0 },
        uAurora: { value: 0.0 },
        uMeteors: { value: 0.0 },
        uHeatHaze: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPosition;
        void main() {
          // Local position: the dome is centered on the camera, so this is the view direction
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          // Pin to the far plane: drawn after the terrain, the depth test then
          // skips every pixel already covered, and no dome radius can clip it.
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenithColor;
        uniform vec3 horizonColor;
        uniform vec3 undergroundColor;
        uniform vec3 skyTint;
        uniform float skyBrightness;
        uniform float darkness;
        uniform vec3 fogOverrideColor;
        uniform float fogOverride;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        uniform sampler2D cloudNoise;
        uniform sampler2D uClouds;
        uniform float uCloudsOn;
        uniform vec2 uScreenSize;
        uniform vec3 moonDirection;
        uniform float night;
        uniform float twilight;
        uniform vec3 twilightColor;
        uniform vec3 nightZenith;
        uniform vec3 nightHorizon;
        uniform float skyTime;
        uniform vec3 uFogColor;
        uniform float uSkyGrey;
        uniform float uWeatherDim;
        uniform vec3 uWeatherTint;
        uniform float uWeatherTintAmount;
        uniform float uSunDim;
        uniform float uFlash;
        uniform vec3 uFlashDir;
        uniform float uRainbow;
        uniform float uAurora;
        uniform float uMeteors;
        uniform float uHeatHaze;
        varying vec3 vLocalPosition;
        #include <common>
        #include <dithering_pars_fragment>
        #define SLOP_WX_STEPS 16
        ${WEATHER_FIELD_GLSL}
        ${CLOUD_LIGHT_GLSL}

        float starHash(vec3 p3) {
          p3 = fract(p3 * 0.1031);
          p3 += dot(p3, p3.zyx + 31.32);
          return fract((p3.x + p3.y) * p3.z);
        }

        vec3 starHash3(vec3 p3) {
          p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yxz + 33.33);
          return fract((p3.xxy + p3.yxx) * p3.zyx);
        }

        // Rainbow colour across the bow (0 = inner violet .. 1 = outer red)
        vec3 bowColor(float x) {
          return clamp(vec3(
            1.2 * smoothstep(0.45, 0.95, x) + 0.35 * (1.0 - smoothstep(0.0, 0.25, x)),
            1.0 - abs(x - 0.55) * 2.6,
            1.0 - smoothstep(0.15, 0.5, x)
          ), 0.0, 1.0);
        }

        // A shooting star: slot i, streak brightness along dir
        float meteor(vec3 dir, float i) {
          const float period = 2.6;
          float clock = skyTime + i * 0.917;
          float cycle = floor(clock / period);
          vec3 r = starHash3(vec3(cycle, i * 17.0, 3.0));
          if (r.x > uMeteors * 0.55) return 0.0;
          float s = fract(clock / period) * period;
          const float life = 0.75;
          if (s > life) return 0.0;
          float az = r.y * 6.2832;
          float el = 0.35 + 0.45 * r.z;
          vec3 start = vec3(cos(az) * cos(el), sin(el), sin(az) * cos(el));
          vec3 side = normalize(cross(start, vec3(0.0, 1.0, 0.0)));
          vec3 travel = normalize(side * (r.z - 0.5) * 2.0 - vec3(0.0, 0.55, 0.0));
          vec3 p0 = start;
          vec3 p1 = normalize(start + travel * 0.32);
          float k = s / life;
          vec3 head = normalize(mix(p0, p1, k));
          vec3 tail = normalize(mix(p0, p1, max(0.0, k - 0.3)));
          vec3 seg = head - tail;
          float t = clamp(dot(dir - tail, seg) / max(dot(seg, seg), 1e-6), 0.0, 1.0);
          float d = length(dir - (tail + seg * t));
          float width = 0.0016 + 0.0008 * t;
          float fade = sin(k * 3.1416);
          return (1.0 - smoothstep(width * 0.3, width, d)) * t * t * fade;
        }

        void main() {
          vec3 dir = normalize(vLocalPosition);
          float h = dir.y;
          float aboveHorizon = smoothstep(-0.01, 0.015, h);

          // Gradient: horizon color at and below the horizon (matches the
          // fog), sliding to the night palette after sunset
          vec3 zenith = mix(zenithColor * skyTint, nightZenith, night);
          vec3 horizon = mix(horizonColor, nightHorizon, night);
          vec3 color = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));

          // Twilight: a warm band low in the sky, strongest toward the sun
          float toward = 0.5;
          float flatLen = length(dir.xz);
          float sunFlatLen = length(sunDirection.xz);
          if (flatLen > 1e-3 && sunFlatLen > 1e-3) toward = dot(dir.xz / flatLen, sunDirection.xz / sunFlatLen) * 0.5 + 0.5;
          float band = exp(-max(h, 0.0) * 5.0) * smoothstep(-0.3, 0.0, h);
          color += twilightColor * twilight * band * (0.18 + 0.82 * toward * toward);

          // Overcast: the dome greys toward an even cloud-light
          color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.97, 0.99, 1.03), uSkyGrey);

          // Aurora: folded curtains of green and violet light at night
          if (uAurora > 0.0 && night > 0.0 && h > 0.0) {
            float az = atan(dir.x, dir.z);
            float drift = skyTime * 0.012;
            float fold = texture2D(cloudNoise, vec2(az * 0.18 + drift, 0.37)).r;
            float sway = texture2D(cloudNoise, vec2(az * 0.55 - drift * 1.7, 0.71)).g;
            float baseH = 0.1 + 0.22 * fold;
            float above = h - baseH;
            float curtain = smoothstep(-0.015, 0.02, above) * exp(-max(above, 0.0) * 5.0);
            float rays = 0.55 + 0.45 * sin(az * 140.0 + sway * 14.0 + skyTime * 0.35);
            float strength = smoothstep(0.25, 0.7, sway + 0.25);
            vec3 auroraColor = mix(vec3(0.12, 1.0, 0.42), vec3(0.62, 0.22, 1.0), smoothstep(0.02, 0.3, above));
            color += auroraColor * curtain * rays * strength * uAurora * night * 0.42;
          }

          // Stars: one candidate per cell of a grid on the view direction,
          // drawn at least ~1.5 px wide (fwidth) so they never shimmer
          if (night > 0.0 && h > 0.0) {
            vec3 p = dir * 150.0;
            vec3 cell = floor(p);
            float pick = starHash(cell);
            if (pick > 0.9935) {
              vec3 at = starHash3(cell) * 0.4 + 0.3;
              float d = length(fract(p) - at);
              float size = 0.06 + 0.1 * fract(pick * 173.0);
              float radius = max(size, length(fwidth(p)) * 0.9);
              float star = (1.0 - smoothstep(radius * 0.25, radius, d)) * (size * size) / (radius * radius);
              float twinkle = 0.75 + 0.25 * sin(skyTime * (1.5 + 3.0 * fract(pick * 91.0)) + pick * 400.0);
              float bright = 0.7 + 3.5 * pow(fract(pick * 7919.0), 4.0);
              color += vec3(0.82, 0.88, 1.0) * star * bright * twinkle * night * smoothstep(0.03, 0.3, h);
            }
          }

          // Moon: a mottled pale disc with a soft glow, faint by day
          float moonDot = dot(dir, moonDirection);
          if (moonDot > 0.0) {
            float moonShow = (0.12 + 0.88 * night) * aboveHorizon;
            color += vec3(0.55, 0.65, 0.9) * (pow(moonDot, 30.0) * 0.025 + pow(moonDot, 600.0) * 0.12) * night * aboveHorizon;
            float disc = smoothstep(0.99915, 0.99935, moonDot);
            if (disc > 0.0) {
              vec3 tangent = normalize(cross(moonDirection, vec3(0.0, 1.0, 0.001)));
              vec3 bitangent = cross(tangent, moonDirection);
              vec3 onDisc = dir - moonDirection * moonDot;
              vec2 moonUv = vec2(dot(onDisc, tangent), dot(onDisc, bitangent)) / 0.0365;
              float maria = texture2D(cloudNoise, moonUv * 0.28 + vec2(0.31, 0.57)).r;
              float rim = 1.0 - 0.25 * dot(moonUv, moonUv);
              vec3 moonColor = vec3(1.0, 0.98, 0.92) * (0.62 + 0.5 * smoothstep(0.35, 0.75, maria)) * rim * 1.35;
              color = mix(color, moonColor, disc * moonShow);
            }
          }

          // Sun: broad atmospheric glow, tight halo and a soft-edged disc
          // (the disc sets behind the horizon)
          float sunDot = max(dot(dir, sunDirection), 0.0);
          float sunShow = 1.0 - uSunDim;
          // (its halo is cut by the clouds' shadows in the air: shafts of light around a sun behind broken cloud)
          vec4 godRays = texture2D(uGodRayMap, gl_FragCoord.xy * uGodRayParams.zw);
          float sunlitAir = godRays.g > 1e-4 && uGodRaySun.w > 0.0 ? mix(1.0, godRays.r / godRays.g, min(1.0, godRays.g * 1.5)) : 1.0;
          color += sunColor * (pow(sunDot, 12.0) * 0.16 * (0.15 + 0.85 * sunlitAir) + pow(sunDot, 180.0) * 0.55) * (1.0 - night * 0.85) * sunShow;
          color += sunColor * 3.0 * smoothstep(0.99885, 0.99925, sunDot) * aboveHorizon * sunShow;

          // Shooting stars (meteor showers)
          if (uMeteors > 0.0 && night > 0.0 && h > 0.05) {
            float streak = 0.0;
            for (int i = 0; i < 6; i++) streak += meteor(dir, float(i));
            color += vec3(0.9, 0.95, 1.0) * streak * night * 2.5;
          }

          // Rainbow opposite the sun: the primary bow at ~42°, a faint reversed secondary at ~51°
          if (uRainbow > 0.0 && sunDirection.y > 0.0) {
            // A high sun puts a real bow below the horizon: hold the sun at most ~24° up for it
            float sunFlat = max(length(sunDirection.xz), 1e-3);
            float bowElevation = min(asin(clamp(sunDirection.y, -1.0, 1.0)), 0.42);
            vec3 bowSun = vec3(sunDirection.x / sunFlat * cos(bowElevation), sin(bowElevation), sunDirection.z / sunFlat * cos(bowElevation));
            float angle = degrees(acos(clamp(dot(dir, -bowSun), -1.0, 1.0)));
            float primary = (angle - 40.4) / 2.2;
            float secondary = (53.2 - angle) / 3.0;
            vec3 bow = vec3(0.0);
            if (primary > 0.0 && primary < 1.0) bow += bowColor(primary) * sin(primary * 3.1416) * 0.38;
            if (secondary > 0.0 && secondary < 1.0) bow += bowColor(secondary) * sin(secondary * 3.1416) * 0.12;
            color += bow * uRainbow * smoothstep(-0.01, 0.06, h) * (1.0 - night) * smoothstep(0.0, 0.12, sunDirection.y);
          }

          float flashLight = uFlash * (0.2 + 0.8 * pow(max(dot(dir, uFlashDir), 0.0), 3.0));
          // Clouds: the volumetric clouds (renderer/clouds), rendered at a lower resolution this frame
          if (uCloudsOn > 0.5) {
            vec4 cloud = texture2D(uClouds, gl_FragCoord.xy / uScreenSize);
            color = color * (1.0 - cloud.a) + cloud.rgb;
          }

          // Heat shimmer: a bright, rippling mirage band on the horizon
          if (uHeatHaze > 0.0) {
            float band = 1.0 - smoothstep(0.0, 0.045, abs(h - 0.005));
            float ripple = 0.65 + 0.35 * sin(atan(dir.x, dir.z) * 220.0 + skyTime * 2.7) * sin(h * 900.0 - skyTime * 4.1);
            color += vec3(1.0, 0.94, 0.82) * band * ripple * uHeatHaze * 0.14 * (1.0 - night);
          }

          // Weather over the whole dome: storm dimming, then the weather's tint; lightning
          color *= uWeatherDim;
          color += vec3(0.6, 0.65, 0.8) * flashLight * 0.35;

          color *= skyBrightness;
          // Underground: fade to the (biome) underground color
          color = mix(color, undergroundColor, darkness);
          color *= mix(vec3(1.0), uWeatherTint, uWeatherTintAmount);
          // The weather far off along this ray (rain walls, sandstorms, fog banks: like the land's edge
          // in front of it), then the weather here
          // God rays through the gaps between clouds (as on the land: worldLightShader)
          color = slopApplyGodRays(color, uFogColor, 1.0 - smoothstep(0.0, 0.45, h), dir, slopGodRaysAt(1500.0));
          vec4 wxFar = slopWeatherFar(cameraPosition, dir, ${WEATHER_MARCH_MAX.toFixed(1)});
          color = color * (1.0 - wxFar.a) + wxFar.rgb;
          color = mix(color, uFogColor, slopWeatherNear(${WEATHER_MARCH_MAX.toFixed(1)}));
          // Inside a liquid the sky is beyond the (short) liquid fog's far end
          color = mix(color, fogOverrideColor, fogOverride);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // Sub-LSB noise: smooth, dim gradients (overcast or hazy skies) band
          // visibly in 8 bits otherwise
          #include <dithering_fragment>
        }
      `,
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false,
      fog: false,
      dithering: true,
    })
  }

  /**
   * While the distance fog is overridden (camera inside a liquid), show the
   * override's fog color instead of the sky: everything beyond the liquid
   * fog's far end is fog, and the sky seen up through a water surface would
   * otherwise stay bright and unfogged. Null restores the sky.
   */
  setFogOverride(color: THREE.Color | null): void {
    const u = this.skyMaterial.uniforms
    u.fogOverride.value = color ? 1 : 0
    if (color) (u.fogOverrideColor.value as THREE.Color).copy(color)
  }

  /** Set the sun direction (normalized internally) to match the directional light. */
  setSunDirection(direction: THREE.Vector3): void {
    ;(this.skyMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(direction).normalize()
  }

  /**
   * Follow the time of day: sun and moon, twilight glow, the night palette
   * and stars (read every update; the state object is kept, not copied).
   */
  setDayNight(state: DayNightState | null): void {
    this.dayNight = state
  }

  /**
   * The final displayed horizon color (linear): the tinted/hazed horizon with
   * biome brightness and underground darkness applied - exactly what the dome
   * shows at and below the horizon, so distance fog blends into the sky.
   */
  getHorizonColor(target: THREE.Color): THREE.Color {
    return this.horizon(target, true)
  }

  /** The horizon colour as displayed, with or without the weather at the player. */
  private horizon(target: THREE.Color, withWeather: boolean): THREE.Color {
    const a = this.atmosphere
    target.copy(a.horizonColor)
    const dn = this.dayNight
    if (dn) {
      target.lerp(dn.nightHorizon, dn.night)
      target.r += dn.twilightColor.r * dn.twilight * TWILIGHT_FOG_SHARE
      target.g += dn.twilightColor.g * dn.twilight * TWILIGHT_FOG_SHARE
      target.b += dn.twilightColor.b * dn.twilight * TWILIGHT_FOG_SHARE
    }
    return this.displayedSky(target, withWeather)
  }

  /**
   * The sky overhead as displayed (linear): what water reflects looking
   * straight up (the dome's zenith, with its night, weather, brightness and
   * underground steps).
   */
  getZenithColor(target: THREE.Color): THREE.Color {
    target.copy(this.skyMaterial.uniforms.zenithColor.value as THREE.Color).multiply(this.atmosphere.skyTint)
    const dn = this.dayNight
    if (dn) target.lerp(dn.nightZenith, dn.night)
    return this.displayedSky(target, true)
  }

  /** The dome's colour steps after its gradient: weather grey and dim, flash, brightness, underground, tint. */
  private displayedSky(target: THREE.Color, withWeather: boolean): THREE.Color {
    const a = this.atmosphere
    // The same weather steps as the dome's horizon (see the shader)
    const w = withWeather ? this.weather : null
    if (w) {
      const luma = (0.2126 * target.r + 0.7152 * target.g + 0.0722 * target.b) * w.skyGrey
      target.setRGB(
        target.r * (1 - w.skyGrey) + luma * 0.97,
        target.g * (1 - w.skyGrey) + luma * 0.99,
        target.b * (1 - w.skyGrey) + luma * 1.03,
      )
      const flash = w.flash * 0.2 * 0.35
      target.multiplyScalar(w.dim)
      target.r += 0.6 * flash
      target.g += 0.65 * flash
      target.b += 0.8 * flash
    }
    target.multiplyScalar(a.skyBrightness).lerp(this.undergroundColor(), this.darkness)
    if (w && w.tintAmount > 0) {
      target.r *= 1 + (w.tint.r - 1) * w.tintAmount
      target.g *= 1 + (w.tint.g - 1) * w.tintAmount
      target.b *= 1 + (w.tint.b - 1) * w.tintAmount
    }
    return target
  }

  /** Show the weather (null: none). Read every update; the object is kept, not copied. */
  setWeather(weather: SkyWeather | null): void {
    this.weather = weather
  }

  /**
   * In a cave: the sky and fog darken toward this cave's fog colour as the
   * camera goes underground (`factor` 0-1, from sky light - see
   * caves/CaveAtmosphere.ts), whatever its height.
   */
  setCaveUnderground(factor: number, color: THREE.Color): void {
    this.caveFactor = factor
    this.caveColor.copy(color)
  }

  /** The biome's underground colour, blended toward the cave's while in one. */
  private undergroundColor(): THREE.Color {
    return this.mixedUnderground.copy(this.atmosphere.undergroundColor).lerp(this.caveColor, this.caveFactor)
  }

  /** Call each frame to keep the dome centered on the camera and apply the atmosphere. */
  update(camera: THREE.Camera, deltaTime: number = 0.016): void {
    const cameraPos = camera.position
    this.skyMesh.position.copy(cameraPos)

    // Y-based darkness (dark below darknessEndY, normal above darknessStartY),
    // or the cave factor when deeper underground by sky light
    this.darkness = Math.max(
      this.caveFactor,
      Math.min(1, (this.darknessStartY - cameraPos.y) / (this.darknessStartY - this.darknessEndY))
    )

    const u = this.skyMaterial.uniforms
    const a = this.atmosphere
    u.darkness.value = this.darkness
    u.skyBrightness.value = a.skyBrightness
    ;(u.skyTint.value as THREE.Color).copy(a.skyTint)
    ;(u.horizonColor.value as THREE.Color).copy(a.horizonColor)
    ;(u.undergroundColor.value as THREE.Color).copy(this.undergroundColor())

    const dn = this.dayNight
    if (dn) {
      ;(u.sunDirection.value as THREE.Vector3).copy(dn.sunDirection)
      ;(u.moonDirection.value as THREE.Vector3).copy(dn.moonDirection)
      ;(u.sunColor.value as THREE.Color).copy(dn.sunColor)
      ;(u.twilightColor.value as THREE.Color).copy(dn.twilightColor)
      ;(u.nightZenith.value as THREE.Color).copy(dn.nightZenith)
      ;(u.nightHorizon.value as THREE.Color).copy(dn.nightHorizon)
      u.night.value = dn.night
      u.twilight.value = dn.twilight
    }
    this.skyTime = (this.skyTime + deltaTime) % 1000
    u.skyTime.value = this.skyTime

    const w = this.weather
    // The weather here (the near part of every ray) is the fog's colour; the weather far off colours
    // itself from the horizon without it
    this.getHorizonColor(u.uFogColor.value as THREE.Color)
    this.horizon(this.baseHorizon, false)
    weatherFieldSky.x = this.baseHorizon.r
    weatherFieldSky.y = this.baseHorizon.g
    weatherFieldSky.z = this.baseHorizon.b
    if (w) {
      u.uSkyGrey.value = w.skyGrey
      u.uWeatherDim.value = w.dim
      ;(u.uWeatherTint.value as THREE.Color).copy(w.tint)
      u.uWeatherTintAmount.value = w.tintAmount * (1 - this.caveFactor)
      u.uSunDim.value = w.sunDim
      u.uFlash.value = w.flash
      ;(u.uFlashDir.value as THREE.Vector3).copy(w.flashDir)
      u.uRainbow.value = w.rainbow
      u.uAurora.value = w.aurora
      u.uMeteors.value = w.meteors
      u.uHeatHaze.value = w.heatHaze
    }

    this.lightClouds(dn, w)
  }

  /**
   * What the clouds are lit by: the sun (until well after sunset - it lights
   * their bases from below the horizon - then the moon), the sky's zenith and
   * horizon as ambient light; the biome's fair-weather cover and cloud colour;
   * lightning; the weather's drift.
   */
  private lightClouds(dn: DayNightState | null, w: SkyWeather | null): void {
    const l = this.clouds.lighting
    const a = this.atmosphere
    const u = this.skyMaterial.uniforms
    const sunDir = u.sunDirection.value as THREE.Vector3
    const night = dn ? dn.night : 0
    const sunUp = Math.min(1, Math.max(0, (sunDir.y + 0.12) / 0.17))
    if (sunUp > 0 || !dn) {
      l.lightDir.copy(sunDir)
      l.lightColor.copy(u.sunColor.value as THREE.Color).multiplyScalar(SUN_ON_CLOUDS * (dn ? sunUp : 1))
    } else {
      l.lightDir.copy(dn.moonDirection)
      l.lightColor.copy(MOONLIGHT).multiplyScalar(Math.min(1, Math.max(0, dn.moonDirection.y * 4)))
    }
    this.zenithNow.copy(u.zenithColor.value as THREE.Color).multiply(a.skyTint)
    if (dn) this.zenithNow.lerp(dn.nightZenith, night)
    // Clouds are lit by the whole sky: whiter than the zenith's blue
    l.ambientTop.copy(this.zenithNow).multiplyScalar(0.55).addScalar(0.18 * (1 - night))
    l.horizon.copy(a.horizonColor)
    if (dn) {
      l.horizon.lerp(dn.nightHorizon, night)
      l.horizon.r += dn.twilightColor.r * dn.twilight * TWILIGHT_FOG_SHARE
      l.horizon.g += dn.twilightColor.g * dn.twilight * TWILIGHT_FOG_SHARE
      l.horizon.b += dn.twilightColor.b * dn.twilight * TWILIGHT_FOG_SHARE
    }
    l.ambientBottom.copy(l.horizon).multiplyScalar(0.5)
    l.coverage = a.cloudCoverage
    l.opacity = a.cloudOpacity
    l.tint.copy(a.cloudTint).multiply(this.zenithNow.setRGB(1, 1, 1).lerp(a.skyTint, 0.5))
    l.flash = w ? w.flash : 0
    if (w) l.flashDir.copy(w.flashDir)
    l.driftX = w ? w.cloudDriftX : 0
    l.driftZ = w ? w.cloudDriftZ : 0
  }

  /** Render this frame's clouds and hand them to the dome (skyMesh.onBeforeRender). */
  private renderClouds(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const u = this.skyMaterial.uniforms
    // Nothing to see underground, in a cave or under water: skip the work (and start over after)
    if (this.darkness > 0.97 || u.fogOverride.value > 0.5 || !this.clouds.ready) {
      u.uCloudsOn.value = 0
      this.clouds.invalidate()
      this.clouds.hideShadows()
      return
    }
    // A nested render: keep the frame's stats and shadow maps as they are
    const autoReset = renderer.info.autoReset
    const shadowAuto = renderer.shadowMap.autoUpdate
    renderer.info.autoReset = false
    renderer.shadowMap.autoUpdate = false
    this.clouds.render(renderer, camera)
    renderer.info.autoReset = autoReset
    renderer.shadowMap.autoUpdate = shadowAuto
    renderer.getDrawingBufferSize(this.screenSize)
    ;(u.uScreenSize.value as THREE.Vector2).copy(this.screenSize)
    u.uClouds.value = this.clouds.texture
    u.uCloudsOn.value = this.clouds.texture ? 1 : 0
  }

  /** The clouds' history is stale (the weather jumped): they start over. */
  resetClouds(): void {
    this.clouds.invalidate()
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.skyMesh)
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.skyMesh)
  }

  dispose(): void {
    this.skyMesh.geometry.dispose()
    this.skyMaterial.dispose()
    this.cloudTexture.dispose()
    this.clouds.dispose()
  }
}
