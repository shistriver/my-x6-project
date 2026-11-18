<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type {
  NodeSnapshot,
  NodePropsPatch,
  StrokeStyle,
  MultiStyleState,
  MultiRoomStyleState,
} from '@/graph/GraphEditor'
import { COMPANY_COLORS } from '@/graph/companyColors'
import {
  getCampTree,
  getRoomsByBuilding,
  findCampPathByBuildingId,
  findBuildingByRoomNumber,
  formatRoomNoForDisplay,
  isBuilding,
  type RoomOption,
} from '@/graph/campData'

const props = defineProps<{
  snapshot: NodeSnapshot | null
  multiStyle?: MultiStyleState | null
  multiRoom?: MultiRoomStyleState | null
  /** 画布上已被其它节点占用的房间号（roomNumber 下拉据此禁用） */
  assignedRoomNumbers?: string[]
}>()
const emit = defineEmits<{
  apply: [patch: NodePropsPatch]
  'apply-multi': [patch: NodePropsPatch]
  'apply-room': [patch: NodePropsPatch]
}>()

const form = ref({
  label: '',
  areaText: '',
  areaVisible: true,
  areaFontSize: 10,
  areaFontFill: '#6B7C8E',
  topbarHeight: 8,
  topbarColor: 'rgba(0, 0, 0, 0)',
  roomOwnership: null as number | null,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  wallThickness: 4,
  fill: 'rgba(0, 0, 0, 0)',
  stroke: 'rgba(0, 0, 0, 0)',
  strokeWidth: 1,
  strokeStyle: 'solid' as StrokeStyle,
  fontSize: 14,
  fontFill: '#1F2329',
  fontBold: false,
  cornerRadius: 0,
  eventsClick: false,
  eventsHover: false,
})

// 面板顶部标签：自定义图形显示友好名称，其余显示 shape
const SHAPE_LABELS: Record<string, string> = {
  'room-number': '编号房间',
  'wall-l': 'L形墙',
  'wall-line': '直线墙',
}

// 选区变化 / 画布上拖动节点都会刷新快照，同步回表单
watch(
  () => props.snapshot,
  (s) => {
    if (!s) return
    form.value = {
      label: s.label,
      areaText: s.areaText,
      areaVisible: s.areaVisible,
      areaFontSize: s.areaFontSize,
      areaFontFill: s.areaFontFill,
      topbarHeight: s.topbarHeight,
      topbarColor: s.topbarColor,
      roomOwnership: s.roomOwnership,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      wallThickness: s.wallThickness,
      fill: s.fill,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth,
      strokeStyle: s.strokeStyle,
      fontSize: s.fontSize,
      fontFill: s.fontFill,
      fontBold: s.fontBold,
      cornerRadius: s.cornerRadius,
      eventsClick: s.events.click,
      eventsHover: s.events.hover,
    }
  },
  { immediate: true, deep: true },
)

// 每次改动立即下发；用 change 而非 input，避免逐字符写入撤销栈
const apply = (patch: NodePropsPatch) => emit('apply', patch)

// ---------------- 房间分配：位置级联（营地→区域→楼栋）→ roomNumber ----------------
const campTree = getCampTree()

/** el-cascader 选项结构（只到楼栋这一级，叶子节点） */
interface LocationOption {
  value: number
  label: string
  children?: LocationOption[]
}
/** 由营地树生成级联选项；楼栋判定统一走 isBuilding（level 不规整） */
const locationOptions: LocationOption[] = campTree.map((camp) => ({
  value: camp.id,
  label: camp.name,
  children: (camp.children ?? []).map((zone) => ({
    value: zone.id,
    label: zone.name,
    children: (zone.children ?? []).filter(isBuilding).map((b) => ({
      value: b.id,
      label: b.name,
    })),
  })),
}))

/** 级联选中路径：[营地 id, 区域 id, 楼栋 id]；选到楼栋才算有效 */
const locationPath = ref<number[]>([])
/** 当前楼栋 id（房间号下拉据此取数 / 启用） */
const buildingId = computed<number | null>(() => locationPath.value[2] ?? null)
const roomOptions = computed<RoomOption[]>(() =>
  buildingId.value == null ? [] : getRoomsByBuilding(buildingId.value),
)

/** 房间号是否已被其它节点占用（自身当前值不算占用，允许重选/改选） */
const isRoomTaken = (roomNumber: string): boolean => {
  const self = props.snapshot?.room?.roomNo?.trim()
  if (self === roomNumber) return false
  return (props.assignedRoomNumbers ?? []).includes(roomNumber)
}

