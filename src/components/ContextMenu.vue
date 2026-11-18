<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { ContextMenuItem } from '@/graph/GraphEditor'

const props = defineProps<{
  visible: boolean
  /** 触发位置（视口坐标） */
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  (e: 'select', key: string): void
  (e: 'close'): void
}>()

const menuRef = ref<HTMLElement>()
// 先放到屏幕外，测量出真实尺寸后再定位，避免第一帧闪现在 (0,0)
const pos = ref({ left: '-9999px', top: '-9999px' })

/** 计算最终位置，超出视口右/下边缘时翻转 */
const adjustPosition = async () => {
  await nextTick()
  const el = menuRef.value
  if (!el) return
  const { offsetWidth: w, offsetHeight: h } = el
  const left = props.x + w > window.innerWidth ? Math.max(0, props.x - w) : props.x
  const top = props.y + h > window.innerHeight ? Math.max(0, props.y - h) : props.y
  pos.value = { left: `${left}px`, top: `${top}px` }
}

watch(
  () => [props.visible, props.x, props.y] as const,
  ([visible]) => {
    if (visible) adjustPosition()
  },
  { flush: 'post' },
)

const onItemClick = (item: ContextMenuItem) => {
  if (item.disabled) return
  emit('select', item.key)
}

/** 点击菜单外部关闭 */
const onDocumentMouseDown = (e: MouseEvent) => {
  if (!props.visible) return
  const el = menuRef.value
  if (el && !el.contains(e.target as Node)) emit('close')
}

/** Esc 关闭 */
const onKeydown = (e: KeyboardEvent) => {
  if (props.visible && e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown, true)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="visible"
      ref="menuRef"
      class="ctx-menu"
      :style="{ left: pos.left, top: pos.top }"
      @contextmenu.prevent
    >
      <template v-for="item in items" :key="item.key">
        <div v-if="item.divided" class="ctx-menu__divider" />
        <div
          class="ctx-menu__item"
          :class="{ 'is-disabled': item.disabled, 'is-danger': item.danger }"
          @click="onItemClick(item)"
        >
          <span>{{ item.label }}</span>
          <span v-if="item.shortcut" class="ctx-menu__shortcut">{{ item.shortcut }}</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 3000;
  min-width: 148px;
  padding: 5px 0;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  color: #303133;
  user-select: none;
}
.ctx-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 14px;
  cursor: pointer;
  white-space: nowrap;
}
.ctx-menu__item:hover {
  background: #f2f6fc;
  color: #409eff;
}
.ctx-menu__item.is-disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}
.ctx-menu__item.is-disabled:hover {
  background: transparent;
  color: #c0c4cc;
}
.ctx-menu__item.is-danger {
  color: #f56c6c;
}
.ctx-menu__item.is-danger:hover {
  background: #fef0f0;
  color: #f56c6c;
}
.ctx-menu__shortcut {
  font-size: 12px;
  color: #a8abb2;
}
.ctx-menu__divider {
  height: 1px;
  margin: 5px 0;
  background: #ebeef5;
}
</style>
