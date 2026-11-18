<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import {
  GraphEditor,
  type TransformCommand,
  type ContextMenuItem,
  type ContextMenuState,
  type AlignType,
  type DistributeType,
  type NodeSnapshot,
  type NodePropsPatch,
  type MultiStyleState,
  type MultiRoomStyleState,
} from '@/graph/GraphEditor'
import ContextMenu from '@/components/ContextMenu.vue'
import NodePalette from '@/components/NodePalette.vue'
import CampMapList from '@/components/CampMapList.vue'
import { loadCampMaps, updateCampMapContent } from '@/graph/campMaps'
import PropertyPanel from '@/components/PropertyPanel.vue'
import type { PaletteItem } from '@/graph/shapes'
import { ElMessage, ElMessageBox } from 'element-plus'

const containerRef = ref<HTMLDivElement>()
// 顶部 / 左侧标尺 DOM（供 GraphEditor 拖出参考线 + 绘制刻度）
const topRulerRef = ref<HTMLDivElement>()
const leftRulerRef = ref<HTMLDivElement>()
// graph 逻辑已封装到 GraphEditor 类，这里只持有类实例
const editor = ref<GraphEditor>()
// 参考线显隐状态（与画布内实际状态同步）
const guidesVisible = ref(true)

const commands: { key: TransformCommand; label: string; shortcut?: string }[] = [
  // { key: 'zoomIn', label: '放大(+0.2)', shortcut: 'Ctrl + +' },
  // { key: 'zoomOut', label: '缩小(-0.2)', shortcut: 'Ctrl + -' },
  { key: 'zoomTo', label: '重置缩放', shortcut: 'Ctrl + 0' },
  // { key: 'zoomToFit', label: '适配画布' },
  { key: 'centerContent', label: '内容居中' },
]

// 快捷键说明弹框：内容与实际绑定的快捷键保持一致（见 GraphEditor.bindShortcuts / bindArrowKeys / bindZoomShortcuts / bindSpaceRubberbandGuard）
const shortcutsVisible = ref(false)
const shortcutGroups: { title: string; items: { keys: string; desc: string }[] }[] = [
  {
    title: '通用',
    items: [
      { keys: 'Ctrl / Cmd + Z', desc: '撤销' },
      { keys: 'Ctrl / Cmd + Shift + Z', desc: '重做' },
      { keys: 'Ctrl / Cmd + A', desc: '全选画布内节点' },
      { keys: 'Delete / Backspace', desc: '删除选中节点（含组合成员，递归删除）' },
    ],
  },
  {
    title: '复制粘贴',
    items: [
      { keys: 'Ctrl / Cmd + C', desc: '复制选中节点（组合整体复制）' },
      { keys: 'Ctrl / Cmd + V', desc: '粘贴（自动偏移 32px，保持成组）' },
    ],
  },
  {
    title: '选择',
    items: [
      { keys: 'Ctrl / Cmd + 点击', desc: '多选切换（逐个加 / 减选）' },
      { keys: '拖拽空白处', desc: '框选多个节点（几何相交即选）' },
    ],
  },
  {
    title: '视图与画布',
    items: [
      { keys: 'Ctrl / Cmd + 0', desc: '重置缩放（100%）' },
      { keys: 'Ctrl / Cmd + -', desc: '缩小（-0.2）' },
      { keys: 'Ctrl / Cmd + +', desc: '放大（+0.2，主键盘 = 或 小键盘 +）' },
      { keys: '按住空格 + 拖拽', desc: '平移画布（任意位置，含节点 / 组合上）' },
    ],
  },
  {
    title: '移动节点',
    items: [
      { keys: '方向键 ↑ ↓ ← →', desc: '移动选中节点 1px' },
      { keys: 'Shift + 方向键', desc: '移动选中节点 10px' },
      { keys: 'Alt + 方向键', desc: '整组移动 1px' },
      { keys: 'Alt + Shift + 方向键', desc: '整组移动 10px' },
    ],
  },
]

