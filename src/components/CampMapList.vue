<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  loadCampMaps,
  createCampMap,
  updateCampMap,
  deleteCampMap,
  resolveLocationLabels,
  LOCATION_OPTIONS,
  type CampMap,
} from '@/graph/campMaps'

// activeId 由父组件（HomeView）统一管理，保证「高亮」与「当前画布所属地图」一致
const props = defineProps<{ activeId?: string | null }>()
// 切换/加载画布：选中某地图、新建后、删除后都会向上抛出目标 id（null = 清空画布）
const emit = defineEmits<{ switchTo: [id: string | null] }>()

const maps = ref<CampMap[]>([])
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const form = ref<{ mapName: string; location: string[][] }>({ mapName: '', location: [] })

const refresh = () => {
  maps.value = loadCampMaps()
}

onMounted(refresh)

const openAdd = () => {
  editingId.value = null
  form.value = { mapName: '', location: [] }
  dialogVisible.value = true
}

const openEdit = (m: CampMap) => {
  editingId.value = m.id
  // 深拷贝 location 的各级数组，避免编辑中途影响原数据
  form.value = { mapName: m.mapName, location: m.location.map((p) => [...p]) }
  dialogVisible.value = true
}

// 名称去重（忽略大小写与首尾空格）；editingId 非空时排除自身
const isDuplicateName = (name: string, exceptId: string | null): boolean => {
  const n = name.trim().toLowerCase()
  return loadCampMaps().some((m) => m.id !== exceptId && m.mapName.trim().toLowerCase() === n)
}

const save = () => {
  const name = form.value.mapName.trim()
  if (!name) {
    ElMessage.warning('请输入地图名称')
    return
  }
  if (isDuplicateName(name, editingId.value)) {
    ElMessage.warning('地图名称已存在，请更换')
    return
  }
  if (editingId.value) {
    // 修改：仅更新元数据，不影响画布内容
    updateCampMap(editingId.value, name, form.value.location)
    dialogVisible.value = false
    refresh()
    return
  }
  // 新增：创建记录（content 初始为空白），随后切到该空白地图
  const created = createCampMap(name, form.value.location)
  dialogVisible.value = false
  refresh()
  emit('switchTo', created.id)
}

const remove = async (m: CampMap) => {
  try {
    await ElMessageBox.confirm(`确定删除地图「${m.mapName}」？删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }
  deleteCampMap(m.id)
  refresh()
  // 删除后自动切到剩余第一张地图（或清空画布）
  emit('switchTo', maps.value[0]?.id ?? null)
  ElMessage.success('已删除')
}
</script>

<template>
  <div class="camp-maps">
    <div class="cm-header">
      <span class="cm-title">营地地图</span>
      <el-button size="small" type="primary" @click="openAdd">新增</el-button>
    </div>

    <div class="cm-list">
      <div v-if="maps.length === 0" class="cm-empty">暂无地图，点击「新增」创建</div>

      <div
        v-for="m in maps"
        :key="m.id"
        class="cm-item"
        :class="{ 'is-active': m.id === activeId }"
        @click="emit('switchTo', m.id)"
      >
        <div class="cm-name" :title="m.mapName">{{ m.mapName }}</div>

        <div class="cm-loc">
          <el-tag
            v-for="(l, i) in resolveLocationLabels(m.location)"
            :key="i"
            size="small"
            type="info"
            class="cm-tag"
            >{{ l }}</el-tag
          >
          <span v-if="m.location.length === 0" class="cm-loc-empty">未设置位置</span>
        </div>

        <div class="cm-actions" @click.stop>
          <el-button size="small" link type="primary" @click="openEdit(m)">修改</el-button>
          <el-button size="small" link type="danger" @click="remove(m)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 新增 / 修改 弹框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '修改营地地图' : '新增营地地图'"
      width="440px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="地图名称" required>
          <el-input
            v-model="form.mapName"
            placeholder="请输入地图名称"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="位置">
          <el-cascader
            v-model="form.location"
            :options="LOCATION_OPTIONS"
            :props="{ multiple: true, expandTrigger: 'hover' }"
            clearable
            filterable
            placeholder="请选择位置（可多选）"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.camp-maps {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border-top: 1px solid #e4e7ed;
}
.cm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  flex-shrink: 0;
}
.cm-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
}
.cm-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cm-empty {
  padding: 16px 4px;
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
}
.cm-item {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 8px 10px;
  cursor: pointer;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cm-item:hover {
  border-color: #c6e2ff;
}
.cm-item.is-active {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff inset;
}
.cm-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2329;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cm-loc {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 6px 0;
}
.cm-tag {
  max-width: 100%;
}
.cm-loc-empty {
  font-size: 11px;
  color: #c0c4cc;
}
.cm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
</style>
