<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { GraphEditor, createRoomInfo, type PreviewNodeClick, type RoomInfo } from '@/graph/GraphEditor'
import { getAllRoomOptions, type RoomOption } from '@/graph/campData'

const router = useRouter()
const containerRef = ref<HTMLDivElement>()
const scrollRef = ref<HTMLDivElement>()
const editor = ref<GraphEditor>()

// 预览数据由编辑页在跳转前写入 localStorage（键与 HomeView 约定一致）
const PREVIEW_KEY = 'camp-map-preview'

/** 当前弹框对应的节点（null = 未打开） */
const active = ref<PreviewNodeClick | null>(null)
const dialogVisible = computed(() => active.value !== null)

/** 非房间节点（矩形 / 圆 / 文字）点击后弹出的简洁信息卡数据源 */
const nonRoom = ref<PreviewNodeClick | null>(null)
const nonRoomVisible = computed(() => nonRoom.value !== null)

/** 信息卡里显示的节点类型：文字 > 圆 > 矩形 > 其它 */
const nonRoomType = computed(() => {
  const p = nonRoom.value
  if (!p) return ''
  if (p.isText) return '文字'
  if (p.shape === 'circle') return '圆'
  if (p.shape === 'rect') return '矩形'
  return p.shape
})

/** 预览左下角信息条：内容实际尺寸 / 视口尺寸 / 缩放比例 */
const contentSize = ref({ width: 0, height: 0 })
const viewportSize = ref({ width: 0, height: 0 })
const scaleRatio = ref(1)
const scalePercent = computed(() => Math.round(scaleRatio.value * 100))

/** 加载数据后：把画布按内容实际尺寸铺开（外层 CSS overflow 滚动），再读取尺寸/缩放 */
const readMetrics = () => {
  const e = editor.value
  if (!e) return
  e.resizeToContent()
  centerCanvas()
  contentSize.value = e.getContentSize()
  scaleRatio.value = e.getScale()
  if (scrollRef.value) {
    viewportSize.value = {
      width: scrollRef.value.clientWidth,
      height: scrollRef.value.clientHeight,
    }
  }
}

/**
 * 让画布左上角落在整像素上（居中偏移取整）。
 * 用 `margin: auto` 居中时，剩余空间为奇数就会落在 .5px 上，整层内容跟着偏半像素，
 * 1px 描边被摊成两条 ~50% 不透明度的线 → 预览里矩形/圆形的边框看起来发虚、断断续续。
 */
const centerCanvas = () => {
  const scroll = scrollRef.value
  const el = containerRef.value
  if (!scroll || !el) return
  const cs = getComputedStyle(scroll)
  const padL = parseFloat(cs.paddingLeft) || 0
  const padR = parseFloat(cs.paddingRight) || 0
  const padT = parseFloat(cs.paddingTop) || 0
  const padB = parseFloat(cs.paddingBottom) || 0
  const availW = scroll.clientWidth - padL - padR
  const availH = scroll.clientHeight - padT - padB
  const left = Math.max(0, Math.round((availW - el.offsetWidth) / 2))
  const top = Math.max(0, Math.round((availH - el.offsetHeight) / 2))
  el.style.marginLeft = `${left}px`
  el.style.marginTop = `${top}px`
}

onMounted(() => {
  if (!containerRef.value) return
  // 以只读预览模式初始化：内置禁平移/滚轮缩放/拖拽/框选/快捷键/右键
  editor.value = new GraphEditor(containerRef.value)
  editor.value.init(true)
  // 点击节点 → 弹出房间详情
  editor.value.onNodeClickInPreview((payload) => {
    if (payload.isRoom) {
      active.value = payload
      // 弹框用本地草稿：绑定/解绑后画布数据变了，但 active 是点击时的快照不会更新
      draftRoom.value = { ...(payload.room ?? createRoomInfo()) }
      bindNo.value = payload.room?.roomNo || ''
      // 其它节点已占用的房号不可再绑（排除自身）
      assignedRoomNumbers.value = editor.value?.getAssignedRoomNumbers(payload.id) ?? new Set()
    } else nonRoom.value = payload
  })

  const json = localStorage.getItem(PREVIEW_KEY)
  if (json) {
    try {
      editor.value.loadJSONForPreview(json)
    } catch (e) {
      console.error('预览数据加载失败', e)
    }
  }
  // 布局稳定后再取尺寸（居中/绘制背景可能在首帧后才完成）
  requestAnimationFrame(() => requestAnimationFrame(readMetrics))

  window.addEventListener('keydown', onKeydown)
  // 窗口尺寸变化后重新居中（视口变了，居中偏移也要跟着重算，且要保持整像素）
  window.addEventListener('resize', readMetrics)
})