const transform = (command: TransformCommand) => {
  editor.value?.transform(command)
}

// 参考线显隐切换（标尺 + 参考线整体开关）
const toggleGuides = () => {
  guidesVisible.value = !guidesVisible.value
  editor.value?.setGuidesVisible(guidesVisible.value)
}

// 清空全部参考线（参考线增删不进撤销栈，用"清除全部"整体移除）
const handleClearGuides = () => {
  editor.value?.clearGuides()
}

// 撤销/重做按钮的可用状态，随撤销栈实时变化
const canUndo = ref(false)
const canRedo = ref(false)

const syncHistoryState = () => {
  canUndo.value = editor.value?.canUndo() ?? false
  canRedo.value = editor.value?.canRedo() ?? false
}

const handleUndo = () => {
  editor.value?.undo()
}

const handleRedo = () => {
  editor.value?.redo()
}

// 间距分布：选中 ≥3 个单元时可用，随选区实时变化
const canDistribute = ref(false)

const distribute = (type: DistributeType) => {
  editor.value?.distributeSelection(type)
}

const syncSelectionState = () => {
  canDistribute.value = (editor.value?.getSelectedUnitCount() ?? 0) >= 3
}

// 当前正在编辑的营地地图 id（与左栏高亮一致）；null = 尚未选择地图
const currentMapId = ref<string | null>(null)

/**
 * 切换营地地图：保存当前画布 → 加载目标地图内容（无内容则空白）→ 更新 currentMapId。
 * 由 CampMapList 在「点击列表 / 新建 / 删除」时抛出目标 id（null = 清空画布）。
 */
const onMapSwitch = (id: string | null) => {
  const ed = editor.value
  if (!ed) return
  if (id === currentMapId.value) return
  // 切换地图会先存回旧地图；房间号重复时整段阻断，画布与当前地图 id 都不变
  if (!guardRoomNumbers()) return

  // 1) 把当前画布内容存回「旧地图」（旧地图已删除时 updateCampMapContent 会静默忽略）
  if (currentMapId.value != null) {
    updateCampMapContent(currentMapId.value, ed.exportJSON())
  }
  // 2) 加载目标地图内容（或空白），并重置缩放为 100%
  if (id == null) {
    ed.resetCanvas()
    ed.transform('zoomTo')
  } else {
    const target = loadCampMaps().find((m) => m.id === id)
    if (target?.content) {
      ed.importJSON(target.content)
      // importJSON 默认会 zoomToFit，这里覆盖回 100%（用户要求切换时重置缩放）
      ed.transform('zoomTo')
    } else if (currentMapId.value == null) {
      // 目标地图尚无内容，且当前未归属任何地图：把当前画布收归该地图，
      // 避免「先画几笔再新建第一张地图」时把未保存内容丢掉（画布不变，不重置缩放）
      updateCampMapContent(id, ed.exportJSON())
    } else {
      ed.resetCanvas()
      ed.transform('zoomTo')
    }
  }
  // 3) 同步状态
  currentMapId.value = id
  syncNodeSnapshot()
  syncHistoryState()
  syncSelectionState()
}

// ---------------- 画布导入 / 导出 JSON ----------------
const fileInputRef = ref<HTMLInputElement>()

