# 项目长期约定

## 架构
- X6 画布逻辑全部封装在 `src/graph/GraphEditor.ts` 的 `GraphEditor` 类中，`src/views/HomeView.vue` 只负责引入调用与 UI。
- 分层约定：类只回抛「能力状态」（如 `canGroup`/`canUngroup`），菜单文案、图标等 UI 内容留在 Vue 侧。
- 新增画布能力优先在类里加方法，组件通过 `editor.value?.xxx()` 调用，不直接碰 `instance` 逃生舱。
- 路径别名 `@` → `src`（vite 与 tsconfig 均已配置）。

## @antv/x6 v3 关键 API 约定
- 插件（Selection/Snapline/Transform/Keyboard/Clipboard/History）直接从 `@antv/x6` 导入，无需单独安装 `@antv/x6-plugin-*`。
- 缩放上下限用 `scaling: { min, max }`，**不是** `minZoom/maxZoom`。
- Transform 的 resizing 里是 `restrict`，**不是** `restricted`。
- `validateRubberband` 在 v3 已移除（rubberband 默认只在空白处触发）。
- ⚠️ **框选的修饰键判定不识别空格**：`allowRubberband` 严格模式只查 ctrl/shift/alt/meta（内部强制 `spaceKey=false`），所以 `panning.modifiers:['space']` 时空格拖拽会**同时**平移 + 拉出蓝色 rubberband。Selection 自带的 `resolvePanningSelectionConflict()` 只比较 `eventTypes/modifiers`，默认配置下判不出冲突。解法：按住空格期间 `selectionPlugin.disableRubberband()`，松开/窗口失焦时恢复（Panning 启动条件与框选是否可用无关，不受影响）。
- History：`canUndo()`/`canRedo()`/`cleanHistory()`；事件 `history:change` 在 add/undo/redo/clean 后统一触发，监听它即可刷新 Undo/Redo 按钮状态。
- Keyboard 键名用 `up/down/left/right`（内部会把 `arrowup` 归一化）；回调 `(e: KeyboardEvent) => void`，可读 `e.shiftKey`。`global: false` 时需先点击画布聚焦才响应。
- 坐标：视口坐标用 `e.clientX/clientY`；转画布坐标用 `graph.pageToLocal(e.pageX, e.pageY)`。
- ⚠️ **节点文字的 canonical 路径是 `attrs/text/text`**：顶层 `label` 元数据经 `Base` 基类 propHooks（`shape/base.js`）在构造时转存到 `attrs/text/text`，渲染靠 CSS 标签名选择器作用到 `<text>` 元素；`attrs/label/text` 是经 markup selector 'label' 的另一条等价渲染路径。**读文字必须两条路径都查**（项目里用 `readNodeLabel()`），只读 `label/text` 会拿到空串（文字节点自适应曾因此退化到最小尺寸 30×24）。面板写入统一走 `text/text`；样式覆盖（fontSize/fill/fontFamily）走 `label/...` 可正常生效。
- ⚠️ **选中节点会盖一层 `.x6-widget-selection-box` div（pointer-events:auto）**，把 bbox 内的**其它节点**的 mousedown 全吃掉：插件 `onBoxMouseDown` 对「选中框+ctrl+mousedown」直接把被框住的 cell `unselect`（表现为"先选大矩形再 Ctrl 点里面的节点→选区清空"），反向又被 `movedMap`/`selectCellOnMoved:false` 挡掉。**同一层覆盖物还会吞掉「普通点击」**（不带 Ctrl 点覆盖层内的其它节点毫无反应）。所以 Ctrl/Cmd 多选与普通点击穿透**都必须自研**，统一在 `bindPointerSelection()` 里：容器上捕获阶段监听 mousedown/mouseup——**两个分支都在 mousedown 阶段拦截**（`preventDefault`+`stopPropagation`）：
  - Ctrl/Cmd+左键：命中节点即 `g.select`/`g.unselect`；
  - 普通左键且 `e.target.closest('.x6-widget-selection')`（落点在别的已选节点的覆盖层）+ 底层节点不在当前选区：`g.resetSelection([node])` 穿透改选。
  - ⚠️ **改选必须在 mousedown 拦，不能在 mouseup 拦**：mouseup 才 stopPropagation 会挡掉 X6 挂在 document 上的 mouseup → 覆盖层启动的"拖动整组"永不结束 → 节点跟着鼠标跑（踩过的回归）。mousedown 就 preventDefault 则 X6 根本不启动拖动。mouseup 只在"已接管"时吞掉配对事件。
  - 两个分支都补 `container.focus({preventScroll:true})`（preventDefault 会挡住容器获焦）。
  - 其余（未覆盖节点、拖节点、拖选中框、缩放/旋转手柄、框选）一律放行。

