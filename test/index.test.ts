import type { CmdARoot } from '../src/index'

import { describe, expect, it, vi } from 'vitest'
import {
  applySelection,

  collectSelectableElements,
  handleCmdA,
  isSelectAllEvent,
  resolveContainer,
  setupCmdA,
} from '../src/index'

class FakeElement {
  nodeType = 1
  tagName: string
  parentElement: FakeElement | null = null
  children: FakeElement[] = []
  private attributes = new Map<string, string>()

  constructor(tagName: string, attrs: Record<string, string> = {}) {
    this.tagName = tagName.toUpperCase()
    Object.entries(attrs).forEach(([key, value]) => {
      this.attributes.set(key, value)
    })
  }

  appendChild(child: FakeElement) {
    child.parentElement = this
    this.children.push(child)
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attributes.has(name) ? this.attributes.get(name)! : null
  }

  querySelectorAll(selector: string): FakeElement[] {
    const selectors = selector.split(',').map(s => s.trim()).filter(Boolean)
    const matches: FakeElement[] = []
    const visit = (node: FakeElement) => {
      if (selectors.some(sel => node.matchesSelector(sel)))
        matches.push(node)
      node.children.forEach(visit)
    }
    visit(this)
    return matches
  }

  private matchesSelector(selector: string): boolean {
    if (!selector)
      return false
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const body = selector.slice(1, -1)
      const [attrName, rawValue] = body.split('=')
      if (!attrName)
        return false
      if (!rawValue)
        return this.attributes.has(attrName.trim())
      const normalized = rawValue.replace(/^['"]|['"]$/g, '').trim()
      return this.attributes.get(attrName.trim()) === normalized
    }
    return this.tagName.toLowerCase() === selector.toLowerCase()
  }
}

class FakeTextNode {
  nodeType = 3
  parentElement: FakeElement | null

  constructor(parent: FakeElement | null) {
    this.parentElement = parent
  }
}

class FakeRange {
  startNode: Node | null = null
  endNode: Node | null = null

  setStartBefore(node: Node) {
    this.startNode = node
  }

  setEndAfter(node: Node) {
    this.endNode = node
  }
}

class FakeSelection {
  anchorNode: Node | null = null
  focusNode: Node | null = null
  ranges: FakeRange[] = []

  setAnchor(node: Node | null) {
    this.anchorNode = node
    this.focusNode = node
  }

  removeAllRanges() {
    this.ranges = []
  }

  addRange(range: Range) {
    const fakeRange = range as unknown as FakeRange
    this.ranges.push(fakeRange)
    this.anchorNode = fakeRange.startNode
    this.focusNode = fakeRange.endNode
  }
}

class FakeDocument implements CmdARoot {
  activeElement: Element | null = null
  private listeners = new Map<string, Set<EventListener>>()
  private selection = new FakeSelection()

  getSelection(): Selection | null {
    return this.selection as unknown as Selection
  }

  getDebugSelection() {
    return this.selection
  }

  createRange(): Range {
    return new FakeRange() as unknown as Range
  }

  setSelection(node: Node | null) {
    this.selection.setAnchor(node)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener)
      return
    if (!this.listeners.has(type))
      this.listeners.set(type, new Set())
    const fn: EventListener = typeof listener === 'function'
      ? listener
      : event => listener.handleEvent(event)
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener)
      return
    const fn: EventListener = typeof listener === 'function'
      ? listener
      : event => listener.handleEvent(event)
    this.listeners.get(type)?.delete(fn)
  }

  emit(type: string, event: KeyboardEvent) {
    for (const listener of this.listeners.get(type) ?? [])
      listener(event)
  }
}

const castElement = (value: FakeElement): Element => value as unknown as Element
const castNode = (value: FakeTextNode): Node => value as unknown as Node

