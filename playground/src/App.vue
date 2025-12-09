<template>
  <main class="layout" ref="rootRef">
    <section class="surface" data-playground-root data-cmd-container>
      <header>
        <h1>scoped-select-all Playground</h1>
        <p>
          点击任意容器中的元素，然后使用 <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>A</kbd> 观察不同 profile 与嵌套容器的行为。
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

        <section
          class="container"
          data-cmd-container
          data-container-id="board"
          data-type="board"
          :class="{ 'is-active': isContainerActive('board') }"
        >
          <h2>看板容器</h2>
          <p>展示父级（board）、列（column）以及子任务（subtasks）三个层级的 profile。</p>
          <div class="board">
            <article
              v-for="column in boardColumns"
              :key="column.id"
              class="board-column"
              data-cmd-container
              :data-container-id="`column-${column.id}`"
              data-type="column"
              :class="{ 'is-active': isContainerActive(`column-${column.id}`) }"
            >
              <header>
                <div class="column-title">{{ column.title }}</div>
                <span class="column-hint">{{ column.description }}</span>
              </header>
              <div class="board-tasks">
                <article
                  v-for="task in column.tasks"
                  :key="task.id"
                  class="task-card"
                  data-selectable
                  data-task
                  :data-node="task.id"
                  :data-disabled="task.disabled ? '' : null"
                  :class="{ 'is-selected': isSelected(task.id), 'is-muted': task.disabled }"
                  @click="handleElementClick(task.id, $event)"
                >
                  <header>
                    <div class="task-title">{{ task.title }}</div>
                    <span class="task-badge" v-if="task.badge">{{ task.badge }}</span>
                  </header>
                  <p>{{ task.detail }}</p>
                  <footer>
                    <span class="task-meta">{{ task.meta }}</span>
                  </footer>
                  <div
                    v-if="task.subtasks?.length"
                    class="subtasks"
                    data-cmd-container
                    :data-container-id="`subtasks-${task.id}`"
                    data-type="subtasks"
                    :class="{ 'is-active': isContainerActive(`subtasks-${task.id}`) }"
                  >
                    <button
                      v-for="subtask in task.subtasks"
                      :key="subtask.id"
                      type="button"
                      class="subtask-item"
                      data-selectable
                      data-subtask
                      :data-node="subtask.id"
                      :class="{ 'is-selected': isSelected(subtask.id) }"
                      @click.stop="handleElementClick(subtask.id, $event)"
                    >
                      <span>{{ subtask.text }}</span>
                      <small>{{ subtask.time }}</small>
                    </button>
                  </div>
                </article>
              </div>
            </article>
          </div>
        </section>

        <section
          class="container"
          data-cmd-container
          data-container-id="doc"
          data-type="doc"
          :class="{ 'is-active': isContainerActive('doc') }"
        >
          <h2>文档容器</h2>
          <p>混合段落、引用、代码块与 checklist，同时可以忽略 <code>data-locked</code> 的节点。</p>
          <article class="doc-article">
            <template v-for="block in docBlocks" :key="block.id">
              <p
                v-if="block.type === 'paragraph'"
                class="doc-block"
                data-selectable
                data-doc-node
                :data-node="block.id"
                :class="{ 'is-selected': isSelected(block.id) }"
                @click="handleElementClick(block.id, $event)"
              >
                {{ block.text }}
              </p>

              <div
                v-else-if="block.type === 'quote'"
                class="doc-block doc-quote"
                data-cmd-container
                :data-container-id="`quote-${block.id}`"
                data-type="quote"
                :class="{ 'is-active': isContainerActive(`quote-${block.id}`) }"
              >
                <p
                  v-for="line in block.lines"
                  :key="line.id"
                  data-selectable
                  data-quote-line
                  :data-node="line.id"
                  :class="{ 'is-selected': isSelected(line.id) }"
                  @click="handleElementClick(line.id, $event)"
                >
                  {{ line.text }}
                </p>
              </div>

              <ul v-else-if="block.type === 'checklist'" class="doc-block doc-checklist">
                <li v-for="item in block.items" :key="item.id">
                  <span
                    data-selectable
                    data-doc-node
                    :data-node="item.id"
                    :data-locked="item.locked ? '' : null"
                    :class="{ 'is-selected': isSelected(item.id), 'is-muted': item.locked }"
                    @click="handleElementClick(item.id, $event)"
                  >
                    <input type="checkbox" :checked="item.done" disabled />
                    {{ item.text }}
                  </span>
                </li>
              </ul>

              <pre
                v-else-if="block.type === 'code'"
                class="doc-block doc-code"
                data-selectable
                data-doc-node
                :data-node="block.id"
                @click="handleElementClick(block.id, $event)"
              ><code>{{ block.code }}</code></pre>
            </template>
          </article>
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