- ⚠️ **改完选区必须调 `syncTransformWidget()` 同步 Transform 框**：X6 `Transform` 插件**只监听 `graph` 的 `node:click`（显示/迁移变换框）和 `blank:mousedown`（清空）**。自研接管吞掉了原生 `node:click` → 变换框停在上一个节点，而 `resetSelection` 让 Selection 的橙框已切到新节点 → 表现为"点了新的但看着没选中"（图里：橙框在新节点、黑框还留在旧节点）。同步方式：**单选节点 → `transformPlugin.createWidget(node)`，多选/空选 → `transformPlugin.clearWidgets()`**（都公开）。**千万别用 `g.trigger('blank:mousedown')` 清空**——Selection 也监听它，会连选区一起清。
- 命中判定不要用 `graph.findViewsFromPoint`（按 bbox 命中、且吃**画布局部坐标**，三栏布局下必偏移）；用 `document.elementsFromPoint` 跳过 `.x6-widget-selection` 覆盖层后 `findViewByElem(el).cell`，得到视觉最上层节点。
- ⚠️ `elementsFromPoint` 首个命中若是选中框容器/box，`findViewByElem(它).cell` 会返回**当前选中的 cell**（不是别的东西）——所以必须先按 `.x6-widget-selection` 跳过，再取第一个映射到 node 的元素，否则会误判成"点到了已选中节点"。
- 在 mousedown 上 `preventDefault()` 会阻止容器获焦（Keyboard 插件 `global:false` 靠容器 tabindex=-1 收键）→ 必须补 `container.focus({preventScroll:true})`，否则点完按 Delete 无效。