function createTableTree() {
  const root = new FakeElement('section', { 'data-role': 'root' })
  const table = new FakeElement('table', { 'data-role': 'table' })
  const row = new FakeElement('tr')
  const cellA = new FakeElement('td', { 'data-role': 'cell' })
  const cellB = new FakeElement('td', { 'data-role': 'cell', 'data-skip': '1' })
  const textA = new FakeTextNode(cellA)
  const textB = new FakeTextNode(cellB)
  const wrapper = new FakeElement('article', { 'data-role': 'wrapper' })

  wrapper.appendChild(root)
  root.appendChild(table)
  table.appendChild(row)
  row.appendChild(cellA)
  row.appendChild(cellB)

  return {
    wrapper: castElement(wrapper),
    root: castElement(root),
    table: castElement(table),
    row: castElement(row),
    cells: [castElement(cellA), castElement(cellB)],
    textNodes: [castNode(textA), castNode(textB)],
  }
}

const matchTable = (element: Element) => element.getAttribute('data-role') === 'table'

const selectCells = (container: Element) => container.querySelectorAll('[data-role="cell"]')

function createNestedSelectionTree() {
  const containerA = new FakeElement('section', { 'data-node': 'a', 'data-container': '1' })
  const containerB = new FakeElement('div', { 'data-node': 'b', 'data-container': '1' })
  const rootC = new FakeElement('div', { 'data-node': 'c-root', 'data-container': '1' })
  containerA.appendChild(containerB)
  containerA.appendChild(rootC)

  const filteredOutside = new FakeElement('span', { 'data-node': 'd-outside', 'data-selectable': '1', 'data-skip': '1' })
  const groupE = new FakeElement('div', { 'data-node': 'e-group' })
  const eLeaves = Array.from({ length: 4 }, (_, index) => new FakeElement('p', {
    'data-node': `e-${index}`,
    'data-selectable': '1',
  }))
  eLeaves.forEach(node => groupE.appendChild(node))
  containerB.appendChild(filteredOutside)
  containerB.appendChild(groupE)

  const filteredInside = new FakeElement('span', { 'data-node': 'd-inside', 'data-selectable': '1', 'data-skip': '1' })
  const head = new FakeElement('p', { 'data-node': 'c-head', 'data-selectable': '1' })
  const tail = new FakeElement('p', { 'data-node': 'c-tail', 'data-selectable': '1' })
  const nestedBranch = new FakeElement('div', { 'data-node': 'c-nested' })
  const nestedLeaves = Array.from({ length: 3 }, (_, index) => new FakeElement('span', {
    'data-node': `c-nested-${index}`,
    'data-selectable': '1',
  }))
  nestedLeaves.forEach(node => nestedBranch.appendChild(node))
  rootC.appendChild(head)
  rootC.appendChild(filteredInside)
  rootC.appendChild(nestedBranch)
  rootC.appendChild(tail)

  return {
    top: castElement(rootC),
    anchors: [
      castElement(head),
      castElement(tail),
      ...nestedLeaves.map(castElement),
      castElement(filteredInside),
    ],
    filteredInside: castElement(filteredInside),
    outsideLeaves: [castElement(filteredOutside), ...eLeaves.map(castElement)],
  }
}

function createKeyEvent(init: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: 'a',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...init,
  } as KeyboardEvent
}

describe('resolveContainer', () => {
  it('finds the nearest matching container', () => {
    const tree = createTableTree()
    const container = resolveContainer(tree.textNodes[0], { matchContainer: matchTable })
    expect(container).toBe(tree.table)
  })

  it('respects the top boundary', () => {
    const tree = createTableTree()
    const container = resolveContainer(tree.textNodes[0], {
      matchContainer: element => element.getAttribute('data-role') === 'root',
      top: tree.table,
    })
    expect(container).toBeNull()
  })

  it('falls back to the top boundary when matcher is omitted', () => {
    const tree = createTableTree()
    const container = resolveContainer(tree.cells[0], { top: tree.root })
    expect(container).toBe(tree.root)
  })

  it('returns null when matcher is omitted and the anchor is outside top', () => {
    const tree = createTableTree()
    const stray = castElement(new FakeElement('div'))
    const container = resolveContainer(stray, { top: tree.root })
    expect(container).toBeNull()
  })
})

describe('collectSelectableElements', () => {
  it('uses custom strategy and filter', () => {
    const tree = createTableTree()
    const elements = collectSelectableElements(tree.table, {
      select: () => [tree.cells[0], tree.table, tree.cells[1]],
      filter: element =>
        element.getAttribute('data-role') === 'cell'
        && element.getAttribute('data-skip') !== '1',
    })
    expect(elements).toEqual([tree.cells[0]])
  })

  it('falls back to container', () => {
    const tree = createTableTree()
    const elements = collectSelectableElements(tree.table)
    expect(elements).toEqual([tree.table])
  })
})

