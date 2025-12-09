export interface CmdARoot {
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => void
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) => void
  getSelection?: () => Selection | null
  activeElement?: Element | null
  createRange?: () => Range
}

export interface CmdAResult {
  container: Element
  elements: Element[]
  event: KeyboardEvent
  selectionApplied: boolean
}

export type SelectStrategy = (container: Element) => Iterable<
  Element | null | undefined
>

export interface SelectionApplierContext extends CmdAResult {
  root: CmdARoot
}

export type SelectionApplier = (
  elements: Element[],
  context: SelectionApplierContext,
) => void

export type CmdAApplySelection = boolean | SelectionApplier

export interface ApplySelectionOptions {
  root?: CmdARoot
  rangeFactory?: () => Range
}

export interface ContainerOptions {
  top?: Element | null | (() => Element | null)
  matchContainer?: (element: Element) => boolean
  containerResolver?: (
    start: Element,
    context: { limit: Element | null },
  ) => Element | null
}

export interface SelectionOptions {
  includeContainer?: boolean
  selector?: string | string[]
  select?: SelectStrategy
  filter?: (element: Element) => boolean
}

export interface CmdAProfile extends SelectionOptions {
  test?: (container: Element, context: { event: KeyboardEvent }) => boolean
  priority?: number
  applySelection?: CmdAApplySelection
  onSelect?: (result: CmdAResult) => void
}

export interface CmdAOptions extends ContainerOptions, SelectionOptions {
  root?: CmdARoot
  onSelect?: (result: CmdAResult) => void
  preventDefault?: boolean
  capture?: boolean
  matchEvent?: (event: KeyboardEvent) => boolean
  applySelection?: CmdAApplySelection
  profiles?: CmdAProfile[]
  scope?: Element | null | (() => Element | null)
}

export interface CmdAHandlerOptions extends CmdAOptions {
  selectionNode?: Node | null
  lastContainer?: Element | null
}

export function setupCmdA(options: CmdAOptions = {}): () => void {
  const root = resolveRoot(options.root)
  const capture = options.capture ?? true
  const handlerOptions: CmdAHandlerOptions = { ...options, root }
  const listener: EventListener = (event) => {
    if (!isKeyboardEvent(event))
      return
    const result = handleCmdA(event, handlerOptions)
    if (result)
      handlerOptions.lastContainer = result.container
  }

  root.addEventListener('keydown', listener, capture)
  return () => root.removeEventListener('keydown', listener, capture)
}

export function handleCmdA(
  event: KeyboardEvent,
  options: CmdAHandlerOptions = {},
): CmdAResult | null {
  const root = resolveRoot(options.root)
  const matchEvent = options.matchEvent ?? isSelectAllEvent
  if (!matchEvent(event))
    return null

  const limit = resolveLimit(options.top)
  const anchorNode = options.selectionNode ?? getSelectionAnchor(root)
  const scopeElement = resolveScope(options.scope) ?? limit
  if (scopeElement && !isEventWithinScope(scopeElement, event, root, anchorNode))
    return null

  const isInsideTop = (candidate: Node | null | undefined) => {
    if (!limit)
      return true
    const element = getElement(candidate)
    return Boolean(element && isWithinLimit(element, limit))
  }

  const candidates: (Node | null | undefined)[] = []
  let hasScopedContext = !limit
  const pushCandidate = (candidate: Node | null | undefined) => {
    if (!candidate)
      return
    if (!candidates.includes(candidate)) {
      candidates.push(candidate)
      if (isInsideTop(candidate))
        hasScopedContext = true
    }
  }

  pushCandidate(anchorNode)
  if (!options.selectionNode) {
    pushCandidate(event.target as Node | null | undefined)
    pushCandidate(root.activeElement ?? null)
  }

  let container: Element | null = null
  for (const candidate of candidates) {
    container = resolveContainer(candidate, options)
    if (container)
      break
  }

  const canUseLastContainer = Boolean(
    options.lastContainer
    && hasScopedContext
    && (!limit || isWithinLimit(options.lastContainer, limit)),
  )
  if (!container && canUseLastContainer)
    container = options.lastContainer!

  if (!container)
    return null

  const profile = resolveProfile(container, event, options.profiles)
  const selectionOptions = mergeSelectionOptions(options, profile)
  const elements = collectSelectableElements(container, selectionOptions)
  if (elements.length === 0)
    return null

  if (options.preventDefault !== false)
    event.preventDefault?.()

  const result: CmdAResult = {
    container,
    elements,
    event,
    selectionApplied: false,
  }
  const behavior = profile?.applySelection ?? options.applySelection
  result.selectionApplied = runSelectionBehavior(result, root, behavior)
  profile?.onSelect?.(result)
  options.onSelect?.(result)
  return result
}