type BoardSubTask = {
  id: string
  text: string
  time: string
}

type BoardTask = {
  id: string
  title: string
  detail: string
  meta: string
  badge?: string
  disabled?: boolean
  subtasks?: BoardSubTask[]
}

type BoardColumn = {
  id: string
  title: string
  description: string
  tasks: BoardTask[]
}

type DocBlock =
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'quote'; lines: Array<{ id: string; text: string }> }
  | { id: string; type: 'checklist'; items: Array<{ id: string; text: string; done: boolean; locked?: boolean }> }
  | { id: string; type: 'code'; code: string }

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

const boardColumns: BoardColumn[] = [
  {
    id: 'todo',
    title: 'Todo',
    description: '规划中的任务',
    tasks: [
      {
        id: 'task-ux',
        title: '设计新的表格选择交互',
        detail: '调研竞品并整理交互稿',
        meta: 'Due 今天 14:00',
        badge: '高优',
        subtasks: [
          { id: 'task-ux-1', text: '竞品走查', time: '09:30' },
          { id: 'task-ux-2', text: '输出交互稿', time: '11:00' },
        ],
      },
      {
        id: 'task-api',
        title: '整理 Cmd+A API 文档',
        detail: '区分容器与 profile 的使用方式',
        meta: '2 comments',
        disabled: true,
      },
    ],
  },
  {
    id: 'doing',
    title: 'Doing',
    description: '开发进行中',
    tasks: [
      {
        id: 'task-vue-playground',
        title: 'Vue Playground 增强',
        detail: '补充嵌套列、子任务与富文本场景',
        meta: 'PR #128',
        subtasks: [
          { id: 'task-vue-playground-1', text: '子任务 profile', time: '13:20' },
        ],
      },
    ],
  },
]

const docBlocks: DocBlock[] = [
  { id: 'doc-p-1', type: 'paragraph', text: '在一个复杂的富文本编辑器里，容器之间可能存在嵌套关系，需要 profile 分流。' },
  {
    id: 'doc-quote-1',
    type: 'quote',
    lines: [
      { id: 'doc-quote-1-line-1', text: '“顶层容器可以决定全选的范围”' },
      { id: 'doc-quote-1-line-2', text: '—— Product Team' },
    ],
  },
  {
    id: 'doc-checklist-1',
    type: 'checklist',
    items: [
      { id: 'doc-check-1', text: '对齐 Cmd+A 规则', done: true },
      { id: 'doc-check-2', text: '补充 fallback 机制', done: true, locked: true },
      { id: 'doc-check-3', text: '增加 playground 场景', done: false },
    ],
  },
  {
    id: 'doc-code-1',
    type: 'code',
    code: `setupCmdA({\n  profiles: [\n    { test: isTable, select: pickCells },\n    { test: isDoc, filter: block => !block.locked },\n  ],\n})`,
  },
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
      priority: 18,
      test: container => container.getAttribute('data-type') === 'board',
      select: container => container.querySelectorAll('[data-task][data-selectable]'),
    },
    {
      priority: 17,
      test: container => container.getAttribute('data-type') === 'column',
      select: container => container.querySelectorAll('[data-task][data-selectable]'),
      filter: element => !element.hasAttribute('data-disabled'),
    },
    {
      priority: 25,
      test: container => container.getAttribute('data-type') === 'subtasks',
      select: container => container.querySelectorAll('[data-subtask]'),
      includeContainer: false,
      applySelection: false,
    },
    {
      priority: 15,
      test: container => container.getAttribute('data-type') === 'card',
      select: container => container.querySelectorAll('[data-selectable]'),
      includeContainer: false,
      applySelection: false,
    },
    {
      priority: 9,
      test: container => container.getAttribute('data-type') === 'doc',
      select: container => container.querySelectorAll('[data-doc-node]'),
      filter: element => !element.hasAttribute('data-locked'),
    },
    {
      priority: 10,
      test: container => container.getAttribute('data-type') === 'quote',
      select: container => container.querySelectorAll('[data-quote-line]'),
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