describe('isSelectAllEvent', () => {
  it('identifies supported modifiers', () => {
    expect(isSelectAllEvent(createKeyEvent())).toBe(true)
    expect(isSelectAllEvent(createKeyEvent({ metaKey: false, ctrlKey: true }))).toBe(true)
    expect(isSelectAllEvent(createKeyEvent({ key: 'b' }))).toBe(false)
    expect(isSelectAllEvent(createKeyEvent({ altKey: true }))).toBe(false)
  })
})

describe('handleCmdA', () => {
  it('builds a custom selection and prevents default behaviour', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.activeElement = tree.cells[0]
    doc.setSelection(tree.textNodes[0])
    const onSelect = vi.fn()
    const event = createKeyEvent()

    const result = handleCmdA(event, {
      root: doc,
      matchContainer: matchTable,
      select: selectCells,
      filter: element => element.getAttribute('data-skip') !== '1',
      onSelect,
    })

    expect(result?.container).toBe(tree.table)
    expect(result?.elements).toEqual([tree.cells[0]])
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(result)
  })

  it('ignores events that do not match the shortcut', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.setSelection(tree.textNodes[0])
    const event = createKeyEvent({ key: 'b' })

    const result = handleCmdA(event, {
      root: doc,
      matchContainer: matchTable,
      select: selectCells,
    })

    expect(result).toBeNull()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('applies DOM selection by default when possible', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.setSelection(tree.textNodes[0])
    handleCmdA(createKeyEvent(), {
      root: doc,
      matchContainer: matchTable,
      select: selectCells,
    })

    const selection = doc.getDebugSelection()
    expect(selection.ranges).toHaveLength(1)
    const [range] = selection.ranges
    expect(range.startNode).toBe(tree.cells[0])
    expect(range.endNode).toBe(tree.cells[1])
  })

  it('allows custom applySelection handler', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.setSelection(tree.textNodes[0])
    const applier = vi.fn()

    handleCmdA(createKeyEvent(), {
      root: doc,
      matchContainer: matchTable,
      select: selectCells,
      applySelection: applier,
    })

    expect(applier).toHaveBeenCalledTimes(1)
    const [, context] = applier.mock.calls[0]
    expect(context.root).toBe(doc)
    expect(context.selectionApplied).toBe(true)
  })

  it('uses matching profiles to override behaviour', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.setSelection(tree.textNodes[0])
    const baseFilter = vi.fn((element: Element) => element.getAttribute('data-role') === 'cell')
    const profileFilter = vi.fn((element: Element) => element.getAttribute('data-skip') !== '1')
    const profileOnSelect = vi.fn()
    const globalOnSelect = vi.fn()

    const result = handleCmdA(createKeyEvent(), {
      root: doc,
      matchContainer: matchTable,
      select: selectCells,
      filter: baseFilter,
      profiles: [
        {
          priority: 5,
          test: () => false,
          select: () => [tree.root],
        },
        {
          priority: 1,
          test: () => true,
          select: () => [tree.cells[1]],
        },
        {
          priority: 10,
          test: () => true,
          filter: profileFilter,
          applySelection: false,
          onSelect: profileOnSelect,
        },
      ],
      onSelect: globalOnSelect,
    })

    expect(result?.elements).toEqual([tree.cells[0]])
    expect(result?.selectionApplied).toBe(false)
    expect(profileOnSelect).toHaveBeenCalledTimes(1)
    expect(globalOnSelect).toHaveBeenCalledTimes(1)
    expect(baseFilter).toHaveBeenCalled()
    expect(profileFilter).toHaveBeenCalled()
  })

  it('keeps selection inside nested roots with filters and repeated triggers', () => {
    const doc = new FakeDocument()
    const tree = createNestedSelectionTree()
    const select = (container: Element) => container.querySelectorAll('[data-selectable]')
    const filter = (element: Element) => element.getAttribute('data-skip') !== '1'
    const matchContainer = (element: Element) => element.getAttribute('data-container') === '1'
    const expected = collectSelectableElements(tree.top, {
      select,
      filter,
      includeContainer: false,
    })

    const runSelection = (anchor: Element) => handleCmdA(createKeyEvent(), {
      root: doc,
      top: tree.top,
      matchContainer,
      select,
      filter,
      selectionNode: anchor,
    })

    for (const anchor of tree.anchors) {
      const result = runSelection(anchor)
      expect(result?.container).toBe(tree.top)
      expect(result?.elements).toEqual(expected)
      expect(result?.elements).not.toContain(tree.filteredInside)
      for (const outside of tree.outsideLeaves)
        expect(result?.elements).not.toContain(outside)
    }

    const first = runSelection(tree.anchors[0]!)
    const second = runSelection(tree.anchors[1]!)
    expect(first?.elements).toEqual(expected)
    expect(second?.elements).toEqual(expected)
  })

  it('falls back to the active element when selection anchor is outside top', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.activeElement = tree.cells[0]
    doc.setSelection(tree.wrapper as unknown as Node)

    const result = handleCmdA(createKeyEvent({
      target: tree.cells[0] as unknown as EventTarget,
    }), {
      root: doc,
      top: tree.root,
      matchContainer: matchTable,
      select: selectCells,
    })

    expect(result?.container).toBe(tree.table)
    expect(result?.elements).toEqual(tree.cells)
  })

  it('uses the event target when selection anchor is outside top', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.activeElement = null
    doc.setSelection(tree.wrapper as unknown as Node)

    const result = handleCmdA(createKeyEvent({
      target: tree.cells[0] as unknown as EventTarget,
    }), {
      root: doc,
      top: tree.root,
      matchContainer: matchTable,
      select: selectCells,
    })

    expect(result?.container).toBe(tree.table)
    expect(result?.elements).toEqual(tree.cells)
  })

  it('allows native behaviour when context is outside top', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.activeElement = null
    doc.setSelection(tree.wrapper as unknown as Node)

    const result = handleCmdA(createKeyEvent({ target: null as unknown as EventTarget }), {
      root: doc,
      top: tree.root,
      matchContainer: matchTable,
      select: selectCells,
      lastContainer: tree.table,
    })

    expect(result).toBeNull()
  })

  it('reuses the previous container when scoped candidates fail to match', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.activeElement = null
    doc.setSelection(tree.root as unknown as Node)

    const result = handleCmdA(createKeyEvent({
      target: tree.root as unknown as EventTarget,
    }), {
      root: doc,
      top: tree.root,
      matchContainer: element => element.getAttribute('data-role') === 'row',
      select: selectCells,
      lastContainer: tree.table,
    })

    expect(result?.container).toBe(tree.table)
    expect(result?.elements).toEqual(tree.cells)
  })
})

