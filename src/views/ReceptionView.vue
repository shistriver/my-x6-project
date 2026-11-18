<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { GraphEditor, type RoomHoverPayload } from '@/graph/GraphEditor'
import { getRoomGuestInfo, isRoomEmpty, type GuestPerson, type RoomGuestInfo } from '@/graph/receptionData'

const router = useRouter()
const containerRef = ref<HTMLDivElement>()
const scrollRef = ref<HTMLDivElement>()
const editor = ref<GraphEditor>()

// 预览数据由编辑页在跳转前写入 localStorage（键与 HomeView/PreviewView 约定一致）
const PREVIEW_KEY = 'camp-map-preview'

/** 当前 hover 的房间节点（null = 无 hover，卡片隐藏） */
const hovered = ref<RoomHoverPayload | null>(null)

/** hover 卡片的房间客人数据（mock，按房号/节点 id 命中场景） */
const guestInfo = computed<RoomGuestInfo | null>(() => {
  const h = hovered.value
  if (!h) return null
  return getRoomGuestInfo(h.roomNo, h.id, h.category)
})

/** 是否无人房（四类都空 → 显示房间分类气泡） */
const empty = computed(() => (guestInfo.value ? isRoomEmpty(guestInfo.value) : false))

/** 卡片 DOM 引用 + 实测尺寸（用于把卡片精确放到节点正上方并处理边界） */
const cardRef = ref<HTMLElement | null>(null)
const cardSize = ref({ width: 0, height: 0 })
let cardObserver: ResizeObserver | undefined

// 卡片 v-if 随 hover 销毁重建，每次都要重新测量并重新 observe（旧 observer 观察的是已卸载元素，读到 0）
watch(
  hovered,
  () => {
    void nextTick(() => {
      const el = cardRef.value
      cardObserver?.disconnect()
      cardObserver = undefined
      if (!el) return
      const measure = () => {
        const r = el.getBoundingClientRect()
        cardSize.value = { width: r.width, height: r.height }
      }
      measure()
      if (typeof ResizeObserver !== 'undefined') {
        cardObserver = new ResizeObserver(measure)
        cardObserver.observe(el)
      }
    })
  },
  { flush: 'post' },
)

const GAP = 10 // 卡片与节点的间距
const MARGIN = 8 // 卡片距视口边缘的最小留白

/**
 * 卡片定位：水平居中于节点、贴在节点正上方；越界时翻到节点下方，最后钳制在视口内。
 * 依赖 hovered / cardSize / viewportTick 三者，任一变化都重算。
 */
const cardStyle = computed(() => {
  const h = hovered.value
  if (!h) return {}
  void viewportTick.value
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cw = cardSize.value.width
  const ch = cardSize.value.height

  // 水平：卡片中心对齐节点中心
  let left = h.rect.left + h.rect.width / 2 - cw / 2
  left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - cw - MARGIN))

  // 垂直：优先节点正上方；上方空间不足则翻到节点下方
  let top = h.rect.top - GAP - ch
  if (top < MARGIN) top = h.rect.bottom + GAP
  top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - ch - MARGIN))

  return { left: `${left}px`, top: `${top}px` }
})

/** 视口尺寸变化后强制重算定位（卡片开着时窗口缩放也要跟着钳制） */
const viewportTick = ref(0)

/** 左下角信息条：内容尺寸 / 视口尺寸 / 缩放比例 */
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
    viewportSize.value = { width: scrollRef.value.clientWidth, height: scrollRef.value.clientHeight }
  }
}

/** 画布左上角落在整像素上，避免 1px 描边被摊成半透明虚线 */
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
  el.style.marginLeft = `${Math.max(0, Math.round((availW - el.offsetWidth) / 2))}px`
  el.style.marginTop = `${Math.max(0, Math.round((availH - el.offsetHeight) / 2))}px`
}

onMounted(() => {
  if (!containerRef.value) return
  // 只读预览模式：禁平移/缩放/拖拽/框选/快捷键/右键
  editor.value = new GraphEditor(containerRef.value)
  editor.value.init(true)
  // 只订阅房间节点 hover，回抛数据驱动卡片（无点击弹框）
  editor.value.onRoomHover((payload) => {
    hovered.value = payload
  })

  const json = localStorage.getItem(PREVIEW_KEY)
  if (json) {
    try {
      editor.value.loadJSONForPreview(json)
    } catch (e) {
      console.error('reception 数据加载失败', e)
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(readMetrics))
  window.addEventListener('resize', onWindowResize)
})

/** resize 同时刷新画布尺寸与卡片定位 */
const onWindowResize = () => {
  readMetrics()
  viewportTick.value += 1
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  cardObserver?.disconnect()
  editor.value?.dispose()
  editor.value = undefined
})

