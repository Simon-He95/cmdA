## scoped-select-all
这个项目是一个全选的控制函数，当点击到某一个容器内，使用 cmd+A 快捷键时，可以控制哪些元素被选中，到哪一层级，比如，点击到一个表格内，使用 cmd+A 快捷键时，可以选择表格内的所有单元格，或者选择整张表格。

## Usage

```ts
import { setupCmdA } from 'scoped-select-all'

const cleanup = setupCmdA({
  // 限制查找范围，避免越界到编辑器外部
  top: () => document.querySelector('#editor-root'),
  // 告诉 scoped-select-all 哪些祖先元素算作可操作容器
  matchContainer: element => element.hasAttribute('data-cmd-a'),
  // 自定义要收集的元素集合
  select: container => container.querySelectorAll('[data-selectable]'),
  // 过滤掉不希望包含的元素
  filter: element => !element.hasAttribute('data-disabled'),
  onSelect: ({ elements }) => {
    elements.forEach(el => el.classList.add('is-selected'))
  },
})

// 不再需要时取消监听
cleanup()
```

### Options

- `top`: 设定最顶层的祖先节点，可以是元素或返回元素的函数，一旦达到该节点就不再继续往上查找。
- `matchContainer`: 判断当前元素是否为可操作容器，可根据业务（如 `closest`、自定义属性等）返回布尔值；当仅需要在 `top` 范围内操作时可省略，默认直接返回 `top` 容器。
- `select`: 自定义如何从容器中取出需要全选的元素；默认只返回容器本身。
- `filter`: 在最终结果中排除某些元素。
- `onSelect`: 捕获 Cmd+A 后得到的容器与元素列表，方便做样式或数据处理。
- `applySelection`: 默认会自动构造一个 `Range` 并调用原生 Selection，可传入 `false` 关闭，或传入函数自行处理（函数会拿到 `elements` 与 `root`）。
- `profiles`: 按容器维度配置不同的选择策略，每个 profile 可单独定义 `test`、`select`、`filter`、`applySelection` 与 `onSelect`，并通过 `priority` 决定匹配顺序。
- `setupCmdA` 会在 `keydown` 阶段阻止默认行为，可通过 `preventDefault: false` 关闭。

### 容器解析 & Cmd+A 行为

scoped-select-all 会在 `top` 范围内优先使用以下顺序寻找容器：

1. 自定义的 `selectionNode`，其次是当前 Selection 的 anchor。
2. 本次 `keydown` 的 `event.target` 与 `activeElement`。
3. 上一次命中的容器（确保仍位于 `top` 内）。

如果所有候选节点都位于 `top` 之外，则不会强行回落，直接交给原生 Cmd+A，从而允许编辑器外部（例如页面顶部的其它文字）保持系统默认的全选行为。借助这一机制，同一个容器内连续按下 Cmd+A 可以稳定落在 profile 的策略上，而点击到其它区域时又能立即恢复原生选择。

### 手动控制 Selection

如果你想在回调里自行决定如何操作 Selection，可以使用导出的 `applySelection` 工具：

```ts
import { applySelection } from 'scoped-select-all'

setupCmdA({
  filter: element => element.tagName === 'TD',
  onSelect: ({ elements, event }) => {
    // 自行处理样式
    elements.forEach(el => el.classList.add('is-selected'))
    // 需要时再手动同步给原生 Selection
    applySelection(elements)
    console.log('custom selection from', event.key)
  },
  applySelection: false,
})
```

### Profiles 示例

```ts
import { setupCmdA } from 'scoped-select-all'

setupCmdA({
  matchContainer: el => el.closest('[data-editor]') !== null,
  select: container => container.querySelectorAll('p'),
  profiles: [
    {
      test: container => container.matches('[data-type="table"]'),
      priority: 10,
      select: container => container.querySelectorAll('td'),
      filter: cell => !cell.hasAttribute('data-disabled'),
    },
    {
      test: container => container.matches('[data-type="list"]'),
      applySelection: false,
      onSelect: ({ elements }) => console.log('list', elements.length),
    },
  ],
})
```

### Vue Playground（Monorepo 示例）

仓库内使用 pnpm workspace 管理了一个 Vue3 + Vite 示例（位于 `examples/vue-playground`），体验方式如下：

```bash
pnpm install
pnpm --filter vue-playground dev   # 默认 http://localhost:5173
```

该示例通过组件化的方式展示了嵌套表格 / 列表 / 卡片场景，并把 `scoped-select-all` 当作 workspace 依赖直接引用源码，便于在 monorepo 下联调：

- 不同容器触发各自的 profile，实时展示被选元素、profile 选择策略以及是否同步原生 Selection。
- 组件内部通过响应式状态呈现当前点击节点、激活容器描边、事件日志等，方便排查嵌套层级问题。
- 可搭配 `pnpm --filter vue-playground build` / `preview` 快速部署 demo。

## :coffee:

[buy me a cup of coffee](https://github.com/Simon-He95/sponsor)

## License

[MIT](./license)

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.svg">
    <img src="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.png"/>
  </a>
</p>
