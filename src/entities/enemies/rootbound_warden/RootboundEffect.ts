import { playerEffects, registerStatusEffectInfo } from '../../../player/effects/StatusEffects.ts'

/**
 * "Rootbound": the Rootbound Warden's snare - roots grip the player's legs.
 * A short, heavy movement slow (its own effect, so the HUD does not call it
 * Frostbite). The behaviour is a camera-controls speed modifier installed by
 * the Ember Grove setup.
 */
export const ROOTBOUND_EFFECT = 'rootbound'

/** Movement speed while rootbound. */
const ROOTBOUND_SPEED = 0.35

/** Register the effect's HUD info and its movement penalty (main thread, once). */
export function installRootboundEffect(controls: { addSpeedModifier(modifier: () => number): () => void }): void {
  registerStatusEffectInfo(ROOTBOUND_EFFECT, { name: 'Rootbound', color: '#3fbfae', beneficial: false })
  controls.addSpeedModifier(() => (playerEffects.has(ROOTBOUND_EFFECT) ? ROOTBOUND_SPEED : 1))
}