const closeReception = () => {
  if (window.opener) window.close()
  else router.push('/')
}

/** 卡片里逐人渲染用的稳定 key */
const personKey = (p: GuestPerson, i: number) => `${p.name}-${i}`
</script>

<template>
  <div class="reception-page">
    <header class="reception-header">
      <span class="reception-title">
        前台接待视图（只读）——
        <b>鼠标悬停房间节点查看客人信息</b>
      </span>
      <el-button type="primary" @click="closeReception">关闭</el-button>
    </header>

    <div ref="scrollRef" class="reception-scroll">
      <div ref="containerRef" class="reception-canvas"></div>
    </div>

    <div class="reception-metrics" v-if="contentSize.width > 0">
      <span class="metric-item">实际尺寸 <b>{{ contentSize.width }} × {{ contentSize.height }}</b> px</span>
      <span class="metric-sep">|</span>
      <span class="metric-item">视口 {{ viewportSize.width }} × {{ viewportSize.height }} px</span>
      <span class="metric-sep">|</span>
      <span class="metric-item">比例 {{ scalePercent }}%</span>
    </div>

    <!-- hover 卡片：跟随鼠标，纯展示、无交互 -->
    <Teleport to="body">
      <div v-if="guestInfo" ref="cardRef" class="guest-card" :style="cardStyle">
        <!-- 无人房：显示房间分类 -->
        <div v-if="empty" class="guest-category">{{ guestInfo.category || '—' }}</div>

        <!-- 有人房：2×2 网格（第一行 Previous/Next，第二行 Current/Assigned），无人分区不渲染 -->
        <div v-else class="guest-grid">
          <template
            v-for="group in [
              { kind: 'previous', label: 'Previous Guest:', people: guestInfo.previous },
              { kind: 'next', label: 'Next Guest:', people: guestInfo.next },
              { kind: 'current', label: 'Current Guest:', people: guestInfo.current },
              { kind: 'assigned', label: 'Assigned To:', people: guestInfo.assigned },
            ]"
            :key="group.kind"
          >
            <section v-if="group.people.length" class="guest-section" :class="`is-${group.kind}`">
              <h3 class="guest-section-title">{{ group.label }}</h3>
              <div class="guest-people">
                <div v-for="(p, i) in group.people" :key="personKey(p, i)" class="guest-person">
                  <div class="guest-name">
                    {{ p.name }}
                    <span v-if="p.status" class="guest-status">{{ p.status }}</span>
                  </div>
                  <div class="guest-meta"><span>Company:</span> {{ p.company }}</div>
                  <div class="guest-meta"><span>Department:</span> {{ p.department }}</div>
                </div>
              </div>
            </section>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.reception-page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  background: #fff;
}
.reception-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
.reception-title {
  font-size: 14px;
  color: #606266;
}
.reception-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
  box-sizing: border-box;
  background: #fff;
}
.reception-canvas {
  background: #fff;
  margin: 0 auto;
}
.reception-metrics {
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
</style>

<!-- hover 卡片 teleport 到 body，需非 scoped 样式 -->
<style>
.guest-card {
  position: fixed;
  z-index: 4000;
  width: max-content;
  max-width: 820px;
  padding: 6px;
  pointer-events: none;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06);
}
.guest-category {
  padding: 10px 18px;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
}
/* 2×2 网格：第一行 Previous/Next，第二行 Current/Assigned */
.guest-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.guest-section {
  padding: 12px 16px;
  border-radius: 7px;
  min-width: 0;
}
/* 奇数个分区时，最后一个跨满整行，去掉末行右侧的空白 */
.guest-section:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}
/* 只保留配色；无人分区由 v-if 不渲染，剩余分区按 Previous/Next/Current/Assigned 顺序自动填入 2 列网格（缺席不占位） */
.guest-section.is-previous {
  background: #eaf2ff;
}
.guest-section.is-next {
  background: #fff6e8;
}
.guest-section.is-current {
  background: #ffeef0;
}
.guest-section.is-assigned {
  background: #eef7ed;
}
.guest-section-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: #111827;
}
.guest-people {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 26px;
}
.guest-person {
  min-width: 0;
}
.guest-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}
.is-previous .guest-name {
  color: #8fa8c8;
}
.is-next .guest-name {
  color: #7a6242;
}
.is-current .guest-name {
  color: #f58220;
}
.is-assigned .guest-name {
  color: #8aa08a;
}
.guest-status {
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: #fff;
  background: #f58220;
  border-radius: 4px;
}
.guest-meta {
  font-size: 14px;
  line-height: 1.5;
  color: #334155;
  white-space: nowrap;
}
.guest-meta span {
  color: #8b9cb3;
}
</style>