// 内存泄漏防护：组件卸载时销毁画布
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', readMetrics)
  editor.value?.dispose()
  editor.value = undefined
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && dialogVisible.value) closeDialog()
}

// ---------------- 弹框数据 ----------------

/** 弹框房间信息草稿（与画布解耦：绑定/解绑后由 bindRoom/unbindRoom 同步） */
const draftRoom = ref<RoomInfo>(createRoomInfo())
/** Room No. 下拉选中的原始号（不存换行版） */
const bindNo = ref<string>('')
/** 全部可选房间号（mock），下拉展示为 "Room No.: xxx" */
const roomOptions: RoomOption[] = getAllRoomOptions()
/** 画布上其它节点已占用的房号（打开弹框时刷新），用于隐藏选项 + 提交兜底校验 */
const assignedRoomNumbers = ref<Set<string>>(new Set())
/** 下拉只展示未被绑定的房号（已绑定的直接不显示，而非置灰禁用） */
const availableRoomOptions = computed(() =>
  roomOptions.filter((opt) => !assignedRoomNumbers.value.has(opt.roomNumber))
)

const room = computed(() => draftRoom.value)

/** 空值统一显示占位符 */
const dash = (v?: string) => (v && v.trim() ? v : '—')
const yesNo = (b?: boolean) => (b ? 'Yes' : 'No')

/** 是否已绑定房间号：决定顶部橙色提示与底部按钮 */
const isAllocated = computed(() => !!room.value?.roomNo?.trim())

/** 位置：Camp/Zone/Building 组合 */
const location = computed(() => {
  const r = room.value
  if (!r) return '—'
  const parts = [r.camp, r.zone, r.building].filter((s) => s && s.trim())
  return parts.length ? parts.join('/') : '—'
})

interface DetailRow {
  label: string
  value: string
  /** 占满整行 */
  full?: boolean
}

/**
 * ROOM INFORMATION 区。
 * 注意：Room No. 不在此列——它是可交互的下拉框，在模板里单独渲染。
 * 统一用 ROOM DETAILS 那套字段（截图里未绑定态也是这套，只是值为空）。
 */
const roomRows = computed<DetailRow[]>(() => {
  const r = room.value
  if (!r) return []
  return [
    { label: 'Location', value: location.value },
    { label: 'Category', value: dash(r.category) },
    { label: 'Status', value: dash(r.status || 'Not Available') },
    { label: 'IP PHONE Ext.', value: dash(r.ipPhoneExt) },
    { label: 'Muster Point', value: dash(r.musterPoint) },
    { label: 'Safe Locker', value: dash(r.safeLocker) },
  ]
})

/** 第二个区：RESERVED FOR（截图里两态都是这套字段） */
const infoRows = computed<DetailRow[]>(() => {
  const r = room.value
  if (!r) return []
  return [
    { label: 'Company', value: dash(r.reserveCompany) },
    { label: 'Color', value: dash(r.reserveColor) },
    { label: 'For Rotator Only', value: yesNo(r.rotatorOnly) },
    { label: 'Rotation Pattern', value: dash(r.rotationPattern) },
    { label: 'Bind Pax', value: dash(r.bindPax), full: true },
    { label: 'Remark', value: dash(r.remark), full: true },
  ]
})

/** 下拉选中房间：只更新 bindNo，点 OK 时才真正绑定（避免误触） */
const onBindNoChange = (v: string) => {
  bindNo.value = v ?? ''
}

// ---------------- 弹框按钮 ----------------

const closeDialog = () => {
  active.value = null
}

/** 关闭非房间信息卡 */
const closeNonRoom = () => {
  nonRoom.value = null
}

/** 选房间号 + OK：把选中的 mock 房间绑定到节点（写显示文字 + 详情 + allocated） */
const confirmRoom = () => {
  const cur = active.value
  if (!cur) return
  const picked: RoomOption | undefined = roomOptions.find((r) => r.roomNumber === bindNo.value)
  if (!picked) {
    ElMessage.warning('请先选择房间号')
    return
  }
  if (assignedRoomNumbers.value.has(picked.roomNumber)) {
    ElMessage.error(`房间号 ${picked.roomNumber} 已被其它房间绑定，不能重复绑定`)
    return
  }
  editor.value?.bindRoom(cur.id, picked)
  // 绑定成功后关闭弹框，回到画布查看最新绑定的房间号与详情
  ElMessage.success(`已绑定房间 ${picked.roomNumber}`)
  closeDialog()
}

