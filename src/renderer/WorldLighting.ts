import * as THREE from 'three'

export interface WorldLightingOptions {
  sunIntensity?: number
  ambientIntensity?: number
  sunColor?: number
  ambientColor?: number
  timeOfDay?: number // 0-24 hours
}

export class WorldLighting {
  readonly sun: THREE.DirectionalLight
  readonly ambient: THREE.AmbientLight

  constructor(options: WorldLightingOptions = {}) {
    const {
      sunIntensity = 2.0,
      ambientIntensity = 1.0,
      sunColor = 0xffffff,
      ambientColor = 0xffffff,
      timeOfDay = 10,
    } = options

    this.ambient = new THREE.AmbientLight(ambientColor, ambientIntensity)
    this.sun = new THREE.DirectionalLight(sunColor, sunIntensity)

    this.setTimeOfDay(timeOfDay)
  }

  setTimeOfDay(hour: number): void {
    // Convert hour (0-24) to sun position
    // 6am = sunrise (east), 12pm = noon (overhead), 6pm = sunset (west)
    const normalizedHour = ((hour - 6) / 12) * Math.PI // 0 at 6am, PI at 6pm

    const distance = 150
    const x = Math.cos(normalizedHour) * distance
    const y = Math.sin(normalizedHour) * distance
    const z = 50 // Slight offset for depth

    this.sun.position.set(x, Math.max(y, 10), z)
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.ambient)
    scene.add(this.sun)
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.ambient)
    scene.remove(this.sun)
  }

  dispose(): void {
    this.sun.dispose()
    this.ambient.dispose()
  }
}
