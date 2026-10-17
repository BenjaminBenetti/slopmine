/**
 * Generative composer: turns a mood and a seed into a piece, one chord span
 * at a time (the player asks for the next span shortly before it is due).
 *
 * Form: a pad-and-harmony intro phrase, melodic phrases built from two
 * motifs (A, then a varied B, then A again...), and an outro phrase that
 * settles on the tonic. A phrase is one pass through the chosen progression.
 * Melody notes on strong beats are chord tones; motifs are re-anchored to
 * each chord so they move with the harmony instead of clashing with it.
 * Pure (no Web Audio) - the same seed always writes the same piece.
 */

import { createRng, type Rng } from '../synth/dsp.ts'
import type { InstrumentId } from '../synth/instruments.ts'
import type { MoodDef, PadStyle } from './MusicMoods.ts'

export interface NoteEvent {
  kind: 'note'
  /** Seconds from the span start. */
  time: number
  instrument: InstrumentId
  midi: number
  /** 0-1. */
  velocity: number
  /** -1..1 stereo position. */
  pan: number
}

export interface PadEvent {
  kind: 'pad'
  time: number
  duration: number
  midis: number[]
  style: PadStyle
  level: number
}

export type MusicEvent = NoteEvent | PadEvent

export interface Span {
  duration: number
  events: MusicEvent[]
}

interface Motif {
  /** Onset beats within a span. */
  onsets: number[]
  /** Scale-degree offsets from the span's anchor, one per onset. */
  steps: number[]
}

const RHYTHMS: Record<'sparse' | 'medium' | 'dense', number[][]> = {
  sparse: [
    [0, 3],
    [0, 2, 5],
    [1, 4],
    [0, 4.5],
    [0, 3, 4],
  ],
  medium: [
    [0, 1, 2, 4],
    [0, 1.5, 2, 4, 6],
    [0, 2, 3, 5],
    [0.5, 1, 2, 4, 5],
    [0, 1, 3, 4, 6],
  ],
  dense: [
    [0, 0.5, 1, 2, 3, 4, 6],
    [0, 1, 1.5, 2, 4, 5, 5.5, 6],
    [0, 1, 2, 2.5, 3, 4, 5, 6],
  ],
}

const STEP_CHOICES = [-2, -1, -1, -1, 0, 1, 1, 1, 2, 2, -3, 3, 4]
const INTRO_SPANS = 2

export class Composer {
  private readonly rng: Rng
  private readonly progression: readonly number[]
  private readonly spanSeconds: number
  private readonly beat: number
  private readonly totalSpans: number
  private readonly motifA: Motif
  private readonly motifB: Motif
  private spanIndex = 0
  /** Last lead note as an absolute scale degree (relative to the tonic). */
  private leadDegree: number

  constructor(
    private readonly mood: MoodDef,
    seed: number,
    lengthSeconds: number,
  ) {
    this.rng = createRng(seed)
    this.progression = mood.progressions[Math.floor(this.rng() * mood.progressions.length)]
    this.beat = 60 / mood.bpm
    this.spanSeconds = mood.beatsPerChord * this.beat
    const phrase = this.progression.length
    // Whole phrases: intro + body + outro.
    this.totalSpans = Number.isFinite(lengthSeconds)
      ? Math.max(3, Math.round(lengthSeconds / (this.spanSeconds * phrase))) * phrase
      : Infinity
    this.motifA = this.makeMotif()
    this.motifB = this.rng() < 0.5 ? this.varyMotif(this.motifA) : this.makeMotif()
    const lead = mood.lead
    this.leadDegree = lead ? this.nearestDegree((lead.range[0] + lead.range[1]) / 2) : 0
  }

  get spanDuration(): number {
    return this.spanSeconds
  }

  /** The next chord span, or null once the piece is over. */
  next(): Span | null {
    if (this.spanIndex >= this.totalSpans) return null
    const index = this.spanIndex++
    const phraseLength = this.progression.length
    const phrase = Math.floor(index / phraseLength)
    const inPhrase = index % phraseLength
    const lastPhrase = Number.isFinite(this.totalSpans) && index >= this.totalSpans - phraseLength
    const finalSpan = index === this.totalSpans - 1
    // Two spans of pad and harmony before the melody enters
    const intro = index < INTRO_SPANS && Number.isFinite(this.totalSpans)
    const root = finalSpan ? 0 : this.progression[inPhrase]

    const events: MusicEvent[] = []
    const chord = [root, root + 2, root + 4]

    this.addPad(events, chord, finalSpan)
    this.addDrone(events, finalSpan)
    this.addHarmony(events, chord, finalSpan)
    this.addPulse(events, finalSpan)

    const lead = this.mood.lead
    if (lead && !intro) {
      if (finalSpan) {
        // Settle on the tonic.
        this.addLeadNote(events, 0, this.fitDegree(0), lead.velocity * 0.8)
      } else {
        const motif = phrase % 2 === 1 ? this.motifA : this.motifB
        const density = lastPhrase ? lead.density * 0.6 : lead.density
        if (this.rng() < density || (inPhrase === 0 && this.rng() < 0.5)) this.addMelody(events, motif, chord, inPhrase === phraseLength - 1)
      }
    }

    return { duration: this.spanSeconds, events }
  }

