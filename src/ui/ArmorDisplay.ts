import { CHESTPLATE_PATH } from './ArmorIcons.ts'

/**
 * HUD armor bar: a row of chestplate icons (2 armor points each, half icons
 * for odd points) plus the point total, attached just above the hearts
 * (HealthDisplayUI.attachAbove). Hidden while no armor is worn. Styled like
 * the hearts (gradient SVG, highlight, drop shadow); a full infernium or
 * hellbane set (fire ward) burns the icons ember-orange.
 */
export interface ArmorDisplayUI {
  readonly root: HTMLDivElement
  /** Show `points` armor points; `ember` = fire set bonus active */
  update(points: number, ember: boolean): void
}

export interface ArmorDisplayOptions {
  /** Icons in the row (each = 2 points); 12 covers the 24-point hellbane set */
  iconCount?: number
  iconSizePx?: number
}

let armorIconIdCounter = 0

interface ArmorIconPalette {
  readonly stops: string
  readonly stroke: string
}

const STEEL: ArmorIconPalette = {
  stops: `
      <stop offset="0%" stop-color="#f4f8fb"/>
      <stop offset="45%" stop-color="#b9c4ce"/>
      <stop offset="100%" stop-color="#5f6a76"/>`,
  stroke: '#e3eaf0',
}

const EMBER: ArmorIconPalette = {
  stops: `
      <stop offset="0%" stop-color="#ffd27a"/>
      <stop offset="45%" stop-color="#ff7a24"/>
      <stop offset="100%" stop-color="#8e1c14"/>`,
  stroke: '#ffc070',
}

function iconSvg(fillStops: string, stroke: string, highlightOpacity: string): string {
  const id = armorIconIdCounter++
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
      <defs>
        <linearGradient id="ag_${id}" x1="0%" y1="0%" x2="0%" y2="100%">${fillStops}</linearGradient>
        <radialGradient id="ah_${id}" cx="32%" cy="28%" r="55%">
          <stop offset="0%" stop-color="white" stop-opacity="${highlightOpacity}"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <path d="${CHESTPLATE_PATH}" fill="url(#ag_${id})" stroke="${stroke}" stroke-width="0.6" stroke-linejoin="round"/>
      <path d="${CHESTPLATE_PATH}" fill="url(#ah_${id})"/>
      <path d="M12 6.2v13.2" stroke="rgba(0,0,0,0.22)" stroke-width="0.8"/>
    </svg>`
}

const EMPTY_STOPS = `
      <stop offset="0%" stop-color="#3c4249"/>
      <stop offset="100%" stop-color="#1a1d21"/>`

interface ArmorIcon {
  readonly container: HTMLDivElement
  readonly full: HTMLDivElement
  readonly half: HTMLDivElement
  readonly emberFull: HTMLDivElement
  readonly emberHalf: HTMLDivElement
}

function layer(html: string, clipHalf = false): HTMLDivElement {
  const el = document.createElement('div')
  el.style.position = 'absolute'
  el.style.inset = '0'
  el.innerHTML = html
  if (clipHalf) el.style.clipPath = 'inset(0 50% 0 0)'
  return el
}

function createArmorIcon(size: number): ArmorIcon {
  const container = document.createElement('div')
  container.style.position = 'relative'
  container.style.width = `${size}px`
  container.style.height = `${size}px`
  container.style.filter = 'drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.5))'

  container.appendChild(layer(iconSvg(EMPTY_STOPS, '#4f5760', '0.12')))
  const full = layer(iconSvg(STEEL.stops, STEEL.stroke, '0.45'))
  const half = layer(iconSvg(STEEL.stops, STEEL.stroke, '0.45'), true)
  const emberFull = layer(iconSvg(EMBER.stops, EMBER.stroke, '0.45'))
  const emberHalf = layer(iconSvg(EMBER.stops, EMBER.stroke, '0.45'), true)
  container.append(full, half, emberFull, emberHalf)
  return { container, full, half, emberFull, emberHalf }
}

export function createArmorDisplayUI(options: ArmorDisplayOptions = {}): ArmorDisplayUI {
  const iconCount = options.iconCount ?? 12
  const iconSize = options.iconSizePx ?? 18

  const root = document.createElement('div')
  root.style.display = 'none'
  root.style.alignItems = 'center'
  root.style.gap = '2px'
  root.style.pointerEvents = 'none'

  const icons: ArmorIcon[] = []
  for (let i = 0; i < iconCount; i++) {
    const icon = createArmorIcon(iconSize)
    icons.push(icon)
    root.appendChild(icon.container)
  }

  const label = document.createElement('div')
  label.style.marginLeft = '5px'
  label.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  label.style.fontSize = '12px'
  label.style.fontWeight = 'bold'
  label.style.color = 'rgba(235, 242, 248, 0.95)'
  label.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.9), -1px -1px 1px rgba(0, 0, 0, 0.6)'
  root.appendChild(label)

  return {
    root,
    update(points: number, ember: boolean): void {
      if (points <= 0) {
        root.style.display = 'none'
        return
      }
      root.style.display = 'flex'
      label.textContent = String(points)
      label.style.color = ember ? 'rgba(255, 196, 120, 0.98)' : 'rgba(235, 242, 248, 0.95)'
      for (let i = 0; i < icons.length; i++) {
        const filled = points >= i * 2 + 2
        const halfFilled = !filled && points >= i * 2 + 1
        const icon = icons[i]
        icon.full.style.opacity = filled && !ember ? '1' : '0'
        icon.half.style.opacity = halfFilled && !ember ? '1' : '0'
        icon.emberFull.style.opacity = filled && ember ? '1' : '0'
        icon.emberHalf.style.opacity = halfFilled && ember ? '1' : '0'
      }
    },
  }
}
