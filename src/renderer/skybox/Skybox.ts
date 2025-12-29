import * as THREE from 'three'
import cloudTextureUrl from './assets/cloud.webp'

export interface SkyboxOptions {
  skyRadius?: number
  zenithColor?: THREE.Color
  horizonColor?: THREE.Color
  sunColor?: THREE.Color
  sunSize?: number
  cloudCount?: number
}

export class Skybox {
  readonly skyMesh: THREE.Mesh
  readonly sunMesh: THREE.Mesh
  readonly cloudGroup: THREE.Group
  private readonly skyRadius: number

  constructor(options: SkyboxOptions = {}) {
    const {
      skyRadius = 500,
      zenithColor = new THREE.Color(0x1e90ff), // Deep blue at top
      horizonColor = new THREE.Color(0x87ceeb), // Light sky blue at horizon
      sunColor = new THREE.Color(0xffff80), // Bright yellow-white
      sunSize = 30,
      cloudCount = 20,
    } = options

    this.skyRadius = skyRadius

    // Create sky dome with gradient shader
    this.skyMesh = this.createSkyDome(zenithColor, horizonColor, skyRadius)

    // Create sun disc
    this.sunMesh = this.createSunDisc(sunColor, sunSize)

    // Create cloud group
    this.cloudGroup = this.createClouds(cloudCount, skyRadius * 0.8)
  }

  private createSkyDome(
    zenithColor: THREE.Color,
    horizonColor: THREE.Color,
    radius: number
  ): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, 32, 32)

    // Custom shader for gradient from horizon to zenith
    const material = new THREE.ShaderMaterial({
      uniforms: {
        zenithColor: { value: zenithColor },
        horizonColor: { value: horizonColor },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenithColor;
        uniform vec3 horizonColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          // Clamp to 0-1 range (horizon at y=0, zenith at y=1)
          float t = clamp(h, 0.0, 1.0);
          // Smooth transition
          t = pow(t, 0.5);
          vec3 color = mix(horizonColor, zenithColor, t);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false,
    })

    return new THREE.Mesh(geometry, material)
  }

  private createSunDisc(color: THREE.Color, size: number): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(size, 32)
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(geometry, material)
    // Add a glow effect with a slightly larger, more transparent circle
    const glowGeometry = new THREE.CircleGeometry(size * 1.5, 32)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffcc),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    })
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    glow.position.z = -0.1 // Slightly behind the sun
    mesh.add(glow)

    return mesh
  }

  private createClouds(count: number, radius: number): THREE.Group {
    const group = new THREE.Group()

    // Load cloud texture from asset
    const textureLoader = new THREE.TextureLoader()
    const texture = textureLoader.load(cloudTextureUrl)
    texture.colorSpace = THREE.SRGBColorSpace

    for (let i = 0; i < count; i++) {
      // Vary opacity per cloud for soft, natural look
      const baseOpacity = 0.5 + Math.random() * 0.4

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: baseOpacity,
        alphaTest: 0.01, // Discard nearly-transparent pixels
        depthWrite: false,
      })

      const sprite = new THREE.Sprite(material)

      // Position clouds in upper hemisphere
      const phi = Math.random() * Math.PI * 0.4 + Math.PI * 0.1
      const theta = Math.random() * Math.PI * 2

      const x = radius * Math.cos(phi) * Math.cos(theta)
      const y = radius * Math.sin(phi)
      const z = radius * Math.cos(phi) * Math.sin(theta)

      sprite.position.set(x, y, z)
      sprite.scale.set(80 + Math.random() * 60, 30 + Math.random() * 20, 1)

      group.add(sprite)
    }

    return group
  }

  /** Update sun position to match directional light */
  setSunPosition(position: THREE.Vector3): void {
    // Place sun at normalized direction from origin, scaled to sky radius
    const dir = position.clone().normalize()
    this.sunMesh.position.copy(dir.multiplyScalar(this.skyRadius * 0.95))
    // Make sun face the camera (origin)
    this.sunMesh.lookAt(0, 0, 0)
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.skyMesh)
    scene.add(this.sunMesh)
    scene.add(this.cloudGroup)
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.skyMesh)
    scene.remove(this.sunMesh)
    scene.remove(this.cloudGroup)
  }

  dispose(): void {
    this.skyMesh.geometry.dispose()
    ;(this.skyMesh.material as THREE.Material).dispose()
    this.sunMesh.geometry.dispose()
    ;(this.sunMesh.material as THREE.Material).dispose()

    this.cloudGroup.children.forEach((child) => {
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose()
        child.material.dispose()
      }
    })
  }
}