export function resolveContainer(
  startNode: Node | null | undefined,
  options: ContainerOptions = {},
): Element | null {
  const startElement = getElement(startNode)
  if (!startElement)
    return null

  const limit = resolveLimit(options.top)
  const withinLimit = Boolean(limit && isWithinLimit(startElement, limit))

  if (options.containerResolver) {
    const resolved = options.containerResolver(startElement, { limit })
    if (resolved)
      return resolved
  }

  if (!options.matchContainer) {
    if (!limit)
      return startElement
    return withinLimit ? limit : null
  }

  const match = options.matchContainer
  let current: Element | null = startElement
  while (current) {
    if (match(current))
      return current
    if (limit && current === limit)
      break
    current = current.parentElement
  }

  if (limit && match(limit))
    return limit
  return null
}

export function collectSelectableElements(
  container: Element,
  options: SelectionOptions = {},
): Element[] {
  const includeContainer = options.includeContainer ?? true
  const filter = options.filter
  const seen = new Set<Element>()
  const result: Element[] = []

  const push = (candidate: Element | null | undefined) => {
    if (!isElement(candidate) || seen.has(candidate))
      return
    if (filter && !filter(candidate))
      return
    seen.add(candidate)
    result.push(candidate)
  }

  if (options.select) {
    for (const candidate of options.select(container) ?? [])
      push(candidate as Element | null | undefined)
  }
  else {
    const selectors = normalizeSelectors(options.selector)
    if (selectors.length > 0 && typeof container.querySelectorAll === 'function') {
      for (const selector of selectors) {
        const matches = container.querySelectorAll(selector)
        for (const match of matches)
          push(match)
      }
    }
    if (includeContainer)
      push(container)
  }

  return result
}

function resolveProfile(
  container: Element,
  event: KeyboardEvent,
  profiles?: CmdAProfile[] | null,
): CmdAProfile | undefined {
  if (!profiles || profiles.length === 0)
    return undefined
  let winner: CmdAProfile | undefined
  let priority = Number.NEGATIVE_INFINITY
  for (const profile of profiles) {
    if (!profile)
      continue
    const tester = profile.test ?? (() => true)
    if (!tester(container, { event }))
      continue
    const currentPriority = profile.priority ?? 0
    if (!winner || currentPriority > priority) {
      winner = profile
      priority = currentPriority
    }
  }
  return winner
}

function mergeSelectionOptions(
  options: SelectionOptions,
  profile?: SelectionOptions,
): SelectionOptions {
  if (!profile)
    return options
  return {
    includeContainer: profile.includeContainer ?? options.includeContainer,
    selector: profile.selector ?? options.selector,
    select: profile.select ?? options.select,
    filter: mergeFilters(options.filter, profile.filter),
  }
}

function mergeFilters(
  base?: (element: Element) => boolean,
  extra?: (element: Element) => boolean,
): ((element: Element) => boolean) | undefined {
  if (base && extra)
    return element => base(element) && extra(element)
  return extra ?? base ?? undefined
}

export function isSelectAllEvent(event: KeyboardEvent): boolean {
  if (!event || typeof event.key !== 'string')
    return false
  if (event.altKey)
    return false
  const key = event.key.toLowerCase()
  if (key !== 'a')
    return false
  return Boolean(event.metaKey || event.ctrlKey)
}