/** 解除绑定：清空房间号、详情与节点显示文字，弹框留在未绑定态可重新选号 */
const removeBinding = () => {
  const cur = active.value
  if (!cur) return
  editor.value?.unbindRoom(cur.id)
  // 解绑成功后关闭弹框，回到画布查看（下次点开按最新数据重建未绑定态草稿）
  ElMessage.success('已解除房间绑定')
  closeDialog()
}

// 关闭预览：优先关闭由脚本打开的新标签页，回到原编辑页；否则退回首页
const closePreview = () => {
  if (window.opener) window.close()
  else router.push('/')
}
</script>

<template>
  <div class="preview-page">
    <header class="preview-header">
      <span class="preview-title">
        预览（只读 · 不可选中 · 不可拖动节点 · 原比例 · 可滚动 · 不可缩放 · 不可旋转）——
        <b>点击房间节点查看详情</b>
      </span>
      <el-button type="primary" @click="closePreview">关闭预览</el-button>
    </header>
    <!-- 外层滚动容器：纯 CSS overflow 实现原生滚动（不用 Scroller 插件） -->
    <div ref="scrollRef" class="preview-scroll">
      <div ref="containerRef" class="preview-canvas"></div>
    </div>

    <!-- 左下角信息条：显示画布实际尺寸 / 视口尺寸 / 比例 -->
    <div class="preview-metrics" v-if="contentSize.width > 0">
      <span class="metric-item">
        实际尺寸 <b>{{ contentSize.width }} × {{ contentSize.height }}</b> px
      </span>
      <span class="metric-sep">|</span>
      <span class="metric-item">视口 {{ viewportSize.width }} × {{ viewportSize.height }} px</span>
      <span class="metric-sep">|</span>
      <span class="metric-item">比例 {{ scalePercent }}%</span>
    </div>

    <!-- 房间详情弹框：样式对齐业务截图（Confirm Room Allocation / ROOM DETAILS 两种状态） -->
    <Teleport to="body">
      <div v-if="dialogVisible" class="room-mask" @click.self="closeDialog">
        <div class="room-modal" role="dialog" aria-modal="true">
          <button class="room-close" type="button" aria-label="关闭" @click="closeDialog">×</button>

          <h2 class="room-title">ROOM DETAILS</h2>

          <section class="room-section">
            <h3 class="room-section-title">ROOM INFORMATION</h3>
            <p v-if="!isAllocated" class="room-hint">
              ** No room bind to this tab. Please select one room to bind.
            </p>
            <div class="room-grid">
              <!-- Room No.：下拉选择房间号，选项 "Room No.: xxx" -->
              <div class="room-item is-full">
                <span class="room-label">Room No.:</span>
                <el-select
                  :model-value="bindNo"
                  class="room-select"
                  popper-class="room-select-popper"
                  placeholder="Select"
                  clearable
                  :disabled="isAllocated"
                  @change="onBindNoChange"
                >
                  <el-option
                    v-for="opt in availableRoomOptions"
                    :key="opt.id"
                    :value="opt.roomNumber"
                    :label="`Room No.: ${opt.roomNumber}`"
                  />
                </el-select>
              </div>
              <div
                v-for="row in roomRows"
                :key="row.label"
                class="room-item"
              >
                <span class="room-label">{{ row.label }}:</span>
                <span class="room-value">{{ row.value }}</span>
              </div>
            </div>
          </section>

          <section class="room-section">
            <h3 class="room-section-title">RESERVED FOR</h3>
            <div class="room-grid">
              <div
                v-for="row in infoRows"
                :key="row.label"
                class="room-item"
                :class="{ 'is-full': row.full }"
              >
                <span class="room-label">{{ row.label }}:</span>
                <span class="room-value">{{ row.value }}</span>
              </div>
            </div>
          </section>

          <footer class="room-footer is-center">
            <button
              v-if="isAllocated"
              class="room-btn is-danger"
              type="button"
              @click="removeBinding"
            >
              Remove Binding
            </button>
            <button
              v-else
              class="room-btn is-primary"
              type="button"
              @click="confirmRoom"
            >
              OK
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <!-- 非房间节点（矩形 / 圆 / 文字）信息卡：点击事件开关开启时，预览页点它弹出 -->
    <Teleport to="body">
      <div v-if="nonRoomVisible" class="room-mask" @click.self="closeNonRoom">
        <div class="room-modal" role="dialog" aria-modal="true">
          <button class="room-close" type="button" aria-label="关闭" @click="closeNonRoom">×</button>
          <h2 class="room-title">节点信息</h2>
          <section class="room-section">
            <h3 class="room-section-title">NODE INFO</h3>
            <div class="room-grid">
              <div class="room-item">
                <span class="room-label">类型</span>
                <span class="room-value">{{ nonRoomType }}</span>
              </div>
              <div class="room-item is-full">
                <span class="room-label">文字内容</span>
                <span class="room-value">{{ nonRoom?.label || '—' }}</span>
              </div>
            </div>
          </section>
          <footer class="room-footer is-center">
            <button class="room-btn is-ghost" type="button" @click="closeNonRoom">关闭</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.preview-page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  background: #fff;
}
.preview-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
.preview-title {
  font-size: 14px;
  color: #606266;
}
.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* 内容四周留 20px 间距（画布在其中居中，不贴边） */
  padding: 20px;
  box-sizing: border-box;
  /* 预览态纯白底（与画布背景一致），不出现蓝灰 */
  background: #fff;
}
.preview-canvas {
  /* 画布尺寸由 X6 按内容实际尺寸铺开（resizeToContent），外层 .preview-scroll 负责滚动 */
  background: #fff;
  margin: 0 auto;
}