## ⚠️ 组合功能的血泪坑
- **`removeFromParent()` 会删除节点**！它内部走 `removeChildAt` → `unembed()` 后又调 `child.remove()`。取消组合必须用 `parent.unembed(child)`（只解除关系）。
- `embed/unembed` 只改 children/parent 引用，**不转换坐标**，子节点始终为画布绝对坐标，取消组合不会跑位。
- 当前方案：组合生成**隐形父容器**（fill/stroke 透明），靠 X6 原生 embedding 实现拖动联动；hover 时才把描边显示出来做整组高亮。
- **组合是真正的层级模型**：`groupSelection` 合并时把**最外层旧组容器整块** `addChild` 进新容器（不打散成员），形成如 `组C={组A, 组B, n4}` 的嵌套结构；用 `isDescendantOf` 过滤掉被包含的内层组。`insertChild` 会自动摘旧父再挂新父，无需手动 unembed。
- **取消组合 = 解除「选中项」这一层**：选中容器 → 解散该容器，直接子节点**整块释放**（嵌套子组保持成组）；选中成员 → 只 `unembed` 该成员，其余成员仍成组（菜单据此显示「取消组合 / 移出组合」）。
- ⚠️ **框选必然把容器和成员一起选中**：`ungroupSelection` 必须用 `isDescendantOf` 跳过"位于被解散容器子树内"的选中项，否则会一边解散外层、一边把成员逐个移出内层子组 → 子组被掏空（用户反馈的"全部取消"就是这个原因）。
- 成员变化后要维护容器：剩余 < 2 自动解散（并把父容器加入 `touched` 逐级整理）；≥ 2 用 `getCellsBBox` + `container.position/size` refit。
- **对齐以「组合」为单位，方向键以「选中节点本身」为单位（Alt=整组）**：对齐走 `resolveUnits`（组合整体作 1 个单元，容器内多成员则还原为成员本身）；方向键（`bindArrowKeys`+`resolveArrowTargets`）默认移动**选中的节点本身**（`getAncestors` 过滤掉"祖先已在目标集"的节点防双重平移），按 **Alt** 才移动最外层容器（整组）。容器 `translate` 时子节点原生跟随（`Node.translate` 递归平移子树），所以**绝不能对"容器和它的成员"同时 translate**——成员会双倍移动。
- 用户沟通教训：涉及"层级/一层"的需求，务必让用户给**具体前后状态**（如 C={A,B,n4} → A、B、n4），抽象描述极易误判（本项目连误判三次）。
- **鼠标拖「组合成员」：选择给成员，位移按 Alt 决定**（`bindPointerSelection` + `beginGroupDrag`）：
  - 语义拆开：**点击**成员 → 选中**成员本身**（属性面板可编辑，原生）；**拖动**成员（**无 Alt**）→ X6 原生移动**该成员个体**（容器经 `refitParent` 自动贴合跟随）；**拖动**成员（**按 Alt**）→ 把位移落到**最外层容器**上（== 整组移动）。
  - ⚠️ 绝不 translate 成员来移动整组：成员单独平移会脱离容器；若成员和容器都平移，成员双倍移动。Alt 整组拖用 `beginGroupDrag` 平移容器、期间用 `groupDragging` 标记压制 `refitParent`。
  - ⚠️ 不要把选区设成容器（会导致"组内成员永远选不中"，已踩回归）；也不要用"合成 mousedown 打到容器"重定向（选中态副作用难控）。自研拖拽最稳。
  - 自研拖拽要点：坐标用 `graph.clientToLocal(x,y)`（自动跟缩放/平移）；每帧按「目标位置 − 当前实际位置」增量 translate 规避取整漂移；越过阈值（2px，对齐 `moveThreshold`）才动；整段包 `startBatch/stopBatch('move-group')` → 一条撤销记录。
  - ⚠️ 这条分支**不能**设 `handled = true` 再去吞 mouseup：容器捕获阶段 stopPropagation 会挡掉自己挂在 document 上的 mouseup → 拖动不结束 → 整组跟着鼠标跑。mousemove/mouseup 一律挂 document 冒泡。
  - 例外：组合参与**多选**（容器已选中且选区数 >1）时不接管，放行让 X6 原生拖整个选区。
- 注意：`embedding.enabled + findParent` 会让拖动节点自动产生父子关系，因此**实际可能出现嵌套组合**（不止一层）。
- **框选一定会把隐形容器一起选中**（橡皮筋按几何相交算，容器包围着成员）。不能用 Selection 的 `filter` 排除它——`filter` 同时作用于点击选中，排除后容器就无法被选中、也就无法拖动整组。
- 正确解法：判定时把选区拆成"单元"——已有组合（容器本身，或成员所属的父容器，按 id 去重）各算 1 个单元，自由节点各算 1 个单元。`canGroup = unitCount >= 2`（支持「组合 + 新节点/另一个组合」合并），`canUngroup = 自由节点数 === 0 && 组合数 > 0`。组合实现要把旧容器 `unembed` 全部成员后删掉，成员并入新容器。
- **删除是递归的**：`Cell.remove()` 内部 `if (options.deep !== false) this.eachChild(child => child.remove(options))`，删容器默认连带删光后代（早期误判为"不递归"，已更正）。想要"只删容器保留子节点"必须先 `unembed` 全部子节点再删。
- 连边无需手动处理：`model.unreference()` 在移除 cell 时会自动 `removeConnectedEdges`（除非传 `disconnectEdges: true`）。

## 编辑器布局（三栏）
- `src/views/HomeView.vue` = 左侧 `NodePalette`（220px）+ 中间工具栏/画布（`min-width: 0` 必须）+ 右侧 `PropertyPanel`（280px）。
- 自定义图形注册在 `src/graph/shapes.ts`（`registerShapes()` **必须在 `new Graph()` 之前**）；面板数据 `PALETTE_GROUPS` 里每项带 `meta: NodeMetadata`。
- 拖放用 X6 内置 `Dnd`（v3 已内置，不用装 `@antv/x6-plugin-dnd`）：`startDragCreate(item, e)` → `graph.createNode(meta)` → `dnd.start(node, e)`；落图走 `model.addCell` 并派生 `node:added`，据此对新节点自动选中。
- 画布尺寸自适应靠 `ResizeObserver` 观察容器（三栏下 window.resize 覆盖不到中间栏宽度变化）。
- 属性面板：类侧 `getSelectedNodeSnapshot()` / `applyNodeProps(patch)` / `onNodeChange(cb)`；UI 侧 watch 快照回填表单，改动走 `@change` 下发。颜色要从 `transparent/none` 规范化成 `rgba(0,0,0,0)` 才能喂给 el-color-picker。