export function getSelectionAnchor(root?: CmdARoot): Node | null {
  const selection = resolveSelection(root)
  if (selection?.anchorNode)
    return selection.anchorNode
  return root?.activeElement ?? null
}

export function applySelection(
  elements: Element[],
  options: ApplySelectionOptions = {},
): boolean {
  if (!Array.isArray(elements) || elements.length === 0)
    return false
  const selection = resolveSelection(options.root)
  if (!selection)
    return false
  const rangeFactory = resolveRangeFactory(options)
  if (!rangeFactory)
    return false

  const range = rangeFactory()
  const first = elements[0]
  const last = elements[elements.length - 1] ?? first
  if (!isElement(first) || !isElement(last))
    return false

  range.setStartBefore(first)
  range.setEndAfter(last)
  selection.removeAllRanges?.()
  selection.addRange(range)
  return true
}

function resolveSelection(root?: CmdARoot): Selection | null {
  if (root && typeof root.getSelection === 'function')
    return root.getSelection() ?? null

  if (typeof window !== 'undefined' && typeof window.getSelection === 'function')
    return window.getSelection()

  if (typeof document !== 'undefined' && typeof document.getSelection === 'function')
    return document.getSelection()

  return null
}

function runSelectionBehavior(
  result: CmdAResult,
  root: CmdARoot,
  behavior?: CmdAApplySelection,
): boolean {
  const strategy = behavior ?? true
  if (!strategy)
    return false
  if (typeof strategy === 'function') {
    const context: SelectionApplierContext = {
      ...result,
      selectionApplied: true,
      root,
    }
    strategy(result.elements, context)
    return true
  }
  return applySelection(result.elements, { root })
}

function resolveRangeFactory(
  options: ApplySelectionOptions,
): (() => Range) | null {
  if (typeof options.rangeFactory === 'function')
    return options.rangeFactory

  const root = options.root
  if (root && typeof root.createRange === 'function')
    return () => root.createRange!()

  if (typeof document !== 'undefined' && typeof document.createRange === 'function')
    return () => document.createRange()

  return null
}

function resolveRoot(provided?: CmdARoot): CmdARoot {
  if (provided)
    return provided
  if (typeof document !== 'undefined')
    return document
  throw new Error('scoped-select-all: document is not available. Provide options.root explicitly.')
}

function resolveLimit(limit?: Element | null | (() => Element | null)): Element | null {
  if (typeof limit === 'function')
    return limit()
  return limit ?? null
}

function resolveScope(scope?: Element | null | (() => Element | null)): Element | null {
  if (typeof scope === 'function')
    return scope() ?? null
  return scope ?? null
}

function normalizeSelectors(selector?: string | string[]): string[] {
  if (!selector)
    return []
  if (Array.isArray(selector))
    return selector.map(s => s.trim()).filter(Boolean)
  return selector
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function getElement(node: Node | null | undefined): Element | null {
  if (!node)
    return null
  if (isElement(node))
    return node
  return (node as { parentElement?: Element | null }).parentElement ?? null
}

function isWithinLimit(element: Element, limit: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (current === limit)
      return true
    current = current.parentElement
  }
  return false
}

function isEventWithinScope(
  scope: Element,
  event: KeyboardEvent,
  root: CmdARoot,
  selectionNode?: Node | null,
): boolean {
  const candidates: (Element | null)[] = [
    getElement(event.target as Node | null | undefined),
    getElement(selectionNode),
    root.activeElement ?? null,
  ]
  return candidates.some(element => element && isWithinLimit(element, scope))
}

function isElement(value: unknown): value is Element {
  return Boolean(
    value
    && typeof value === 'object'
    && 'nodeType' in value
    && (value as { nodeType?: number }).nodeType === 1,
  )
}

function isKeyboardEvent(event: Event): event is KeyboardEvent {
  return Boolean(event && typeof (event as KeyboardEvent).key === 'string')
}