/* 左下角信息条：显示画布实际尺寸 / 视口尺寸 / 比例 */
.preview-metrics {
  position: absolute;
  left: 16px;
  bottom: 14px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  font-size: 12px;
  line-height: 1;
  color: #4b5563;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  user-select: none;
  pointer-events: none;
}
.metric-item b {
  color: #1f2937;
  font-weight: 600;
}
.metric-sep {
  color: #cbd5e1;
}

/* ---------------- 房间详情弹框 ---------------- */
.room-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  background: rgba(17, 24, 39, 0.45);
}
.room-modal {
  position: relative;
  box-sizing: border-box;
  width: 860px;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  padding: 30px 40px 32px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
}
.room-close {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
  color: #b6c2d1;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}
.room-close:hover {
  color: #64748b;
  background: #f1f5f9;
}
.room-title {
  margin: 0 0 26px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: #33415c;
}
.room-section + .room-section {
  margin-top: 34px;
}
.room-section-title {
  margin: 0 0 18px;
  padding-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #33415c;
  border-bottom: 1px solid #e9eef5;
}
.room-hint {
  margin: -4px 0 18px;
  font-size: 14px;
  line-height: 1.5;
  color: #f58220;
}
.room-select {
  width: 240px;
  max-width: 100%;
}
.room-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 44px;
  row-gap: 20px;
}
.room-item {
  display: grid;
  grid-template-columns: 118px 1fr;
  align-items: start;
  gap: 8px;
  min-width: 0;
}
.room-item.is-full {
  grid-column: 1 / -1;
}
.room-label {
  font-size: 15px;
  line-height: 1.5;
  color: #8b9cb3;
}
.room-value {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
  color: #111827;
  word-break: break-word;
  white-space: pre-wrap;
}
.room-footer {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 36px;
}
.room-footer.is-center {
  justify-content: center;
}
.room-btn {
  min-width: 128px;
  padding: 11px 26px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.room-btn.is-ghost {
  color: #64748b;
  background: #fff;
  border: 1px solid #dce3ec;
}
.room-btn.is-ghost:hover {
  color: #33415c;
  border-color: #b6c2d1;
}
.room-btn.is-primary {
  color: #fff;
  background: #f58220;
  border: 1px solid #f58220;
}
.room-btn.is-primary:hover {
  background: #e0740f;
  border-color: #e0740f;
}
.room-btn.is-danger {
  color: #fff;
  background: #c8102e;
  border: 1px solid #c8102e;
}
.room-btn.is-danger:hover {
  background: #ad0e28;
  border-color: #ad0e28;
}

@media (max-width: 720px) {
  .room-modal {
    padding: 24px 20px 26px;
  }
  .room-grid {
    grid-template-columns: 1fr;
  }
  .room-title {
    font-size: 22px;
  }
}
</style>

<!-- el-select 下拉 teleport 到 body，需非 scoped 样式抬高层级，盖住 .room-mask(z-index:3000) -->
<style>
.room-select-popper {
  z-index: 3100 !important;
}
</style>