  // --- layers ----------------------------------------------------------

  private addPad(events: MusicEvent[], chord: number[], final: boolean): void {
    const pad = this.mood.pad
    if (!pad) return
    const midis = chord.map((d) => this.voiceNear(d, pad.center))
    events.push({ kind: 'pad', time: 0, duration: this.spanSeconds * (final ? 1.6 : 1) + 0.4, midis, style: pad.style, level: pad.level })
  }

  private addDrone(events: MusicEvent[], final: boolean): void {
    const drone = this.mood.drone
    if (!drone) return
    events.push({ kind: 'pad', time: 0, duration: this.spanSeconds * (final ? 1.6 : 1) + 0.4, midis: [drone.midi], style: 'dark', level: drone.level })
  }

  private addHarmony(events: MusicEvent[], chord: number[], final: boolean): void {
    const h = this.mood.harmony
    if (!h) return
    const [lo, hi] = h.range
    const rootMidi = this.voiceAbove(chord[0], lo)
    const third = this.voiceAbove(chord[1], rootMidi)
    const fifth = this.voiceAbove(chord[2], rootMidi)
    const v = h.velocity
    const b = this.beat
    const note = (beat: number, midi: number, vel: number): void => {
      let m = midi
      while (m > hi) m -= 12
      events.push({ kind: 'note', time: beat * b + this.jitter(), instrument: h.instrument, midi: m, velocity: vel * this.humanize(), pan: (this.rng() - 0.5) * 0.3 })
    }
    if (final) {
      note(0, rootMidi, v)
      note(0.15, fifth, v * 0.8)
      note(0.3, third + 12, v * 0.7)
      return
    }
    switch (h.style) {
      case 'broken':
        note(0, rootMidi, v)
        note(1, fifth, v * 0.75)
        note(2, third + 12, v * 0.7)
        if (this.rng() < 0.7) {
          note(4, rootMidi, v * 0.85)
          note(5, third, v * 0.65)
          note(6, fifth + 12 > hi ? fifth : fifth + 12, v * 0.6)
        }
        break
      case 'sparse':
        note(0, rootMidi, v)
        note(0.05, fifth, v * 0.7)
        if (this.rng() < 0.6) note(4, third + 12 > hi ? third : third + 12, v * 0.6)
        break
      case 'block':
        note(0, rootMidi, v)
        note(0.06, third, v * 0.75)
        note(0.12, fifth, v * 0.75)
        if (this.rng() < 0.4) {
          note(4, rootMidi, v * 0.7)
          note(4.06, fifth, v * 0.6)
        }
        break
      case 'arp': {
        const tones = [rootMidi, third, fifth, rootMidi + 12, third + 12, fifth + 12]
        const pattern = this.rng() < 0.5 ? [0, 1, 2, 3, 4, 3, 2, 1] : [0, 2, 1, 3, 2, 4, 3, 5]
        pattern.forEach((idx, i) => note(i, tones[idx], v * (i % 2 === 0 ? 1 : 0.75)))
        break
      }
      case 'ostinato': {
        const tones = [rootMidi, rootMidi, fifth, rootMidi + 12, rootMidi, fifth, rootMidi + 12, fifth]
        for (let i = 0; i < 16; i++) note(i * 0.5, tones[i % tones.length], v * (i % 4 === 0 ? 1 : i % 2 === 0 ? 0.75 : 0.55))
        break
      }
    }
  }

  private addPulse(events: MusicEvent[], final: boolean): void {
    const pulse = this.mood.pulse
    if (pulse) {
      const beats = final ? [0] : pulse.beats
      beats.forEach((beat, i) => {
        events.push({ kind: 'note', time: beat * this.beat, instrument: 'drum', midi: 0, velocity: pulse.level * (i === 0 ? 1 : 0.7), pan: 0 })
      })
    }
    const ticks = this.mood.ticks
    if (ticks && !final) {
      const count = Math.floor(this.mood.beatsPerChord / ticks.every)
      for (let i = 0; i < count; i++) {
        const accent = i % 4 === 2 ? 1 : i % 2 === 0 ? 0.6 : 0.4
        events.push({ kind: 'note', time: i * ticks.every * this.beat, instrument: 'tick', midi: 0, velocity: ticks.level * accent, pan: 0.15 })
      }
    }
  }