// 快照回填级联路径：优先用 locationId 反推；旧数据无 locationId 时用 roomNo 兜底
watch(
  () => props.snapshot,
  (s) => {
    if (!s || s.shape !== 'room-number') {
      locationPath.value = []
      return
    }
    const r = s.room
    let bid = r.locationId
    if (bid == null && r.roomNo) bid = findBuildingByRoomNumber(r.roomNo)?.locationId ?? null
    const path = bid != null ? findCampPathByBuildingId(bid) : null
    locationPath.value = path ? [path.camp.id, path.zone.id, path.building.id] : []
  },
  { immediate: true },
)

/** 级联变化：只有选到楼栋（完整路径）才更新，未选完或清空时归零 */
const onLocationChange = (v: unknown) => {
  locationPath.value = Array.isArray(v) && v.length === 3 ? (v as number[]) : []
}

/** 选中房间号：一次性写入显示文字（换行版）+ 房间业务信息（原始号/归属/来源字段） */
const onRoomNumberPick = (roomNumber: string) => {
  const s = props.snapshot
  if (!s) return
  const room = roomOptions.value.find((r) => r.roomNumber === roomNumber)
  if (!room) return
  apply({
    label: formatRoomNoForDisplay(room.roomNumber),
    room: {
      roomNo: room.roomNumber,
      roomId: room.id,
      locationId: room.locationId,
      zoneId: room.zoneId,
      campId: room.campId,
      camp: room.camp,
      zone: room.zone,
      building: room.building,
      allocated: true,
      category: room.categoryName,
      status: room.roomStatus === 1 ? 'Available' : 'Not Available',
      ipPhoneExt: room.ipPhoneExt,
      musterPoint: room.musterPointName ?? '',
      rotationPattern: room.rotationType ?? '',
      rotatorOnly: room.rotatorOnly === 1,
      company: room.company,
      reserveCompany: room.roomOwnershipName ?? '',
      reserveColor: room.color ?? '',
      remark: room.roomRemark ?? '',
    },
  })
}

/** 清除房间分配：清空显示文字与关联 id，allocated 归 false */
const onClearRoom = () => {
  apply({
    label: '',
    room: {
      roomNo: '',
      roomId: null,
      locationId: null,
      zoneId: null,
      campId: null,
      allocated: false,
    },
  })
}

// ---------------- 批量样式（多选覆盖显示） ----------------
const multiForm = ref({
  fontSize: null as number | null,
  fontFill: null as string | null,
  fill: null as string | null,
  stroke: null as string | null,
  strokeWidth: null as number | null,
  strokeStyle: 'solid' as StrokeStyle,
})

// 多选状态 → 回填批量表单：混合态（undefined）显示空值占位；
// 含文字节点时背景/描边置空并禁用（透明本体无意义）
watch(
  () => props.multiStyle,
  (m) => {
    if (!m) return
    multiForm.value = {
      fontSize: m.fontSize ?? null,
      fontFill: m.fontFill ?? null,
      fill: m.hasTextNode ? null : (m.fill ?? null),
      stroke: m.hasTextNode ? null : (m.stroke ?? null),
      strokeWidth: m.hasTextNode ? null : (m.strokeWidth ?? null),
      strokeStyle: m.strokeStyle ?? 'solid',
    }
  },
  { immediate: true, deep: true },
)

// 背景/描边是否可编辑：选区含文字节点时禁用
const canBody = computed(() => !!props.multiStyle && !props.multiStyle.hasTextNode)

const applyMulti = (patch: NodePropsPatch) => emit('apply-multi', patch)

// 批量：数字框受控，仅在给出合法数字时下发（避免混合态/清空误写 null）
const onMultiNumber = (key: 'fontSize' | 'strokeWidth', v: number | null) => {
  if (typeof v === 'number') applyMulti({ [key]: v } as NodePropsPatch)
}

// ---------------- 房间批量样式（多选且全部为房间节点，覆盖显示） ----------------
const multiRoomForm = ref({
  roomOwnership: null as number | null,
  fontFill: null as string | null,
  fontSize: null as number | null,
  topbarHeight: null as number | null,
  areaVisible: false as boolean,
  strokeWidth: null as number | null,
  strokeStyle: 'solid' as StrokeStyle,
  width: null as number | null,
  height: null as number | null,
  areaText: '',
})
// 面积标注混合态标记（布尔无法像颜色那样显示"空"，用独立标记提示）
const areaMixed = ref(false)

