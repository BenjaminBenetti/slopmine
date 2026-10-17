/**
 * Generative composer: turns a mood and a seed into a piece, one chord span
 * at a time (the player asks for the next span shortly before it is due).
 *
 * Form: a pad-and-harmony intro (one or two spans), melodic phrases built
 * from up to three motifs in a seeded order (AB, AABA, ABAC...), and an
 * outro phrase that settles on the tonic. A phrase is one pass through the
 * chosen progression; one middle phrase may carry the melody in thirds.
 * Melody notes on strong beats are chord tones; motifs are re-anchored to
 * each chord so they move with the harmony instead of clashing with it.
 * Pure (no Web Audio) - the same seed always writes the same piece.
 */

import { createRng, type Rng } from '../synth/dsp.ts'
import { MONOPHONIC, type InstrumentId } from '../synth/instruments.ts'
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

type RhythmPools = Record<'sparse' | 'medium' | 'dense', number[][]>

/** Motif rhythms (onset beats) for spans of 4/4 bars. */
const RHYTHMS: RhythmPools = {
  sparse: [
    [0, 3],
    [0, 2, 5],
    [1, 4],
    [0, 4.5],
    [0, 3, 4],
    [0, 2],
    [0, 1.5, 4],
    [0, 5],
    [2, 4, 6],
    [0, 3.5, 5],
  ],
  medium: [
    [0, 1, 2, 4],
    [0, 1.5, 2, 4, 6],
    [0, 2, 3, 5],
    [0.5, 1, 2, 4, 5],
    [0, 1, 3, 4, 6],
    [0, 1, 2, 3, 4],
    [0, 2, 2.5, 4, 6],
    [0, 0.5, 2, 4],
    [0, 1, 2.5, 4, 5],
    [0, 3, 3.5, 4, 6],
  ],
  dense: [
    [0, 0.5, 1, 2, 3, 4, 6],
    [0, 1, 1.5, 2, 4, 5, 5.5, 6],
    [0, 1, 2, 2.5, 3, 4, 5, 6],
    [0, 0.5, 1, 1.5, 2, 4, 5, 6],
    [0, 1, 2, 3, 3.5, 4, 6, 7],
    [0, 0.5, 2, 2.5, 4, 4.5, 6],
  ],
}

/** Motif rhythms for spans of 3/4 bars (waltzes). */
const TRIPLE_RHYTHMS: RhythmPools = {
  sparse: [
    [0, 3],
    [0, 2, 3],
    [0, 4.5],
    [1, 3, 5],
  ],
  medium: [
    [0, 1, 2, 3],
    [0, 2, 3, 5],
    [0, 1.5, 2, 3, 5],
    [0, 3, 4, 5],
    [0, 1, 2, 3, 4.5],
  ],
  dense: [
    [0, 0.5, 1, 2, 3, 3.5, 4, 5],
    [0, 1, 1.5, 2, 3, 4, 4.5, 5],
  ],
}

const STEP_CHOICES = [-2, -1, -1, -1, 0, 1, 1, 1, 2, 2, -3, 3, 4]
/** Which motif each phrase plays, cycled. */
const FORMS = ['AB', 'AABA', 'ABAC', 'AABB', 'ABCB'] as const