  private addMelody(events: MusicEvent[], motif: Motif, chord: number[], phraseEnd: boolean): void {
    const lead = this.mood.lead!
    // Anchor on the chord tone nearest the previous note, so lines move smoothly.
    let anchor = this.nearestChordDegree(this.leadDegree, chord)
    const onsets = phraseEnd ? motif.onsets.filter((t) => t < this.mood.beatsPerChord / 2) : motif.onsets
    onsets.forEach((beat, i) => {
      if (i > 0 && this.rng() < 0.12) return
      let degree = anchor + motif.steps[i]
      const strong = beat % 2 === 0
      if (strong || (phraseEnd && i === onsets.length - 1)) {
        const snapped = this.nearestChordDegree(degree, chord)
        // Snapping must not flatten a moving line into repeated notes
        const direction = i > 0 ? Math.sign(motif.steps[i] - motif.steps[i - 1]) : 0
        degree = snapped === this.leadDegree && direction !== 0 ? this.nextChordDegree(snapped, chord, direction) : snapped
      }
      degree = this.fitDegree(degree)
      const accent = strong ? 1 : 0.8
      this.addLeadNote(events, beat * this.beat + this.jitter(), degree, lead.velocity * accent * this.humanize())
      this.leadDegree = degree
      if (i === 0) anchor = degree - motif.steps[0]
    })
  }

  private addLeadNote(events: MusicEvent[], time: number, degree: number, velocity: number): void {
    const lead = this.mood.lead!
    events.push({ kind: 'note', time: Math.max(0, time), instrument: lead.instrument, midi: this.degreeMidi(degree), velocity, pan: (this.rng() - 0.5) * 0.4 })
  }

  // --- motifs ------------------------------------------------------------

  private makeMotif(): Motif {
    const density = this.mood.lead?.density ?? 0.3
    const pool = density < 0.4 ? RHYTHMS.sparse : density < 0.6 ? RHYTHMS.medium : this.rng() < 0.7 ? RHYTHMS.medium : RHYTHMS.dense
    const onsets = pool[Math.floor(this.rng() * pool.length)].filter((b) => b < this.mood.beatsPerChord)
    const steps = [0]
    for (let i = 1; i < onsets.length; i++) {
      steps.push(steps[i - 1] + STEP_CHOICES[Math.floor(this.rng() * STEP_CHOICES.length)])
    }
    return { onsets, steps }
  }

  /** Same rhythm, contour inverted or shifted. */
  private varyMotif(m: Motif): Motif {
    if (this.rng() < 0.5) return { onsets: m.onsets, steps: m.steps.map((s) => -s) }
    const shift = this.rng() < 0.5 ? 2 : -2
    return { onsets: m.onsets, steps: m.steps.map((s, i) => (i === 0 ? s : s + shift)) }
  }

  // --- pitch helpers -----------------------------------------------------

  private degreeMidi(degree: number): number {
    const scale = this.mood.scale
    const n = scale.length
    const octave = Math.floor(degree / n)
    const idx = ((degree % n) + n) % n
    return this.mood.tonic + octave * 12 + scale[idx]
  }

  private nearestDegree(midi: number): number {
    let best = 0
    let bestDist = Infinity
    for (let d = -28; d <= 35; d++) {
      const dist = Math.abs(this.degreeMidi(d) - midi)
      if (dist < bestDist) {
        bestDist = dist
        best = d
      }
    }
    return best
  }

  private nearestChordDegree(degree: number, chord: number[]): number {
    const n = this.mood.scale.length
    let best = degree
    let bestDist = Infinity
    for (const tone of chord) {
      const pc = ((tone % n) + n) % n
      for (let d = degree - n; d <= degree + n; d++) {
        if (((d % n) + n) % n !== pc) continue
        const dist = Math.abs(d - degree)
        if (dist < bestDist) {
          bestDist = dist
          best = d
        }
      }
    }
    return best
  }

  /** The next chord tone above (direction 1) or below (-1) `degree`. */
  private nextChordDegree(degree: number, chord: number[], direction: number): number {
    const n = this.mood.scale.length
    const pcs = chord.map((tone) => ((tone % n) + n) % n)
    for (let d = degree + direction; Math.abs(d - degree) <= n; d += direction) {
      if (pcs.includes(((d % n) + n) % n)) return d
    }
    return degree
  }

  /** Octave-shift a degree into the lead range. */
  private fitDegree(degree: number): number {
    const lead = this.mood.lead
    if (!lead) return degree
    const n = this.mood.scale.length
    let d = degree
    while (this.degreeMidi(d) > lead.range[1]) d -= n
    while (this.degreeMidi(d) < lead.range[0]) d += n
    return d
  }

  /** MIDI of chord degree `degree` voiced nearest `center`. */
  private voiceNear(degree: number, center: number): number {
    let m = this.degreeMidi(degree)
    while (m - center > 6) m -= 12
    while (center - m > 6) m += 12
    return m
  }

  /** MIDI of `degree` at or above `floor`. */
  private voiceAbove(degree: number, floor: number): number {
    let m = this.degreeMidi(degree)
    while (m < floor) m += 12
    while (m - 12 >= floor) m -= 12
    return m
  }

  private jitter(): number {
    return (this.rng() - 0.5) * 0.024
  }

  private humanize(): number {
    return 0.88 + this.rng() * 0.2
  }
}
