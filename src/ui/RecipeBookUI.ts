/**
 * Recipe Book UI Component
 * Displays a searchable list of all items and their recipes.
 */

import {
  recipeBook,
  STATION_INFO,
  type IRecipeInfo,
  type IIngredientInfo,
  type CraftingStation,
} from '../crafting/RecipeBook.ts'

/** Callback for adding an item to player inventory (dev mode) */
export type AddItemCallback = (itemId: string) => void

export interface RecipeBookUIOptions {
  /** Callback to add item to inventory (only used in dev mode) */
  onAddItem?: AddItemCallback
}

export interface RecipeBookUI {
  readonly root: HTMLDivElement
  
  /** Show the recipe book panel */
  show(): void
  
  /** Hide the recipe book panel */
  hide(): void
  
  /** Check if visible */
  readonly isVisible: boolean
  
  /** Navigate to a specific item */
  navigateToItem(itemId: string): void
  
  /** Refresh the item list (call after recipe book index is built) */
  refresh(): void
  
  /** Clean up */
  destroy(): void
}

/**
 * Create the Recipe Book UI component
 */
export function createRecipeBookUI(options: RecipeBookUIOptions = {}): RecipeBookUI {
  const { onAddItem } = options
  const isDevMode = import.meta.env.DEV
  // Main container - sized to replace the full inventory view
  const root = document.createElement('div')
  root.style.display = 'none'
  root.style.flexDirection = 'column'
  root.style.gap = '0.75rem'
  root.style.padding = '1rem 1.25rem'
  root.style.background = 'rgba(12, 12, 12, 0.96)'
  root.style.borderRadius = '8px'
  root.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  root.style.width = '600px'
  root.style.height = '450px'
  root.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'

  // Header with title
  const header = document.createElement('div')
  header.style.display = 'flex'
  header.style.alignItems = 'center'
  header.style.gap = '0.5rem'
  header.style.marginBottom = '0.25rem'

  const title = document.createElement('div')
  title.textContent = 'Recipe Book'
  title.style.color = 'rgba(255, 255, 255, 0.95)'
  title.style.fontSize = '1rem'
  title.style.fontWeight = 'bold'
  header.appendChild(title)

  root.appendChild(header)

  // Search box
  const searchContainer = document.createElement('div')
  searchContainer.style.position = 'relative'

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = 'Search items...'
  searchInput.style.width = '100%'
  searchInput.style.padding = '0.5rem 0.75rem'
  searchInput.style.paddingRight = '2rem'
  searchInput.style.background = 'rgba(30, 30, 30, 0.95)'
  searchInput.style.border = '1px solid rgba(255, 255, 255, 0.25)'
  searchInput.style.borderRadius = '4px'
  searchInput.style.color = 'rgba(255, 255, 255, 0.9)'
  searchInput.style.fontSize = '0.85rem'
  searchInput.style.outline = 'none'
  searchInput.style.boxSizing = 'border-box'

  searchInput.addEventListener('focus', () => {
    searchInput.style.borderColor = 'rgba(255, 255, 255, 0.5)'
  })
  searchInput.addEventListener('blur', () => {
    searchInput.style.borderColor = 'rgba(255, 255, 255, 0.25)'
  })

  searchContainer.appendChild(searchInput)
  root.appendChild(searchContainer)

  // Content area (item list + detail panel)
  const contentArea = document.createElement('div')
  contentArea.style.display = 'flex'
  contentArea.style.gap = '0.75rem'
  contentArea.style.flex = '1'
  contentArea.style.minHeight = '0'
  contentArea.style.overflow = 'hidden'

  // Item list (left side)
  const itemListContainer = document.createElement('div')
  itemListContainer.style.width = '180px'
  itemListContainer.style.flexShrink = '0'
  itemListContainer.style.display = 'flex'
  itemListContainer.style.flexDirection = 'column'
  itemListContainer.style.overflow = 'hidden'

  const itemList = document.createElement('div')
  itemList.style.display = 'flex'
  itemList.style.flexDirection = 'column'
  itemList.style.gap = '2px'
  itemList.style.overflowY = 'auto'
  itemList.style.flex = '1'
  itemList.style.paddingRight = '4px'

  // Custom scrollbar styling
  itemList.style.scrollbarWidth = 'thin'
  itemList.style.scrollbarColor = 'rgba(255, 255, 255, 0.3) transparent'

  itemListContainer.appendChild(itemList)
  contentArea.appendChild(itemListContainer)

  // Divider
  const divider = document.createElement('div')
  divider.style.width = '1px'
  divider.style.background = 'rgba(255, 255, 255, 0.15)'
  divider.style.flexShrink = '0'
  contentArea.appendChild(divider)

  // Detail panel (right side)
  const detailPanel = document.createElement('div')
  detailPanel.style.flex = '1'
  detailPanel.style.display = 'flex'
  detailPanel.style.flexDirection = 'column'
  detailPanel.style.gap = '0.75rem'
  detailPanel.style.overflowY = 'auto'
  detailPanel.style.paddingRight = '4px'
  detailPanel.style.scrollbarWidth = 'thin'
  detailPanel.style.scrollbarColor = 'rgba(255, 255, 255, 0.3) transparent'

  contentArea.appendChild(detailPanel)
  root.appendChild(contentArea)

  // State
  let visible = false
  let selectedItemId: string | null = null
  let currentItemElements: Map<string, HTMLDivElement> = new Map()

  /**
   * Create an item list entry
   */
  function createItemEntry(itemId: string): HTMLDivElement {
    const entry = document.createElement('div')
    entry.style.display = 'flex'
    entry.style.alignItems = 'center'
    entry.style.gap = '0.4rem'
    entry.style.padding = '0.35rem 0.5rem'
    entry.style.borderRadius = '3px'
    entry.style.cursor = 'pointer'
    entry.style.transition = 'background 0.1s'
    entry.style.background = 'transparent'

    const iconUrl = recipeBook.getItemIconUrl(itemId)
    if (iconUrl) {
      const icon = document.createElement('img')
      icon.src = iconUrl
      icon.style.width = '20px'
      icon.style.height = '20px'
      icon.style.objectFit = 'contain'
      icon.style.imageRendering = 'pixelated'
      icon.style.flexShrink = '0'
      icon.draggable = false
      entry.appendChild(icon)
    }

    const name = document.createElement('span')
    name.textContent = recipeBook.getItemDisplayName(itemId)
    name.style.color = 'rgba(255, 255, 255, 0.85)'
    name.style.fontSize = '0.75rem'
    name.style.whiteSpace = 'nowrap'
    name.style.overflow = 'hidden'
    name.style.textOverflow = 'ellipsis'
    entry.appendChild(name)

    entry.addEventListener('mouseenter', () => {
      if (selectedItemId !== itemId) {
        entry.style.background = 'rgba(255, 255, 255, 0.08)'
      }
    })
    entry.addEventListener('mouseleave', () => {
      if (selectedItemId !== itemId) {
        entry.style.background = 'transparent'
      }
    })
    entry.addEventListener('click', () => {
      selectItem(itemId)
    })

    return entry
  }

  /**
   * Render the item list based on search query
   */
  function renderItemList(query: string = ''): void {
    itemList.innerHTML = ''
    currentItemElements.clear()

    const itemIds = recipeBook.searchItems(query)

    if (itemIds.length === 0) {
      const empty = document.createElement('div')
      empty.textContent = 'No items found'
      empty.style.color = 'rgba(255, 255, 255, 0.4)'
      empty.style.fontSize = '0.75rem'
      empty.style.fontStyle = 'italic'
      empty.style.padding = '0.5rem'
      itemList.appendChild(empty)
      return
    }

    for (const itemId of itemIds) {
      const entry = createItemEntry(itemId)
      currentItemElements.set(itemId, entry)
      itemList.appendChild(entry)
    }

    // Update selection visual
    updateSelectionVisual()
  }

  /**
   * Update the visual selection state
   */
  function updateSelectionVisual(): void {
    for (const [itemId, element] of currentItemElements) {
      if (itemId === selectedItemId) {
        element.style.background = 'rgba(100, 150, 255, 0.25)'
      } else {
        element.style.background = 'transparent'
      }
    }
  }

  /**
   * Select an item and show its details
   */
  function selectItem(itemId: string): void {
    selectedItemId = itemId
    updateSelectionVisual()
    renderDetailPanel(itemId)

    // Scroll the selected item into view
    const element = currentItemElements.get(itemId)
    if (element) {
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  /**
   * Create a station badge element
   */
  function createStationBadge(station: CraftingStation): HTMLSpanElement {
    const badge = document.createElement('span')
    const info = STATION_INFO[station]
    badge.textContent = info.label
    badge.style.padding = '0.2rem 0.4rem'
    badge.style.borderRadius = '3px'
    badge.style.background = info.color
    badge.style.color = 'white'
    badge.style.fontSize = '0.65rem'
    badge.style.fontWeight = 'bold'
    badge.style.whiteSpace = 'nowrap'
    return badge
  }

  /**
   * Create an ingredient display element
   */
  function createIngredientElement(ing: IIngredientInfo, onClick?: () => void): HTMLDivElement {
    const el = document.createElement('div')
    el.style.display = 'flex'
    el.style.alignItems = 'center'
    el.style.gap = '0.3rem'
    el.style.padding = '0.25rem 0.4rem'
    el.style.background = 'rgba(40, 40, 40, 0.8)'
    el.style.borderRadius = '3px'
    el.style.cursor = onClick ? 'pointer' : 'default'

    if (onClick) {
      el.addEventListener('mouseenter', () => {
        el.style.background = 'rgba(60, 60, 60, 0.9)'
      })
      el.addEventListener('mouseleave', () => {
        el.style.background = 'rgba(40, 40, 40, 0.8)'
      })
      el.addEventListener('click', onClick)
    }

    if (ing.itemId) {
      const iconUrl = recipeBook.getItemIconUrl(ing.itemId)
      if (iconUrl) {
        const icon = document.createElement('img')
        icon.src = iconUrl
        icon.style.width = '18px'
        icon.style.height = '18px'
        icon.style.objectFit = 'contain'
        icon.style.imageRendering = 'pixelated'
        icon.draggable = false
        el.appendChild(icon)
      }

      const name = document.createElement('span')
      name.textContent = `${ing.count}x ${recipeBook.getItemDisplayName(ing.itemId)}`
      name.style.color = 'rgba(255, 255, 255, 0.85)'
      name.style.fontSize = '0.7rem'
      el.appendChild(name)
    } else if (ing.tag) {
      const name = document.createElement('span')
      name.textContent = `${ing.count}x Any ${ing.tag}`
      name.style.color = 'rgba(255, 200, 100, 0.9)'
      name.style.fontSize = '0.7rem'
      name.style.fontStyle = 'italic'
      el.appendChild(name)
    }

    return el
  }

  /**
   * Create a recipe card element
   */
  function createRecipeCard(recipe: IRecipeInfo, showResult: boolean = false): HTMLDivElement {
    const card = document.createElement('div')
    card.style.padding = '0.5rem'
    card.style.background = 'rgba(25, 25, 25, 0.9)'
    card.style.borderRadius = '4px'
    card.style.border = '1px solid rgba(255, 255, 255, 0.1)'

    // Station badge
    const stationRow = document.createElement('div')
    stationRow.style.display = 'flex'
    stationRow.style.alignItems = 'center'
    stationRow.style.gap = '0.5rem'
    stationRow.style.marginBottom = '0.4rem'

    stationRow.appendChild(createStationBadge(recipe.station))

    if (showResult) {
      // Show result item
      const resultLabel = document.createElement('span')
      resultLabel.style.color = 'rgba(255, 255, 255, 0.6)'
      resultLabel.style.fontSize = '0.7rem'
      resultLabel.textContent = 'makes'
      stationRow.appendChild(resultLabel)

      const resultEl = createIngredientElement(
        { itemId: recipe.resultItemId, tag: null, count: recipe.resultCount },
        () => selectItem(recipe.resultItemId),
      )
      stationRow.appendChild(resultEl)
    }

    card.appendChild(stationRow)

    // Ingredients
    const ingredientsRow = document.createElement('div')
    ingredientsRow.style.display = 'flex'
    ingredientsRow.style.flexWrap = 'wrap'
    ingredientsRow.style.gap = '0.3rem'

    for (const ing of recipe.ingredients) {
      const onClick = ing.itemId ? () => selectItem(ing.itemId!) : undefined
      ingredientsRow.appendChild(createIngredientElement(ing, onClick))
    }

    card.appendChild(ingredientsRow)

    return card
  }

  /**
   * Render the detail panel for a selected item
   */
  function renderDetailPanel(itemId: string): void {
    detailPanel.innerHTML = ''

    const data = recipeBook.getItemRecipeData(itemId)

    // Item header
    const itemHeader = document.createElement('div')
    itemHeader.style.display = 'flex'
    itemHeader.style.alignItems = 'center'
    itemHeader.style.gap = '0.75rem'
    itemHeader.style.paddingBottom = '0.5rem'
    itemHeader.style.borderBottom = '1px solid rgba(255, 255, 255, 0.15)'

    if (data.iconUrl) {
      const icon = document.createElement('img')
      icon.src = data.iconUrl
      icon.style.width = '40px'
      icon.style.height = '40px'
      icon.style.objectFit = 'contain'
      icon.style.imageRendering = 'pixelated'
      icon.draggable = false
      itemHeader.appendChild(icon)
    }

    const itemName = document.createElement('div')
    itemName.textContent = data.displayName
    itemName.style.color = 'rgba(255, 255, 255, 0.95)'
    itemName.style.fontSize = '1rem'
    itemName.style.fontWeight = 'bold'
    itemName.style.flex = '1'
    itemHeader.appendChild(itemName)

    // Dev mode: Add item button
    if (isDevMode && onAddItem) {
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.title = 'Add to inventory (Dev)'
      addBtn.style.width = '28px'
      addBtn.style.height = '28px'
      addBtn.style.padding = '0'
      addBtn.style.background = 'rgba(50, 120, 50, 0.9)'
      addBtn.style.border = '2px solid rgba(100, 200, 100, 0.5)'
      addBtn.style.borderRadius = '4px'
      addBtn.style.color = 'white'
      addBtn.style.fontSize = '1.1rem'
      addBtn.style.fontWeight = 'bold'
      addBtn.style.cursor = 'pointer'
      addBtn.style.transition = 'background 0.15s'
      addBtn.style.lineHeight = '1'

      addBtn.addEventListener('mouseenter', () => {
        addBtn.style.background = 'rgba(70, 150, 70, 0.95)'
      })
      addBtn.addEventListener('mouseleave', () => {
        addBtn.style.background = 'rgba(50, 120, 50, 0.9)'
      })
      addBtn.addEventListener('click', () => {
        onAddItem(itemId)
      })

      itemHeader.appendChild(addBtn)
    }

    detailPanel.appendChild(itemHeader)

    // Traits row - the item's tags (e.g. "wood", "coal") so players can see
    // why it satisfies tag-based recipe ingredients like "Any coal"
    const traits = recipeBook.getItemTags(itemId)
    if (traits.length > 0) {
      const traitsRow = document.createElement('div')
      traitsRow.style.display = 'flex'
      traitsRow.style.flexWrap = 'wrap'
      traitsRow.style.gap = '0.3rem'
      traitsRow.style.marginBottom = '0.6rem'

      const traitsLabel = document.createElement('span')
      traitsLabel.textContent = 'Traits:'
      traitsLabel.style.color = 'rgba(255, 255, 255, 0.5)'
      traitsLabel.style.fontSize = '0.75rem'
      traitsLabel.style.alignSelf = 'center'
      traitsRow.appendChild(traitsLabel)

      for (const trait of traits) {
        const chip = document.createElement('span')
        chip.textContent = trait
        chip.style.fontSize = '0.7rem'
        chip.style.color = 'rgba(255, 230, 170, 0.9)'
        chip.style.background = 'rgba(70, 60, 35, 0.9)'
        chip.style.border = '1px solid rgba(255, 230, 170, 0.25)'
        chip.style.borderRadius = '999px'
        chip.style.padding = '0.1rem 0.5rem'
        traitsRow.appendChild(chip)
      }

      detailPanel.appendChild(traitsRow)
    }

    // Crafted By section
    const craftedBySection = document.createElement('div')

    const craftedByTitle = document.createElement('div')
    craftedByTitle.textContent = 'Crafted By'
    craftedByTitle.style.color = 'rgba(255, 255, 255, 0.7)'
    craftedByTitle.style.fontSize = '0.8rem'
    craftedByTitle.style.fontWeight = 'bold'
    craftedByTitle.style.marginBottom = '0.4rem'
    craftedBySection.appendChild(craftedByTitle)

    if (data.craftedBy.length === 0) {
      const noRecipe = document.createElement('div')
      noRecipe.textContent = 'Found in world (mining, harvesting, mob drops)'
      noRecipe.style.color = 'rgba(255, 255, 255, 0.5)'
      noRecipe.style.fontSize = '0.75rem'
      noRecipe.style.fontStyle = 'italic'
      noRecipe.style.padding = '0.4rem'
      noRecipe.style.background = 'rgba(25, 25, 25, 0.9)'
      noRecipe.style.borderRadius = '4px'
      craftedBySection.appendChild(noRecipe)
    } else {
      const recipeList = document.createElement('div')
      recipeList.style.display = 'flex'
      recipeList.style.flexDirection = 'column'
      recipeList.style.gap = '0.4rem'

      for (const recipe of data.craftedBy) {
        recipeList.appendChild(createRecipeCard(recipe, false))
      }

      craftedBySection.appendChild(recipeList)
    }

    detailPanel.appendChild(craftedBySection)

    // Used In section
    const usedInSection = document.createElement('div')

    const usedInTitle = document.createElement('div')
    usedInTitle.textContent = 'Used In'
    usedInTitle.style.color = 'rgba(255, 255, 255, 0.7)'
    usedInTitle.style.fontSize = '0.8rem'
    usedInTitle.style.fontWeight = 'bold'
    usedInTitle.style.marginBottom = '0.4rem'
    usedInSection.appendChild(usedInTitle)

    if (data.usedIn.length === 0) {
      const noUse = document.createElement('div')
      noUse.textContent = 'Not used in any recipes'
      noUse.style.color = 'rgba(255, 255, 255, 0.5)'
      noUse.style.fontSize = '0.75rem'
      noUse.style.fontStyle = 'italic'
      noUse.style.padding = '0.4rem'
      noUse.style.background = 'rgba(25, 25, 25, 0.9)'
      noUse.style.borderRadius = '4px'
      usedInSection.appendChild(noUse)
    } else {
      const useList = document.createElement('div')
      useList.style.display = 'flex'
      useList.style.flexDirection = 'column'
      useList.style.gap = '0.4rem'

      for (const recipe of data.usedIn) {
        useList.appendChild(createRecipeCard(recipe, true))
      }

      usedInSection.appendChild(useList)
    }

    detailPanel.appendChild(usedInSection)
  }

  /**
   * Render placeholder when no item is selected
   */
  function renderPlaceholder(): void {
    detailPanel.innerHTML = ''

    const placeholder = document.createElement('div')
    placeholder.style.display = 'flex'
    placeholder.style.alignItems = 'center'
    placeholder.style.justifyContent = 'center'
    placeholder.style.height = '100%'
    placeholder.style.color = 'rgba(255, 255, 255, 0.4)'
    placeholder.style.fontSize = '0.85rem'
    placeholder.style.fontStyle = 'italic'
    placeholder.textContent = 'Select an item to view recipes'

    detailPanel.appendChild(placeholder)
  }

  // Search input handler
  searchInput.addEventListener('input', () => {
    renderItemList(searchInput.value)
  })

  // Initial state
  renderItemList()
  renderPlaceholder()

  const api: RecipeBookUI = {
    root,

    get isVisible() {
      return visible
    },

    show(): void {
      visible = true
      root.style.display = 'flex'
    },

    hide(): void {
      visible = false
      root.style.display = 'none'
    },

    navigateToItem(itemId: string): void {
      // Clear search to ensure item is visible
      searchInput.value = ''
      renderItemList('')
      selectItem(itemId)
    },

    refresh(): void {
      const query = searchInput.value
      renderItemList(query)
      if (selectedItemId) {
        // Re-render detail if an item was selected
        renderDetailPanel(selectedItemId)
      } else {
        renderPlaceholder()
      }
    },

    destroy(): void {
      if (root.parentElement) {
        root.parentElement.removeChild(root)
      }
    },
  }

  return api
}
