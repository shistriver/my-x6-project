<script setup lang="ts">
import { PALETTE_GROUPS, type PaletteItem } from '@/graph/shapes'

const emit = defineEmits<{
  dragStart: [item: PaletteItem, e: MouseEvent]
}>()

const handleMouseDown = (item: PaletteItem, e: MouseEvent) => {
  emit('dragStart', item, e)
}
</script>

<template>
  <div class="palette">
    <div class="palette-header">节点库</div>

    <div v-for="group in PALETTE_GROUPS" :key="group.title" class="group">
      <div class="group-title">{{ group.title }}</div>
      <div class="grid">
        <div
          v-for="item in group.items"
          :key="item.key"
          class="item"
          :title="item.label"
          @mousedown="handleMouseDown(item, $event)"
        >
          <span class="thumb" :class="`thumb--${item.preview}`">
            <span v-if="item.preview === 'text'" class="thumb-text">T</span>
            <span v-else-if="item.preview === 'room-number'" class="thumb-room-number"></span>
          </span>          <!-- <span class="item-label">{{ item.label }}</span> -->
        </div>
      </div>
    </div>

    <p class="tip">按住图标拖入画布即可新增节点</p>
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  overflow-y: auto;
  flex: 1 1 0;
  min-height: 0;
}
.palette-header {
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
}
.group-title {
  margin-bottom: 8px;
  font-size: 12px;
  color: #909399;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  
  cursor: grab;
  user-select: none;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}
.item:active {
  cursor: grabbing;
}
.item-label {
  font-size: 12px;
  color: #606266;
}

/* 缩略图：纯 CSS 画，不依赖图片资源 */
.thumb {
  display: block;
  width: 60px;
  height: 60px;
  box-sizing: border-box;
}
.thumb--room {
  background: #fff7e6;
  border: 2px solid #d48806;
  border-radius: 3px;
  box-shadow: inset 0 8px 0 -6px #d48806;
}
.thumb--rect {
  background: #ecf5ff;
  border: 1px solid #409eff;
  border-radius: 3px;
}
.thumb--circle {
  width: 60px;
  height: 60px;
  background: #f0f9eb;
  border: 1px solid #67c23a;
  border-radius: 50%;
}
.thumb--text {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #c0c4cc;
  border-radius: 3px;
}
/* 编号房间：竖长白底 + 橙色粗边框 + 居中加粗编号 */
.thumb--room-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  margin: 0 auto;
  background: #fff;
  border: 2px solid #f07800;
  border-top-width: 8px;
  border-radius: 0px;
}
.thumb-room-number {
  font-size: 13px;
  font-weight: 700;
  color: #1f2329;
}
/* L 形墙：左臂 + 底臂拼直角 */
.thumb--wall-l {
  width: 60px;
  height: 60px;
  margin: 0 auto;
  background: #fff;
  border-left: 6px solid #595959;
  border-bottom: 6px solid #595959;
}
/* 直线墙：居中一根深色横条（线宽与实际墙厚 6px 一致） */
.thumb--wall-line {
  background: linear-gradient(#595959, #595959) center / 100% 6px no-repeat;
}
.thumb-text {
  font-size: 14px;
  font-weight: 700;
  color: #909399;
}

.tip {
  margin: 0;
  font-size: 12px;
  color: #a8abb2;
  line-height: 1.6;
}
</style>