describe('applySelection', () => {
  it('uses provided range factory when document is unavailable', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    const range = new FakeRange()
    const result = applySelection(tree.cells, {
      root: doc,
      rangeFactory: () => range as unknown as Range,
    })
    expect(result).toBe(true)
    const selection = doc.getDebugSelection()
    expect(selection.ranges).toHaveLength(1)
    expect(selection.ranges[0].startNode).toBe(tree.cells[0])
  })

  it('falls back to the provided top boundary when no matcher is given', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.setSelection(tree.textNodes[0])

    const result = handleCmdA(createKeyEvent(), {
      root: doc,
      top: tree.root,
      select: selectCells,
    })

    expect(result?.container).toBe(tree.root)
    expect(result?.elements).toEqual(tree.cells)
  })
})

describe('setupCmdA', () => {
  it('subscribes to keydown events and exposes cleanup', () => {
    const tree = createTableTree()
    const doc = new FakeDocument()
    doc.setSelection(tree.textNodes[0])
    const onSelect = vi.fn()

    const cleanup = setupCmdA({
      root: doc,
      matchContainer: matchTable,
      select: () => [tree.cells[0]],
      onSelect,
    })

    doc.emit('keydown', createKeyEvent())
    expect(onSelect).toHaveBeenCalledTimes(1)

    cleanup()
    doc.emit('keydown', createKeyEvent())
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
