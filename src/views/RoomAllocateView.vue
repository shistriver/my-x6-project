<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  GraphEditor,
  type RoomAllocateClickPayload,
} from '@/graph/GraphEditor'
import {
  isRoomAllocatable,
  getAllocationRoom,
  saveAllocation,
  type AllocationRoom,
} from '@/graph/allocationData'

const router = useRouter()
const containerRef = ref<HTMLDivElement>()
const scrollRef = ref<HTMLDivElement>()
const editor = ref<GraphEditor>()

// 画布数据由编辑页在跳转前写入 localStorage（键与 HomeView 约定一致）
const PREVIEW_KEY = 'camp-map-preview'

/** 当前弹框对应的房间（null = 未打开） */
const active = ref<RoomAllocateClickPayload | null>(null)
const dialogVisible = computed(() => active.value !== null)

/** 弹框房间数据：显式命中用 mock，其余 hash 兜底生成 */
const room = computed<AllocationRoom | null>(() => {
  const p = active.value
  if (!p) return null
  return getAllocationRoom(p.label || p.room.roomNo, p.id)
})

const dash = (v?: string) => (v && v.trim() ? v : '—')
const yesNo = (b?: boolean) => (b ? 'Yes' : 'No')

interface DetailRow {
  label: string
  value: string
  /** Room No. 用橙色高亮 */
  emphasis?: boolean
}

/** ROOM INFORMATION 区（对齐图2字段与排布） */
const roomRows = computed<DetailRow[]>(() => {
  const r = room.value
  if (!r) return []
  return [
    { label: 'Room No.', value: dash(r.roomNo), emphasis: true },
    { label: 'CAMP', value: dash(r.camp) },
    { label: 'Zone', value: dash(r.zone) },
    { label: 'Building', value: dash(r.building) },
    { label: 'Muster Point', value: dash(r.musterPoint) },
    { label: 'Check In', value: dash(r.checkIn) },
    { label: 'Check Out', value: dash(r.checkOut) },
    { label: 'Roator Only', value: yesNo(r.rotatorOnly) },
  ]
})

/** PAX INFORMATION 区 */
const paxRows = computed<DetailRow[]>(() => {
  const r = room.value
  if (!r) return []
  return [
    { label: 'Full Name', value: dash(r.fullName) },
    { label: 'Position', value: dash(r.position) },
    { label: 'Department', value: dash(r.department) },
    { label: 'Company', value: dash(r.company) },
  ]
})

/** 左下角信息条 */
const contentSize = ref({ width: 0, height: 0 })
const viewportSize = ref({ width: 0, height: 0 })
const scaleRatio = ref(1)
const scalePercent = computed(() => Math.round(scaleRatio.value * 100))

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

/** 画布整像素居中，避免 1px 描边发虚 */
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
  editor.value = new GraphEditor(containerRef.value)
  editor.value.init(true)

  const json = localStorage.getItem(PREVIEW_KEY)
  if (json) {
    try {
      editor.value.loadJSONForPreview(json)
      // 加载后一次性给所有房间节点打「可分配/不可分配」状态色与光标
      editor.value.markAllocationStates(isRoomAllocatable)
    } catch (e) {
      console.error('房间分配页数据加载失败', e)
    }
  }
  // 订阅可分配房间点击 → 弹框
  editor.value.onRoomClickForAllocation(isRoomAllocatable, (payload) => {
    active.value = payload
  })

  requestAnimationFrame(() => requestAnimationFrame(readMetrics))
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', readMetrics)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', readMetrics)
  editor.value?.dispose()
  editor.value = undefined
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && dialogVisible.value) closeDialog()
}

const closeDialog = () => {
  active.value = null
}

/** 确认分配：写分配记录（供 reception 同步）→ 关闭弹框 → 跳转 reception */
const confirmRoom = () => {
  const p = active.value
  const r = room.value
  if (!p || !r) return
  saveAllocation(p.id, r)
  ElMessage.success(`已确认分配房间 ${r.roomNo}`)
  closeDialog()
  router.push('/reception')
}

/** 关闭页面：优先关闭脚本打开的新标签页，否则退回首页 */
const closePage = () => {
  if (window.opener) window.close()
  else router.push('/')
}
</script>