// 房间多选状态 → 回填批量表单：混合态（undefined）显示空值占位
watch(
  () => props.multiRoom,
  (m) => {
    if (!m) return
    const s = m.shared
    areaMixed.value = s.areaVisible === undefined
    multiRoomForm.value = {
      roomOwnership: s.roomOwnership === undefined ? null : s.roomOwnership,
      fontFill: s.fontFill ?? null,
      fontSize: s.fontSize ?? null,
      topbarHeight: s.topbarHeight ?? null,
      areaVisible: s.areaVisible ?? false,
      strokeWidth: s.strokeWidth ?? null,
      strokeStyle: s.strokeStyle ?? 'solid',
      width: s.width ?? null,
      height: s.height ?? null,
      areaText: s.areaText ?? '',
    }
  },
  { immediate: true, deep: true },
)

const applyRoom = (patch: NodePropsPatch) => emit('apply-room', patch)

// 房间批量：数字框受控，仅在给出合法数字时下发（避免混合态/清空误写 null）
const onRoomNumber = (
  key: 'fontSize' | 'topbarHeight' | 'strokeWidth' | 'width' | 'height',
  v: number | null,
) => {
  if (typeof v === 'number') applyRoom({ [key]: v } as NodePropsPatch)
}

</script>

<template>
  <div class="panel">
    <div class="panel-header">属性</div>

    <div v-if="!snapshot && !multiStyle" class="empty">
      <p>未选中节点</p>
      <p class="empty-tip">单击画布中的节点即可编辑属性</p>
    </div>

    <template v-if="!snapshot && multiRoom">
      <div class="panel-header" style="margin-top: 12px">批量（房间）</div>
      <div class="multi-count">已选中 {{ multiRoom?.count ?? 0 }} 个房间，修改将统一应用到全部</div>
      <el-form label-position="top" size="small">
        <el-form-item label="公司 / 归属">
          <el-select
            v-model="multiRoomForm.roomOwnership"
            placeholder="选择公司（留空为自定义）"
            clearable
            @change="applyRoom({ roomOwnership: multiRoomForm.roomOwnership })"
          >
            <el-option
              v-for="c in COMPANY_COLORS"
              :key="c.roomOwnership"
              :value="c.roomOwnership"
              :label="c.roomOwnershipName"
            >
              <span class="co-swatch" :style="{ background: c.color }"></span>
              <span class="co-name">{{ c.roomOwnershipName }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <p class="co-hint">选择公司后，顶部色条与描边使用该公司颜色，房间内部填充保持白色。</p>

        <div class="section-title">文字</div>
        <div class="row">
          <el-form-item label="字号">
            <el-input-number
              :model-value="multiRoomForm.fontSize ?? null"
              :min="8"
              :max="72"
              @change="(v: number | null) => onRoomNumber('fontSize', v)"
            />
          </el-form-item>
          <el-form-item label="文字颜色">
            <el-color-picker
              v-model="multiRoomForm.fontFill"
              show-alpha
              @change="multiRoomForm.fontFill && applyRoom({ fontFill: multiRoomForm.fontFill })"
            />
          </el-form-item>
        </div>

        <div class="section-subtitle">
          <span>面积标注</span>
          <el-switch
            v-model="multiRoomForm.areaVisible"
            inline-prompt
            active-text="显示"
            inactive-text="隐藏"
            @change="applyRoom({ areaVisible: multiRoomForm.areaVisible })"
          />
        </div>
        <p v-if="areaMixed" class="co-hint">当前选中房间面积标注显示状态不一致，修改将以勾选状态统一覆盖。</p>
        <el-form-item label="面积文字">
          <el-input
            v-model="multiRoomForm.areaText"
            type="textarea"
            :rows="2"
            placeholder="统一设置为（如 20m*30m）；留空不改"
            @change="multiRoomForm.areaText !== undefined && applyRoom({ areaText: multiRoomForm.areaText })"
          />
        </el-form-item>

        <div class="section-subtitle">
          <span>顶部色条</span>
        </div>
        <el-form-item label="色条高度">
          <el-input-number
            :model-value="multiRoomForm.topbarHeight ?? null"
            :min="0"
            :max="40"
            @change="(v: number | null) => onRoomNumber('topbarHeight', v)"
          />
        </el-form-item>

        <div class="section-title">描边</div>
        <div class="row">
          <el-form-item label="描边宽度">
            <el-input-number
              :model-value="multiRoomForm.strokeWidth ?? null"
              :min="0"
              :max="8"
              @change="(v: number | null) => onRoomNumber('strokeWidth', v)"
            />
          </el-form-item>
          <el-form-item label="描边样式">
            <el-radio-group
              v-model="multiRoomForm.strokeStyle"
              size="small"
              @change="applyRoom({ strokeStyle: multiRoomForm.strokeStyle })"
            >
              <el-radio-button value="solid">实线</el-radio-button>
              <el-radio-button value="dashed">虚线</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </div>

        <div class="section-title">尺寸</div>
        <div class="row">
          <el-form-item label="宽度">
            <el-input-number
              :model-value="multiRoomForm.width ?? null"
              :min="10"
              :max="600"
              @change="(v: number | null) => onRoomNumber('width', v)"
            />
          </el-form-item>
          <el-form-item label="高度">
            <el-input-number
              :model-value="multiRoomForm.height ?? null"
              :min="10"
              :max="600"
              @change="(v: number | null) => onRoomNumber('height', v)"
            />
          </el-form-item>
        </div>
      </el-form>
    </template>

    <template v-if="!snapshot && multiStyle">
      <div class="panel-header" style="margin-top: 12px">批量样式</div>
      <div class="multi-count">已选中 {{ multiStyle?.count ?? 0 }} 个节点，修改将统一应用到全部</div>
      <el-form label-position="top" size="small">
        <div class="section-title">文字</div>
        <div class="row">
          <el-form-item label="字号">
            <el-input-number
              :model-value="multiForm.fontSize ?? null"
              :min="8"
              :max="72"
              @change="(v: number | null) => onMultiNumber('fontSize', v)"
            />
          </el-form-item>
          <el-form-item label="文字颜色">
            <el-color-picker
              v-model="multiForm.fontFill"
              show-alpha
              @change="multiForm.fontFill && applyMulti({ fontFill: multiForm.fontFill })"
            />
          </el-form-item>
        </div>

        <div class="section-title">外观</div>
        <el-form-item label="背景色" :disabled="!canBody">
          <el-color-picker
            v-model="multiForm.fill"
            show-alpha
            :disabled="!canBody"
            @change="multiForm.fill && applyMulti({ fill: multiForm.fill })"
          />
        </el-form-item>
        <el-form-item label="描边色" :disabled="!canBody">
          <el-color-picker
            v-model="multiForm.stroke"
            show-alpha
            :disabled="!canBody"
            @change="multiForm.stroke && applyMulti({ stroke: multiForm.stroke })"
          />
        </el-form-item>
        <div class="row">
          <el-form-item label="描边宽度" :disabled="!canBody">
            <el-input-number
              :model-value="multiForm.strokeWidth ?? null"
              :min="0"
              :max="8"
              :disabled="!canBody"
              @change="(v: number | null) => onMultiNumber('strokeWidth', v)"
            />
          </el-form-item>
          <el-form-item label="描边样式" :disabled="!canBody">
            <el-radio-group
              v-model="multiForm.strokeStyle"
              size="small"
              :disabled="!canBody"
              @change="applyMulti({ strokeStyle: multiForm.strokeStyle })"
            >
              <el-radio-button value="solid">实线</el-radio-button>
              <el-radio-button value="dashed">虚线</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </div>
        <p v-if="multiStyle?.hasTextNode" class="co-hint">
          文字节点为透明本体，背景色与描边对其无效（已禁用）。
        </p>
      </el-form>
    </template>

    <el-form v-if="snapshot" label-position="top" size="small">
      <div class="meta">
        <el-tag size="small" type="info">
          {{ snapshot.isGroup ? '组合' : SHAPE_LABELS[snapshot.shape] ?? snapshot.shape }}
        </el-tag>
        <span class="meta-id">{{ snapshot.id }}</span>
      </div>

      <template v-if="!snapshot.isGroup && !snapshot.isWall">
        <div class="section-title">内容</div>
        <!-- 编号房间的文字由「房间分配」下拉写入，隐藏手输框避免两处改同一值 -->
        <el-form-item label="文字" v-if="snapshot.shape !== 'room-number'">
          <el-input
            v-model="form.label"
            type="textarea"
            :rows="3"
            placeholder="节点文字（回车可换行）"
            @change="apply({ label: form.label })"
          />
        </el-form-item>
        <div class="row">
          <el-form-item label="字号">
            <el-input-number
              v-model="form.fontSize"
              :min="8"
              :max="72"
              @change="apply({ fontSize: form.fontSize })"
            />
          </el-form-item>
          <el-form-item label="文字颜色">
            <el-color-picker
              v-model="form.fontFill"
              show-alpha
              @change="apply({ fontFill: form.fontFill })"
            />
          </el-form-item>
        </div>

        <!-- 文字节点专属：加粗开关 -->
        <div class="row" v-if="snapshot.isTextNode">
          <el-form-item label="加粗">
            <el-switch
              v-model="form.fontBold"
              inline-prompt
              active-text="粗"
              inactive-text="细"
              @change="apply({ fontBold: form.fontBold })"
            />
          </el-form-item>
        </div>

        <!-- 编号房间专属：房间分配（营地→区域→楼栋→房间号）；显示文字与 roomNo 由此联动写入 -->
        <template v-if="snapshot.shape === 'room-number'">
          <div class="section-subtitle">
            <span>房间分配</span>
          </div>
          <el-form-item label="营地/区域/楼栋">
            <el-cascader
              :model-value="locationPath"
              :options="locationOptions"
              placeholder="选择营地 / 区域 / 楼栋"
              clearable
              :show-all-levels="true"
              @change="onLocationChange"
            />
          </el-form-item>
          <el-form-item label="房间号">
            <el-select
              :model-value="snapshot.room.roomNo || null"
              placeholder="选择房间号"
              clearable
              :disabled="buildingId == null"
              @change="(v: string | null) => (v ? onRoomNumberPick(v) : onClearRoom())"
            >
              <el-option
                v-for="r in roomOptions"
                :key="r.id"
                :value="r.roomNumber"
                :label="r.roomNumber"
                :disabled="isRoomTaken(r.roomNumber)"
              >
                <span>{{ r.roomNumber }}</span>
                <span v-if="isRoomTaken(r.roomNumber)" class="room-taken">（已分配）</span>
              </el-option>
            </el-select>
          </el-form-item>
        </template>

        <!-- 编号房间专属：归属公司下拉框（顶部色条 / 填充 / 描边 共用该公司颜色） -->
        <template v-if="snapshot.shape === 'room-number'">
          <el-form-item label="公司">
            <el-select
              v-model="form.roomOwnership"
              placeholder="选择公司（留空为自定义）"
              clearable
              @change="apply({ roomOwnership: form.roomOwnership })"
            >
              <el-option
                v-for="c in COMPANY_COLORS"
                :key="c.roomOwnership"
                :value="c.roomOwnership"
                :label="c.roomOwnershipName"
              >
                <span class="co-swatch" :style="{ background: c.color }"></span>
                <span class="co-name">{{ c.roomOwnershipName }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <!-- <p class="co-hint">选择公司后，顶部色条与描边使用该公司颜色，房间内部填充保持白色。</p> -->
        </template>

        <!-- 编号房间专属：面积文字（area 选择器）的显示与编辑 -->
        <template v-if="snapshot.shape === 'room-number'">
          <div class="section-subtitle">
            <span>面积标注</span>
            <el-switch
              v-model="form.areaVisible"
              inline-prompt
              active-text="显示"
              inactive-text="隐藏"
              @change="apply({ areaVisible: form.areaVisible })"
            />
          </div>
          <el-form-item label="面积文字">
            <el-input
              v-model="form.areaText"
              type="textarea"
              :rows="2"
              :disabled="!form.areaVisible"
              placeholder="如 20m*30m"
              @change="apply({ areaText: form.areaText })"
            />
          </el-form-item>
          <div class="row">
            <el-form-item label="字号">
              <el-input-number
                v-model="form.areaFontSize"
                :min="6"
                :max="48"
                :disabled="!form.areaVisible"
                @change="apply({ areaFontSize: form.areaFontSize })"
              />
            </el-form-item>
            <el-form-item label="文字颜色">
              <el-color-picker
                v-model="form.areaFontFill"
                show-alpha
                :disabled="!form.areaVisible"
                @change="apply({ areaFontFill: form.areaFontFill })"
              />
            </el-form-item>
          </div>
        </template>        
      </template>

      <!-- 事件开关：仅非房间 / 非墙 / 非组合节点；房间节点由分配状态控制，此处不生效 -->
      <template v-if="!snapshot.isGroup && !snapshot.isWall && snapshot.shape !== 'room-number'">
        <div class="section-subtitle">
          <span>事件</span>
        </div>
        <div class="row">
          <el-form-item label="点击事件">
            <el-switch
              v-model="form.eventsClick"
              inline-prompt
              active-text="开"
              inactive-text="关"
              @change="apply({ events: { click: form.eventsClick, hover: form.eventsHover } })"
            />
          </el-form-item>
          <el-form-item label="hover事件">
            <el-switch
              v-model="form.eventsHover"
              inline-prompt
              active-text="开"
              inactive-text="关"
              @change="apply({ events: { click: form.eventsClick, hover: form.eventsHover } })"
            />
          </el-form-item>
        </div>
        <p class="co-hint">开启后，预览页面该节点可点击 / 悬停交互（房间节点由分配状态控制，此处不生效）。</p>
      </template>

      <div class="section-title">位置与尺寸</div>
      <div class="row">
        <el-form-item label="X">
          <el-input-number v-model="form.x" @change="apply({ x: form.x })" />
        </el-form-item>
        <el-form-item label="Y">
          <el-input-number v-model="form.y" @change="apply({ y: form.y })" />
        </el-form-item>
      </div>
      <div class="row" v-if="!snapshot.isGroup">
        <el-form-item label="宽">
          <el-input-number
            v-model="form.width"
            :min="4"
            @change="apply({ width: form.width })"
          />
        </el-form-item>
        <el-form-item label="高" v-if="snapshot.shape !== 'wall-line'">
          <el-input-number
            v-model="form.height"
            :min="4"
            @change="apply({ height: form.height })"
          />
        </el-form-item>
      </div>

      <template v-if="!snapshot.isGroup && !snapshot.isTextNode">
        <div class="section-title">样式</div>
        <el-form-item label="填充色" v-if="snapshot.shape !== 'room-number'">
          <el-color-picker
            v-model="form.fill"
            show-alpha
            @change="apply({ fill: form.fill })"
          />
        </el-form-item>
        <template v-if="snapshot.isWall">
          <el-form-item label="墙厚">
            <el-input-number
              v-model="form.wallThickness"
              :min="1"
              :max="20"
              @change="apply({ wallThickness: form.wallThickness })"
            />
          </el-form-item>
        </template>
        <template v-if="!snapshot.isWall">
          <el-form-item label="描边色" v-if="snapshot.shape !== 'room-number'">
            <el-color-picker
              v-model="form.stroke"
              show-alpha
              @change="apply({ stroke: form.stroke })"
            />
          </el-form-item>
          <el-form-item label="描边样式">
            <el-radio-group
              v-model="form.strokeStyle"
              size="small"
              @change="apply({ strokeStyle: form.strokeStyle })"
            >
              <el-radio-button value="solid">实线</el-radio-button>
              <el-radio-button value="dashed">虚线</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="描边宽度">
            <el-input-number
              v-model="form.strokeWidth"
              :min="0"
              :max="8"
              @change="apply({ strokeWidth: form.strokeWidth })"
            />
          </el-form-item>
          <el-form-item label="圆角" v-if="snapshot.shape !== 'room-number'">
            <el-input-number
              v-model="form.cornerRadius"
              :min="0"
              :max="100"
              @change="apply({ cornerRadius: form.cornerRadius })"
            />
          </el-form-item>
        </template>
      </template>
    </el-form>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow-y: auto;
}
.panel-header {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
}
.empty {
  padding: 24px 0;
  text-align: center;
  color: #909399;
  font-size: 13px;
}
.empty-tip {
  margin: 4px 0 0;
  font-size: 12px;
  color: #c0c4cc;
}
.multi-count {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #606266;
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  border-radius: 4px;
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.meta-id {
  font-size: 11px;
  color: #c0c4cc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.section-title {
  margin: 8px 0 10px;
  padding-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  border-bottom: 1px solid #ebeef5;
}
.section-subtitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 8px;
  font-size: 12px;
  color: #606266;
}
.row {
  display: flex;
  gap: 8px;
}
.row > :deep(.el-form-item) {
  flex: 1;
  min-width: 0;
}
:deep(.el-form-item) {
  margin-bottom: 12px;
}
.co-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #dcdfe6;
  margin-right: 8px;
  vertical-align: -2px;
}
.co-name {
  font-size: 13px;
}
.co-hint {
  margin: 0 0 12px;
  font-size: 11px;
  line-height: 1.5;
  color: #a8abb2;
}
.room-taken {
  float: right;
  font-size: 11px;
  color: #c0c4cc;
}
</style>