// 导出：把画布序列化为 JSON 文件下载到本地
const handleExport = () => {
  if (!guardRoomNumbers()) return
  const json = editor.value?.exportJSON()
  if (json == null) return
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date()
    .toISOString()
    .replace(/[:T]/g, '-')
    .slice(0, 10)
  a.href = url
  a.download = `camp-map-${ts}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 导入：触发隐藏的文件选择框
const handleImportClick = () => {
  fileInputRef.value?.click()
}

// 选择文件后读取并导入；导入会整体替换画布，先二次确认避免误覆盖
const handleImportFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value，保证同一文件可再次选择
  input.value = ''
  if (!file) return

  try {
    await ElMessageBox.confirm(
      '导入将整体替换当前画布内容，是否继续？',
      '导入确认',
      { type: 'warning', confirmButtonText: '导入', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }

  const text = await file.text()
  try {
    editor.value?.importJSON(text)
    ElMessage.success('导入成功')
  } catch {
    ElMessage.error('JSON 解析失败，请确认文件格式正确')
  }
}

// 清空画布：破坏性操作，二次确认避免误删（操作进入历史可撤销）
const handleClearCanvas = async () => {
  if ((editor.value?.getCellCount() ?? 0) === 0) {
    ElMessage.info('画布已是空的')
    return
  }
  try {
    await ElMessageBox.confirm(
      '清空画布将移除所有节点与连线，且不可通过刷新找回（但可撤销），是否继续？',
      '清空确认',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  editor.value?.clearCanvas()
  ElMessage.success('画布已清空')
}

// ---------------- 草稿（存浏览器本地，关掉再开可找回） ----------------
// 保存草稿：把当前画布写入 localStorage，覆盖式，带保存时间
const handleSaveDraft = () => {
  if (!guardRoomNumbers()) return
  try {
    const time = editor.value?.saveDraft()
    ElMessage.success(`草稿已保存（${time}）`)
  } catch (e) {
    ElMessage.error((e as Error).message || '草稿保存失败')
  }
}

// 恢复草稿：从 localStorage 读回并整体替换画布（先二次确认避免误覆盖）
const handleLoadDraft = async () => {
  if (!editor.value?.hasDraft()) {
    ElMessage.info('当前没有可恢复的草稿')
    return
  }
  try {
    await ElMessageBox.confirm(
      '恢复草稿将整体替换当前画布内容，是否继续？',
      '恢复草稿',
      { type: 'warning', confirmButtonText: '恢复', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  try {
    editor.value?.loadDraft()
    ElMessage.success('草稿已恢复')
  } catch (e) {
    ElMessage.error((e as Error).message || '草稿恢复失败')
  }
}

// 启动自动恢复：页面加载若有草稿，询问是否恢复到画布（关掉网页再开能找回）
const offerDraftRestore = () => {
  const ed = editor.value
  if (!ed?.hasDraft()) return
  const t = ed.getDraftTime()
  const timeStr = t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '之前'
  ElMessageBox.confirm(
    `检测到 ${timeStr} 保存的草稿，是否恢复到画布？`,
    '恢复草稿',
    {
      type: 'info',
      confirmButtonText: '恢复',
      cancelButtonText: '忽略（保留草稿）',
    },
  )
    .then(() => {
      ed.loadDraft()
      ElMessage.success('草稿已恢复')
    })
    .catch(() => {
      // 用户忽略，草稿保留，可稍后通过"恢复草稿"按钮手动恢复
    })
}

// ---------------- 预览 / 前台接待 / 房间分配：新开只读路由页面（不可平移/缩放/改变大小） ----------------
const openReadOnlyPage = (route: 'preview' | 'reception' | 'room-allocate') => {
  const json = editor.value?.exportJSON()
  if (json == null) return
  // 把当前画布写入本地，供只读页读取（同源 localStorage 共享）
  localStorage.setItem('camp-map-preview', json)
  window.open(`${import.meta.env.BASE_URL}${route}`, '_blank')
}
const openPreview = () => openReadOnlyPage('preview')
const openReception = () => openReadOnlyPage('reception')
const openRoomAllocate = () => openReadOnlyPage('room-allocate')

// ---------------- 右键菜单 ----------------
const menuVisible = ref(false)
const menuState = ref<ContextMenuState>()

// 菜单项按选区动态生成：0 个 / 1 个 / 多个 / 组合体
const menuItems = computed<ContextMenuItem[]>(() => {
  const s = menuState.value
  if (!s) return []

  // 空白右键
  if (s.selectedCount === 0) {
    return [
      { key: 'paste', label: '粘贴', shortcut: 'Ctrl+V', disabled: !s.canPaste },
      { key: 'selectAll', label: '全选', shortcut: 'Ctrl+A' },
      { key: 'addNode', label: '在此新增节点', divided: true },
    ]
  }

  const items: ContextMenuItem[] = []

  // 选中容器本身 → 解散该组；只选中成员 → 把选中成员移出组（其余成员仍成组）
  if (s.canUngroup) {
    items.push({ key: 'ungroup', label: s.hasContainer ? '取消组合' : '移出组合' })
  }
  // unitCount = 自由节点数 + 已有组合数：框选混入的隐形容器按"组"计入，不会重复计数
  if (s.canGroup) {
    items.push({
      key: 'group',
      label: s.groupCount > 0 ? `组合 (${s.unitCount} 项)` : `组合 (${s.unitCount})`,
    })
  }

  // 多个节点才需要对齐
  if (s.selectedCount >= 2) {
    items.push(
      { key: 'align:left', label: '左对齐', divided: true },
      { key: 'align:centerX', label: '水平居中' },
      { key: 'align:right', label: '右对齐' },
      { key: 'align:top', label: '顶对齐' },
      { key: 'align:centerY', label: '垂直居中' },
      { key: 'align:bottom', label: '底对齐' },
    )
  }

  items.push(
    { key: 'copy', label: '复制', shortcut: 'Ctrl+C', divided: true },
    { key: 'toFront', label: '置于顶层' },
    { key: 'forward', label: '置上一层' },
    { key: 'backward', label: '置下一层' },
    { key: 'toBack', label: '置于底层' },
    {
      key: 'remove',
      // 删除是递归的，用 removeCount 才不会少报（删 1 个组合实际会连成员一起删）
      label: s.removeCount > 1 ? `删除 (${s.removeCount})` : '删除',
      shortcut: 'Delete',
      divided: true,
      danger: true,
    },
  )
  return items
})

const closeMenu = () => {
  menuVisible.value = false
}

const handleMenuSelect = (key: string) => {
  const ed = editor.value
  if (!ed) return
  closeMenu()

  if (key.startsWith('align:')) {
    ed.alignSelection(key.slice(6) as AlignType)
    return
  }

  switch (key) {
    case 'group':
      ed.groupSelection()
      break
    case 'ungroup':
      ed.ungroupSelection()
      break
    case 'copy':
      ed.copySelected()
      break
    case 'paste':
      ed.paste()
      break
    case 'selectAll':
      ed.selectAll()
      break
    case 'remove':
      ed.removeSelected()
      break
    case 'toFront':
      ed.changeLayer('front')
      break
    case 'forward':
      ed.changeLayer('forward')
      break
    case 'backward':
      ed.changeLayer('backward')
      break
    case 'toBack':
      ed.changeLayer('back')
      break
    case 'addNode': {
      const s = menuState.value
      if (s) ed.addNodeAt(s.graphX, s.graphY)
      break
    }
  }
}

// ---------------- 左侧节点库 → 画布（拖放） ----------------
const handleDragStart = (item: PaletteItem, e: MouseEvent) => {
  editor.value?.startDragCreate(item, e)
}

// ---------------- 右侧属性面板 ----------------
const nodeSnapshot = ref<NodeSnapshot | null>(null)
// 多选（≥2 个节点）时的批量样式状态，与单选快照并行传给面板
const multiStyle = ref<MultiStyleState | null>(null)
// 多选且「全部为编号房间」时的房间批量样式状态（归属公司 / 色条 / 面积 / 描边等）
const multiRoom = ref<MultiRoomStyleState | null>(null)

// 已被占用的房间号（供属性面板 roomNumber 下拉禁用），随选区/节点变化刷新
const assignedRoomNumbers = ref<string[]>([])

const syncNodeSnapshot = () => {
  nodeSnapshot.value = editor.value?.getSelectedNodeSnapshot() ?? null
  multiStyle.value = editor.value?.getMultiStyleState() ?? null
  multiRoom.value = editor.value?.getRoomStyleState() ?? null
  assignedRoomNumbers.value = Array.from(editor.value?.getAssignedRoomNumbers() ?? [])
}

const handleApply = (patch: NodePropsPatch) => {
  editor.value?.applyNodeProps(patch)
}

const handleApplyMulti = (patch: NodePropsPatch) => {
  editor.value?.applyMultiStyle(patch)
}

const handleApplyRoom = (patch: NodePropsPatch) => {
  editor.value?.applyRoomStyle(patch)
}

/**
 * 保存前校验房间号唯一性：有重复则阻断并返回 false。
 * 供保存草稿 / 导出 JSON / 切换地图共用，避免多入口漏校验。
 */
const guardRoomNumbers = (): boolean => {
  const dup = editor.value?.validateRoomNumbers() ?? []
  if (dup.length > 0) {
    ElMessage.error(`房间号重复，无法保存：${dup.join('、')}`)
    return false
  }
  return true
}

onMounted(() => {
  if (!containerRef.value) return
  // 传入容器，由 GraphEditor 负责初始化画布、注册插件、绑定快捷键
  editor.value = new GraphEditor(containerRef.value)
  editor.value.init()
  // 绑定顶部 / 左侧标尺（拖出参考线 + 刻度），必须在 init 之后
  if (topRulerRef.value && leftRulerRef.value) {
    editor.value.attachRulers(topRulerRef.value, leftRulerRef.value)
  }
  // 订阅撤销栈变化，任何增删/撤销/重做都会自动刷新按钮状态
  editor.value.onHistoryChange(syncHistoryState)
  syncHistoryState() // 初始同步

  // 订阅选区/属性变化，右侧面板跟随刷新
  editor.value.onNodeChange(syncNodeSnapshot)
  syncNodeSnapshot()

  // 订阅选区变化，刷新"间距分布"按钮可用状态（≥3 个单元才可分布）
  editor.value.onNodeChange(syncSelectionState)
  syncSelectionState()

  // 订阅右键菜单
  editor.value.onContextMenu((state) => {
    menuState.value = state
    menuVisible.value = true
  })

  // 启动后若有草稿，提示是否恢复到画布
  offerDraftRestore()
})

// 内存泄漏防护：组件卸载时销毁画布、移除全局监听
onBeforeUnmount(() => {
  editor.value?.dispose()
  editor.value = undefined
})
</script>

<template>
  <section class="editor">
    <!-- 左：节点库 + 营地地图列表 -->
    <aside class="side side--left">
      <NodePalette @drag-start="handleDragStart" />
      <CampMapList :active-id="currentMapId" @switch-to="onMapSwitch" />
    </aside>

    <!-- 中：工具栏 + 画布 -->
    <main class="center">
      <div class="toolbar">
        <el-button-group>
          <el-tooltip
            v-for="item in commands"
            :key="item.key"
            :disabled="!item.shortcut"
            :content="item.shortcut"
            placement="bottom"
          >
            <el-button @click="transform(item.key)">
              {{ item.label }}
            </el-button>
          </el-tooltip>
          <el-button @click="handleUndo" :disabled="!canUndo">撤销</el-button>
          <el-button @click="handleRedo" :disabled="!canRedo">重做</el-button>
          <el-button @click="distribute('distributeH')" :disabled="!canDistribute">水平分布间距</el-button>
          <el-button @click="distribute('distributeV')" :disabled="!canDistribute">垂直分布间距</el-button>
          <el-button type="danger" plain @click="handleClearCanvas">清空画布</el-button>
          <el-button @click="handleImportClick">导入</el-button>
          <el-button @click="handleExport">导出</el-button>
          <el-button @click="handleSaveDraft">保存草稿</el-button>
          <el-button @click="handleLoadDraft">恢复草稿</el-button>
          <el-button type="primary" @click="openPreview">预览</el-button>
          <el-button @click="openReception">前台接待</el-button>
          <el-button @click="openRoomAllocate">房间分配</el-button>
          <el-button @click="toggleGuides">{{ guidesVisible ? '隐藏参考线' : '显示参考线' }}</el-button>
          <el-button @click="handleClearGuides">清除参考线</el-button>
          <el-tooltip content="快捷键说明" placement="bottom">
            <el-button @click="shortcutsVisible = true" :aria-label="'快捷键说明'">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="2.5" y="6" width="19" height="12" rx="2" />
                <path d="M6 9.5h0M10 9.5h0M14 9.5h0M18 9.5h0" />
                <path d="M6 13.5h0M10 13.5h0M14 13.5h0M18 13.5h0" />
                <path d="M7 15.5h10" />
              </svg>
            </el-button>
          </el-tooltip>
        </el-button-group>
        <!-- 隐藏的文件选择框：导入时由"导入JSON"按钮触发 -->
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,application/json"
          hidden
          @change="handleImportFile"
        />
      </div>
      <div class="canvas-area">
        <div class="ruler-corner"></div>
        <div ref="topRulerRef" class="ruler ruler--top"></div>
        <div ref="leftRulerRef" class="ruler ruler--left"></div>
        <div ref="containerRef" class="graph-container"></div>
      </div>
    </main>

    <!-- 右：属性面板 -->
    <aside class="side side--right">
      <PropertyPanel
        :snapshot="nodeSnapshot"
        :multi-style="multiStyle"
        :multi-room="multiRoom"
        :assigned-room-numbers="assignedRoomNumbers"
        @apply="handleApply"
        @apply-multi="handleApplyMulti"
        @apply-room="handleApplyRoom"
      />
    </aside>

    <!-- 右键菜单：Teleport 到 body，fixed 定位 -->
    <ContextMenu
      :visible="menuVisible"
      :x="menuState?.x ?? 0"
      :y="menuState?.y ?? 0"
      :items="menuItems"
      @select="handleMenuSelect"
      @close="closeMenu"
    />

    <!-- 快捷键说明弹框 -->
    <el-dialog
      v-model="shortcutsVisible"
      title="快捷键说明"
      width="520px"
      align-center
      append-to-body
    >
      <div class="shortcuts">
        <div v-for="group in shortcutGroups" :key="group.title" class="sc-group">
          <div class="sc-group-title">{{ group.title }}</div>
          <div
            v-for="item in group.items"
            :key="item.keys"
            class="sc-row"
          >
            <kbd class="sc-keys">{{ item.keys }}</kbd>
            <span class="sc-desc">{{ item.desc }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="shortcutsVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.editor {
  display: flex;
  height: 100vh;
  box-sizing: border-box;
  padding: 12px;
  gap: 6px;
  background: #fff;
}
.side {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
}
.side--left {
  width: 220px;
}
.side--right {
  width: 280px;
}
.center {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0; /* 关键：允许中间栏在两侧面板挤压下正常收缩 */
  gap: 6px;
}
.toolbar {
  flex-shrink: 0;
}
.canvas-area {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 22px 1fr;
  grid-template-rows: 22px 1fr;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
}
.ruler-corner {
  grid-area: 1 / 1;
  background: #f0f2f5;
  border-right: 1px solid #e4e7ed;
  border-bottom: 1px solid #e4e7ed;
}
.ruler {
  position: relative;
  overflow: hidden;
  cursor: crosshair;
  background: #fafbfc;
}
.ruler--top {
  grid-area: 1 / 2;
  border-bottom: 1px solid #e4e7ed;
}
.ruler--left {
  grid-area: 2 / 1;
  border-right: 1px solid #e4e7ed;
}
.ruler-canvas {
  position: absolute;
  inset: 0;
  display: block;
}
.graph-container {
  grid-area: 2 / 2;
  position: relative; /* 作为参考线 DOM 覆盖层（绝对定位 inset:0）的定位上下文 */
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 快捷键说明弹框 */
.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sc-group-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
  border-left: 3px solid #409eff;
  padding-left: 8px;
}
.sc-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
}
.sc-row:nth-child(odd) {
  background: #f5f7fa;
}
.sc-keys {
  flex-shrink: 0;
  min-width: 150px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #303133;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 2px 8px;
  text-align: center;
}
.sc-desc {
  font-size: 13px;
  color: #606266;
}
</style>