## 多选批量样式（Ctrl/框选 ≥2 节点）
- 能力：矩形/圆/文字节点多选后可**批量**改「文字颜色、文字大小、背景色、描边（含宽度 + 实线/虚线）」。
- 类侧接口：`getMultiStyleState(): MultiStyleState | null`（返回各属性共享值，不一致则 `undefined` 表示"混合"态）+ `applyMultiStyle(patch)`（遍历**非容器**节点、包 `batchUpdate` → 一条撤销记录）。
- 抽出私有 `_writeStyleFields(node, patch)` 供单选 `applyNodeProps` 与批量 `applyMultiStyle` 共用，避免两套写入逻辑分叉。
- ⚠️ **文字节点（透明本体）不写背景/描边**：`applyMultiStyle` 里对 `isTextNode` 的节点剥离 `fill/stroke/strokeWidth/strokeStyle`；`getMultiStyleState` 的 fill/stroke 共享值只从 `!isTextNode` 的节点取；面板含文字节点时禁用背景/描边控件。
- ⚠️ **隐形组合容器必须过滤**：多选批量只对可见内容节点生效，`isGroupContainer` 节点跳过（否则给透明容器写脏数据）。
- 面板呈现：HomeView `syncNodeSnapshot` 同时算 `nodeSnapshot`（单选）与 `multiStyle`（多选），`PropertyPanel` 用独立 `v-if` 块——`!snapshot && !multiStyle`=空态、`!snapshot && multiStyle`=批量区（覆盖单选面板）、`snapshot`=单选面板。

## 节点事件开关（预览页交互总开关）
- 数据：`node.data.events`（`NodeEventFlags { click, hover }`，缺省 `{click:false,hover:false}`），随 JSON 导入导出；属性面板 `eventsClick/eventsHover` + `apply({events})` 下发，`applyNodeProps` 字段级合并进 `data.events`（`readNodeEvents` 兜底缺省）。
- 语义：**作用于非房间节点**（矩形/圆/文字）；**房间节点由 `allocated` 状态控制，此开关对其不生效**（属性面板里房间不显示该区块）。
- 预览交互（`onNodeClickInPreview` 统一驱动）：
  - click 开启的**非房间**节点，预览页点击弹简洁信息卡（`PreviewView` 的 `nonRoom` 卡，显示类型 + 文字内容）；
  - hover 开启的节点，hover 时 `cursor:pointer` + 给节点 `<g>` 加 `.preview-node-hover`（guides.css 里 `drop-shadow` 发光，不污染节点数据）；
  - 房间 `allocated` → 可点弹详情 + hover 高亮；`!allocated`（不可分配）→ 强制关闭（不可点/不 hover 交互）+ `cursor:not-allowed`。
- `PreviewNodeClick` 回抛新增 `isRoom` / `isText` 字段，供 `PreviewView` 区分弹框样式与信息卡类型（文字节点 shape 仍是 'rect'，靠 `isText` 区分，避免误显为"矩形"）。

## ⚠️ vue-tsc 类型收窄坑（PropertyPanel 模板）
- 模板里若顶层条件用 `mode` 计算属性（`mode==='none'/'multi'/'single'`）再分支，**vue-tsc 无法把 prop `snapshot` 收窄为非空**，导致 `snapshot.xxx` 报 "possibly null"。
- 正确做法：单选 `<el-form>` 直接用 `v-if="snapshot"`，让 vue-tsc 在该块内把 `snapshot` 收窄为非空；批量区与空态用各自独立的 `v-if`（`!snapshot && multiStyle` / `!snapshot && !multiStyle`），不要用 `v-if/v-else-if/v-else` 复合链或经计算属性中转。

## 用户协作偏好
- 偏好「先给方案 → 确认后再实现」，方案要有选型对比表和关键坑说明。
- 回复用中文 + 结构化表格 + 说明改了什么。
