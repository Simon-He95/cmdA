<template>
  <main class="layout">
    hihi
  <div  ref="rootRef">
    <section class="surface" data-playground-root data-cmd-container>
      <header>
        <h1>scoped-select-all Playground</h1>
        <p>
          点击任意容器中的元素，然后使用 <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>A</kbd> 查看 profile 的行为差异。
        </p>
        <div class="status-grid">
          <div>
            <div class="label">当前点击</div>
            <div class="value">{{ activeTarget }}</div>
          </div>
          <div>
            <div class="label">最近一次 Cmd+A</div>
            <div class="value">{{ selectionStatus }}</div>
          </div>
        </div>
      </header>

      <div class="playground-grid">
        <section
          class="container"
          data-cmd-container
          data-container-id="table"
          data-type="table"
          :class="{ 'is-active': isContainerActive('table') }"
        >
          <h2>表格容器</h2>
          <p>profile 会选择所有 <code>td[data-selectable]</code> 与卡片中的按钮。</p>
          <table>
            <tbody>
              <tr v-for="row in tableRows" :key="row[0].id">
                <td
                  v-for="cell in row"
                  :key="cell.id"
                  data-selectable
                  :data-node="cell.id"
                  :class="{ 'is-selected': isSelected(cell.id) }"
                  @click="handleElementClick(cell.id, $event)"
                >
                  {{ cell.text }}
                  <div
                    v-if="cell.card"
                    class="nested-card"
                    data-cmd-container
                    data-container-id="card"
                    data-type="card"
                    :class="{ 'is-active': isContainerActive('card') }"
                  >
                    <strong>内嵌卡片</strong>
                    <button
                      v-for="button in cardButtons"
                      :key="button.id"
                      type="button"
                      data-selectable
                      :data-node="button.id"
                      :data-disabled="button.disabled ? '' : null"
                      :class="{ 'is-selected': isSelected(button.id) }"
                      @click.stop="handleElementClick(button.id, $event)"
                    >
                      {{ button.text }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          class="container"
          data-cmd-container
          data-container-id="list"
          data-type="list"
          :class="{ 'is-active': isContainerActive('list') }"
        >
          <h2>列表容器</h2>
          <p>profile 仅选择列表项内的 <code>span[data-selectable]</code>。</p>
          <ul class="demo-list">
            <li v-for="item in listItems" :key="item.id">
              <span
                data-selectable
                :data-node="item.id"
                :data-disabled="item.disabled ? '' : null"
                :class="{ 'is-selected': isSelected(item.id) }"
                @click="handleElementClick(item.id, $event)"
              >
                {{ item.text }}
              </span>
              <small>说明文字</small>
            </li>
          </ul>
        </section>
      </div>
    </section>

    <aside class="log-panel">
      <div class="log-header">
        <h2>Selection Log</h2>
        <button class="clear-log" type="button" @click="clearLogs">清空</button>
      </div>
      <ol class="log-list">
        <li v-for="log in logs" :key="log.id">{{ formatLog(log) }}</li>
      </ol>
    </aside>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { setupCmdA, type CmdAResult, type CmdAProfile } from 'scoped-select-all'

type LogEntry = {
  id: string
  container: string
  count: number
  applied: boolean
  detail: string
  time: Date
}

const rootRef = ref<HTMLElement | null>(null)
const activeTarget = ref('无')
const selectionStatus = ref('等待触发…')
const activeContainer = ref<string | null>(null)
const selectedIds = ref<Set<string>>(new Set())
const logs = ref<LogEntry[]>([])
let cleanup: (() => void) | null = null

const tableRows = [
  [
    { id: 'A1', text: '单元格 A1', card: true },
    { id: 'A2', text: '单元格 A2' },
  ],
  [
    { id: 'B1', text: '单元格 B1' },
    { id: 'B2', text: '单元格 B2' },
  ],
]

const cardButtons = [
  { id: 'card-a', text: '禁用按钮', disabled: true },
  { id: 'card-b', text: '可选按钮', disabled: false },
]

const listItems = [
  { id: 'L1', text: '列表项 1', disabled: false },
  { id: 'L2', text: '列表项 2', disabled: false },
  { id: 'L3', text: '列表项 3（忽略）', disabled: true },
]

onMounted(() => {
  if (!rootRef.value)
    return
  cleanup = setupCmdA({
    top: () => rootRef.value,
    matchContainer: element => element instanceof HTMLElement && element.hasAttribute('data-cmd-container'),
    selector: '[data-selectable]',
    filter: element => !element.hasAttribute('data-disabled'),
    profiles: buildProfiles(),
    onSelect: handleSelect,
  })
})

onBeforeUnmount(() => {
  cleanup?.()
})

function buildProfiles(): CmdAProfile[] {
  return [
    {
      priority: 20,
      test: container => container.getAttribute('data-type') === 'table',
      select: container => container.querySelectorAll('td[data-selectable], td [data-selectable]'),
    },
    {
      priority: 15,
      test: container => container.getAttribute('data-type') === 'card',
      select: container => container.querySelectorAll('[data-selectable]'),
      includeContainer: false,
      applySelection: false,
    },
    {
      priority: 5,
      test: container => container.getAttribute('data-type') === 'list',
      select: container => container.querySelectorAll('[data-selectable]'),
    },
  ]
}

function handleSelect(result: CmdAResult) {
  const ids = new Set<string>()
  for (const element of result.elements) {
    const id = (element as HTMLElement).dataset?.node
    if (id)
      ids.add(id)
  }
  selectedIds.value = ids
  activeContainer.value = getContainerId(result.container)
  const label = [...ids].join(', ') || '未标记 data-node'
  selectionStatus.value = `${activeContainer.value ?? result.container.tagName.toLowerCase()}: ${result.elements.length} 个 (${result.selectionApplied ? '同步 Selection' : '仅回调'}) → ${label}`
  logs.value = [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      container: activeContainer.value ?? result.container.tagName.toLowerCase(),
      count: result.elements.length,
      applied: result.selectionApplied,
      detail: label,
      time: new Date(),
    },
    ...logs.value,
  ].slice(0, 20)
}

function handleElementClick(nodeId: string, event: MouseEvent) {
  activeTarget.value = nodeId
  const container = (event.currentTarget as HTMLElement | null)?.closest('[data-cmd-container]') as HTMLElement | null
  activeContainer.value = getContainerId(container)
}

function isSelected(id: string) {
  return selectedIds.value.has(id)
}

function isContainerActive(id: string) {
  return activeContainer.value === id
}

function clearLogs() {
  logs.value = []
}

function formatLog(entry: LogEntry) {
  const time = entry.time.toLocaleTimeString()
  return `[${time}] container=${entry.container} count=${entry.count} (${entry.applied ? 'native' : 'custom'}) => ${entry.detail}`
}

function getContainerId(element: Element | null | undefined) {
  if (!element)
    return null
  return (element as HTMLElement).dataset?.containerId ?? element.getAttribute('data-type') ?? null
}
</script>
