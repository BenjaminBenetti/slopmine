/**
 * What the water sounds like where the player is, for the ambience (setupAudio
 * reads it; setupWater and setupBoats write it). Plain data, safe anywhere.
 */
export interface WaterAmbience {
  /** Open sea around the player (0-1): surf. */
  sea: number
  /** A flowing river or stream close by (0-1): babbling. */
  river: number
  /** Riding a boat (0-1, more with speed): water lapping at the hull. */
  boat: number
}

export const waterAmbience: WaterAmbience = { sea: 0, river: 0, boat: 0 }