<template>
  <div class="alloc-page">
    <header class="alloc-header">
      <span class="alloc-title">
        房间分配（只读 · 可分配房间黄色高亮可点 · 不可分配房间灰色不可点）——
        <b>点击黄色房间确认分配</b>
      </span>
      <el-button type="primary" @click="closePage">关闭</el-button>
    </header>

    <div ref="scrollRef" class="alloc-scroll">
      <div ref="containerRef" class="alloc-canvas"></div>
    </div>

    <div class="alloc-metrics" v-if="contentSize.width > 0">
      <span class="metric-item">实际尺寸 <b>{{ contentSize.width }} × {{ contentSize.height }}</b> px</span>
      <span class="metric-sep">|</span>
      <span class="metric-item">视口 {{ viewportSize.width }} × {{ viewportSize.height }} px</span>
      <span class="metric-sep">|</span>
      <span class="metric-item">比例 {{ scalePercent }}%</span>
    </div>

    <!-- 分配确认弹框（对齐图2：Confirm Room Allocation） -->
    <Teleport to="body">
      <div v-if="dialogVisible" class="alloc-mask" @click.self="closeDialog">
        <div class="alloc-modal" role="dialog" aria-modal="true">
          <button class="alloc-close" type="button" aria-label="关闭" @click="closeDialog">×</button>

          <h2 class="alloc-title-modal">Confirm Room Allocation</h2>

          <section class="alloc-section">
            <h3 class="alloc-section-title">ROOM INFORMATION</h3>
            <div class="alloc-grid">
              <div v-for="row in roomRows" :key="row.label" class="alloc-item">
                <span class="alloc-label">{{ row.label }}:</span>
                <span class="alloc-value" :class="{ 'is-emphasis': row.emphasis }">{{ row.value }}</span>
              </div>
            </div>
          </section>

          <section class="alloc-section">
            <h3 class="alloc-section-title">PAX INFORMATION</h3>
            <div class="alloc-grid">
              <div v-for="row in paxRows" :key="row.label" class="alloc-item">
                <span class="alloc-label">{{ row.label }}:</span>
                <span class="alloc-value">{{ row.value }}</span>
              </div>
            </div>
          </section>

          <footer class="alloc-footer">
            <button class="alloc-btn is-ghost" type="button" @click="closeDialog">Cancel</button>
            <button class="alloc-btn is-primary" type="button" @click="confirmRoom">Confirm Room</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.alloc-page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  background: #fff;
}
.alloc-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
.alloc-title {
  font-size: 14px;
  color: #606266;
}
.alloc-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
  box-sizing: border-box;
  background: #fff;
}
.alloc-canvas {
  background: #fff;
  margin: 0 auto;
}
.alloc-metrics {
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

/* ---------------- 分配确认弹框 ---------------- */
.alloc-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  background: rgba(17, 24, 39, 0.45);
}
.alloc-modal {
  position: relative;
  box-sizing: border-box;
  width: 720px;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  padding: 30px 40px 32px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
}
.alloc-close {
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
.alloc-close:hover {
  color: #64748b;
  background: #f1f5f9;
}
.alloc-title-modal {
  margin: 0 0 26px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: #33415c;
}
.alloc-section + .alloc-section {
  margin-top: 34px;
}
.alloc-section-title {
  margin: 0 0 18px;
  padding-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #33415c;
  border-bottom: 1px solid #e9eef5;
}
.alloc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 44px;
  row-gap: 20px;
}
.alloc-item {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: start;
  gap: 8px;
  min-width: 0;
}
.alloc-label {
  font-size: 15px;
  line-height: 1.5;
  color: #8b9cb3;
}
.alloc-value {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
  color: #111827;
  word-break: break-word;
}
.alloc-value.is-emphasis {
  color: #f58220;
  font-weight: 700;
}
.alloc-footer {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  margin-top: 36px;
}
.alloc-btn {
  min-width: 128px;
  padding: 11px 26px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.alloc-btn.is-ghost {
  color: #64748b;
  background: #fff;
  border: 1px solid #dce3ec;
}
.alloc-btn.is-ghost:hover {
  color: #33415c;
  border-color: #b6c2d1;
}
.alloc-btn.is-primary {
  color: #fff;
  background: #f58220;
  border: 1px solid #f58220;
}
.alloc-btn.is-primary:hover {
  background: #e0740f;
  border-color: #e0740f;
}

@media (max-width: 720px) {
  .alloc-modal {
    padding: 24px 20px 26px;
  }
  .alloc-grid {
    grid-template-columns: 1fr;
  }
  .alloc-title-modal {
    font-size: 22px;
  }
}
</style>