export class Composer {
  private readonly rng: Rng
  private readonly progression: readonly number[]
  private readonly spanSeconds: number
  private readonly beat: number
  private readonly totalSpans: number
  private readonly motifs: Record<'A' | 'B' | 'C', Motif>
  private readonly form: string
  private readonly introSpans: number
  /** The phrase whose melody is doubled a third below (-1: none). */
  private readonly thirdsPhrase: number
  private readonly triple: boolean
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
    this.triple = mood.beatsPerChord % 3 === 0
    const a = this.makeMotif()
    const b = this.rng() < 0.5 ? this.varyMotif(a) : this.makeMotif()
    this.motifs = { A: a, B: b, C: this.rng() < 0.5 ? this.varyMotif(b) : this.makeMotif() }
    this.form = FORMS[Math.floor(this.rng() * FORMS.length)]
    this.introSpans = this.rng() < 0.5 ? 1 : 2
    const phrases = this.totalSpans / phrase
    // Melody in thirds once, somewhere in the middle (every fourth phrase of an endless piece)
    this.thirdsPhrase =
      mood.lead && !MONOPHONIC.has(mood.lead.instrument) && this.rng() < 0.4
        ? Number.isFinite(phrases)
          ? phrases > 2
            ? 1 + Math.floor(this.rng() * (phrases - 2))
            : -1
          : 3
        : -1
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
    // Pad and harmony alone before the melody enters
    const intro = index < this.introSpans && Number.isFinite(this.totalSpans)
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
        const motif = this.motifs[this.form[phrase % this.form.length] as 'A' | 'B' | 'C']
        const density = lastPhrase ? lead.density * 0.6 : lead.density
        const thirds = Number.isFinite(this.totalSpans) ? phrase === this.thirdsPhrase : this.thirdsPhrase > 0 && phrase % 4 === this.thirdsPhrase
        if (this.rng() < density || (inPhrase === 0 && this.rng() < 0.5)) this.addMelody(events, motif, chord, inPhrase === phraseLength - 1, thirds)
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
    const beats = this.mood.beatsPerChord
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
      case 'alberti':
        // Fingerpicked: the thumb alternates root and fifth on the beat, fingers fill between.
        for (let beat = 0; beat < beats; beat++) {
          note(beat, beat % 2 === 0 ? rootMidi : fifth, v * (beat % 4 === 0 ? 1 : 0.75))
          if (beat % 2 === 1 || this.rng() < 0.35) note(beat + 0.5, beat % 4 < 2 ? third + 12 : fifth + 12, v * 0.55)
        }
        break
      case 'rolled': {
        // Harp roll: the chord spread upward, then a lighter roll halfway through.
        const roll = [rootMidi, fifth, third + 12, rootMidi + 12, fifth + 12]
        roll.forEach((m, i) => note(i * 0.12, m, v * (1 - i * 0.08)))
        if (this.rng() < 0.6) [third, fifth, rootMidi + 12].forEach((m, i) => note(beats / 2 + i * 0.1, m, v * 0.6))
        break
      }
      case 'waltz':
        // Oom-pah-pah: each bar's downbeat in the bass (root, then fifth), the chord on the two after.
        for (let bar = 0; bar * 3 < beats; bar++) {
          const down = bar * 3
          note(down, bar % 2 === 0 ? rootMidi : fifth - 12 >= lo ? fifth - 12 : fifth, v)
          for (const offbeat of [1, 2]) {
            note(down + offbeat, third + 12, v * 0.5)
            note(down + offbeat + 0.02, fifth + 12, v * 0.45)
          }
        }
        break
      case 'pedal': {
        // The root repeated in eighths, accented 3 + 3 + 2.
        const accents = [1, 0.5, 0.55, 0.85, 0.5, 0.55, 0.8, 0.5]
        for (let i = 0; i < beats * 2; i++) note(i * 0.5, rootMidi, v * accents[i % accents.length])
        break
      }
    }
  }

  private addPulse(events: MusicEvent[], final: boolean): void {
    const pulse = this.mood.pulse
    if (pulse) {
      const beats = final ? [0] : pulse.beats
      const instrument = pulse.instrument ?? 'drum'
      beats.forEach((beat, i) => {
        events.push({ kind: 'note', time: beat * this.beat, instrument, midi: 0, velocity: pulse.level * (i === 0 ? 1 : 0.7), pan: 0 })
      })
    }
    const ticks = this.mood.ticks
    if (ticks && !final) {
      const count = Math.floor(this.mood.beatsPerChord / ticks.every)
      for (let i = 0; i < count; i++) {
        const accent = i % 4 === 2 ? 1 : i % 2 === 0 ? 0.6 : 0.4
        events.push({ kind: 'note', time: i * ticks.every * this.beat, instrument: ticks.instrument ?? 'tick', midi: 0, velocity: ticks.level * accent, pan: 0.15 })
      }
    }
  }

  private addMelody(events: MusicEvent[], motif: Motif, chord: number[], phraseEnd: boolean, thirds: boolean): void {
    const lead = this.mood.lead!
    // Anchor on the chord tone nearest the previous note, so lines move smoothly.
    let anchor = this.nearestChordDegree(this.leadDegree, chord)
    const onsets = phraseEnd ? motif.onsets.filter((t) => t < this.mood.beatsPerChord / 2) : motif.onsets
    onsets.forEach((beat, i) => {
      if (i > 0 && this.rng() < 0.12) return
      let degree = anchor + motif.steps[i]
      const strong = this.triple ? beat % 3 === 0 : beat % 2 === 0
      if (strong || (phraseEnd && i === onsets.length - 1)) {
        const snapped = this.nearestChordDegree(degree, chord)
        // Snapping must not flatten a moving line into repeated notes
        const direction = i > 0 ? Math.sign(motif.steps[i] - motif.steps[i - 1]) : 0
        degree = snapped === this.leadDegree && direction !== 0 ? this.nextChordDegree(snapped, chord, direction) : snapped
      }
      degree = this.fitDegree(degree)
      const accent = strong ? 1 : 0.8
      const time = beat * this.beat + this.jitter()
      this.addLeadNote(events, time, degree, lead.velocity * accent * this.humanize())
      if (thirds && this.degreeMidi(degree - 2) >= lead.range[0] - 5) this.addLeadNote(events, time + 0.01, degree - 2, lead.velocity * accent * 0.5)
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
    const pools = this.triple ? TRIPLE_RHYTHMS : RHYTHMS
    const pool = density < 0.4 ? pools.sparse : density < 0.6 ? pools.medium : this.rng() < 0.7 ? pools.medium : pools.dense
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
