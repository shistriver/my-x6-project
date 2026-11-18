import {
  Graph,
  Snapline,
  Selection,
  Transform,
  Keyboard,
  Clipboard,
  History,
  Dnd,
  type Node,
  type Cell,
} from '@antv/x6'
import {
  registerShapes,
  SHAPE_ROOM_NUMBER,
  SHAPE_WALL_L,
  SHAPE_WALL_LINE,
  WALL_THICKNESS,
  type PaletteItem,
} from './shapes'
import { getCompanyColorByOwnership, type CompanyColor } from './companyColors'
import { formatRoomNoForDisplay, type RoomOption } from './campData'
import './guides.css'

/**
 * 预览态「未分配房间」置灰样式：区别于已分配房间的橙色默认外观。
 * 仅作用于编号房间（SHAPE_ROOM_NUMBER），且只在预览模式生效。
 */
// 画布支持的视图变换指令
export type TransformCommand =
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomTo'
  | 'zoomToFit'
  | 'centerContent'

// 对齐方式
export type AlignType = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'

// 间距分布：水平 / 垂直（让选中元素之间的"间隙"均匀相等）
export type DistributeType = 'distributeH' | 'distributeV'

/**
 * 右键菜单上下文：只描述"当前能做什么"，
 * 具体文案/图标由 Vue 组件决定，避免 UI 耦合进类
 */
export interface ContextMenuState {
  /** 视口坐标，用于菜单定位 */
  x: number
  y: number
  /** 对应的画布坐标，用于在该位置新增节点 */
  graphX: number
  graphY: number
  /** 选中的节点数量 */
  selectedCount: number
  /** 是否可组合：参与组合的"单元"数 ≥ 2（1 个已有组合 / 1 个自由节点 各算 1 个单元） */
  canGroup: boolean
  /** 是否可取消组合（选区里全是已分组的东西，没有自由节点） */
  canUngroup: boolean
  /** 选区里是否含组合容器本身 → 决定菜单文案是"取消组合"还是"移出组合" */
  hasContainer: boolean
  /** 选区中的自由节点数（无父无子） */
  freeCount: number
  /** 选区中的已有组合数（容器本身，或成员所属的组，去重后） */
  groupCount: number
  /** 参与组合的单元数 = 自由节点数 + 组合数，用于菜单显示"组合 (2)" */
  unitCount: number
  /** 实际会被删除的 cell 数（含组内后代），用于菜单显示"删除 (N)" */
  removeCount: number
  /** 剪贴板是否有内容 */
  canPaste: boolean
}

/** 描边样式：实线 / 虚线 */
export type StrokeStyle = 'solid' | 'dashed'

/**
 * 节点「事件开关」：预览页面是否响应点击 / hover 交互。
 * 存放于 node.data.events，随 JSON 导入导出；缺省关闭（所有事件不触发）。
 * 注意：房间节点由 allocated 状态控制（不可分配强制关闭），此开关对其不生效。
 */
export interface NodeEventFlags {
  /** 预览页点击该节点是否触发交互（房间=弹详情，非房间=弹信息卡） */
  click: boolean
  /** 预览页悬停该节点是否触发交互（光标 pointer + 描边高亮） */
  hover: boolean
}

/**
 * 房间业务信息：预览页点击节点弹出的「房间详情」弹框数据源。
 * 存放于 `node.data.room`（随 JSON 导入导出），未填写的字段在弹框里显示占位符。
 * `allocated=true` 时弹框走「ROOM DETAILS」样式（含 Remove Binding），否则走「Confirm Room Allocation」样式。
 */
export interface RoomInfo {
  /** 房间号原始值（如 "73/74"，唯一性以此为准；节点显示文字是换行版） */
  roomNo: string
  /** 接口房间记录 id（roomNumber 下拉选中后写入，唯一标识） */
  roomId: number | null
  /** 楼栋 id（locationId，下拉三级级联最终选中值） */
  locationId: number | null
  /** 区域 id */
  zoneId: number | null
  /** 营地 id */
  campId: number | null
  /** 是否已分配房间（决定弹框样式与按钮） */
  allocated: boolean
  camp: string
  zone: string
  building: string
  /** 房型分类，如 Office / Constactor Office */
  category: string
  /** 房间状态，如 Available / Not Available */
  status: string
  /** IP 电话分机 */
  ipPhoneExt: string
  /** 集合点 */
  musterPoint: string
  /** 保险柜 */
  safeLocker: string
  /** 入住日期 yyyy-MM-dd */
  checkIn: string
  /** 退房日期 yyyy-MM-dd */
  checkOut: string
  /** 是否仅限轮换人员 */
  rotatorOnly: boolean
  /** 入住人姓名 */
  fullName: string
  /** 入住人职位 */
  position: string
  /** 入住人部门 */
  department: string
  /** 入住人所属公司 */
  company: string
  /** 预留公司 */
  reserveCompany: string
  /** 预留标识色，如 STORE */
  reserveColor: string
  /** 轮换模式 */
  rotationPattern: string
  /** 绑定人员 */
  bindPax: string
  /** 备注 */
  remark: string
}

/** 房间信息的增量修改（属性面板下发） */
export type RoomPatch = Partial<RoomInfo>

/** 预览页节点点击回抛的数据 */
export interface PreviewNodeClick {
  id: string
  shape: string
  /** 节点上的编号文字 */
  label: string
  /** 是否为房间节点（决定预览弹框样式：房间=详情，非房间=信息卡） */
  isRoom: boolean
  /** 是否为文字节点（透明本体、仅显示文字）：信息卡类型显示为"文字" */
  isText: boolean
  room: RoomInfo
}

/** Reception 页房间节点 hover 回抛的数据（只读，不改画布） */
export interface RoomHoverPayload {
  id: string
  roomNo: string
  category: string
  /** 节点在视口中的屏幕矩形（getBoundingClientRect），用于把卡片定位到节点正上方 */
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }
}

/** RoomAllocate 页房间节点点击回抛的数据（只读，不改画布） */
export interface RoomAllocateClickPayload {
  id: string
  /** 节点显示文字（房间号） */
  label: string
  room: RoomInfo
}

/** 空房间信息：所有字段的兜底值（属性面板初始化表单也用） */
export function createRoomInfo(): RoomInfo {
  return {
    roomNo: '',
    roomId: null,
    locationId: null,
    zoneId: null,
    campId: null,
    allocated: false,
    camp: '',
    zone: '',
    building: '',
    category: '',
    status: '',
    ipPhoneExt: '',
    musterPoint: '',
    safeLocker: '',
    checkIn: '',
    checkOut: '',
    rotatorOnly: false,
    fullName: '',
    position: '',
    department: '',
    company: '',
    reserveCompany: '',
    reserveColor: '',
    rotationPattern: '',
    bindPax: '',
    remark: '',
  }
}

/** 描边样式 → SVG stroke-dasharray */
const STROKE_DASH_MAP: Record<StrokeStyle, string> = {
  solid: '0', // 0 表示不打断，即实线
  dashed: '6 4',
}

/** X6 的 strokeDasharray → 语义化的描边样式 */
function readStrokeStyle(v: unknown): StrokeStyle {
  if (typeof v !== 'string') return 'solid'
  const raw = v.trim()
  if (raw === '' || raw === '0' || raw === 'none') return 'solid'
  return 'dashed'
}

/**
 * 单个节点的属性快照：右侧属性面板的数据源
 * 只描述"可编辑的值"，不含 X6 对象，避免 UI 直接依赖画布
 */
export interface NodeSnapshot {
  id: string
  shape: string
  /** 是否为组合容器（隐形），用于面板决定是否显示内容/样式区 */
  isGroup: boolean
  /** 是否为墙（L 形墙 / 直线墙）：无文字、无描边，填充色 = 墙体颜色，墙厚由「墙厚」字段控制 */
  isWall: boolean
  /** 是否为文字节点（透明本体、仅显示文字）：不应暴露 body 填充/描边等样式 */
  isTextNode: boolean
  /** 墙厚（像素）：直线墙=几何高度，L 形墙=两臂粗细 */
  wallThickness: number
  x: number
  y: number
  width: number
  height: number
  /** 文本内容 */
  label: string
  /** 编号房间专属：面积文字（area 选择器下的 text） */
  areaText: string
  /** 编号房间专属：是否显示面积文字 */
  areaVisible: boolean
  /** 编号房间专属：面积文字字号 */
  areaFontSize: number
  /** 编号房间专属：面积文字颜色 */
  areaFontFill: string
  /** 编号房间专属：顶部色条高度（topbar 选择器，默认 8） */
  topbarHeight: number
  /** 编号房间专属：顶部色条颜色（填充色与描边色共用一个，同步写入 topbar/fill 与 topbar/stroke） */
  topbarColor: string
  /**
   * 编号房间专属：所选归属公司的 roomOwnership 编码（下拉框选中值）。
   * null = 未选择/自定义颜色。房间节点的「顶部色条 / 填充 / 描边」共用该编码对应公司的颜色。
   */
  roomOwnership: number | null
  /** 填充色（rgba 格式，透明为 rgba(0, 0, 0, 0)） */
  fill: string
  /** 描边色 */
  stroke: string
  /** 描边宽度 */
  strokeWidth: number
  /** 描边样式：实线 / 虚线 */
  strokeStyle: StrokeStyle
  fontSize: number
  fontFill: string
  /** 文字是否加粗（fontWeight 700）：仅对文字节点有意义 */
  fontBold: boolean
  /** 圆角大小（px）：房间 / 矩形节点的 body 圆角半径，rx 与 ry 同值 */
  cornerRadius: number
  /** 事件开关：预览页是否响应点击 / hover（房间节点由 allocated 决定，不依赖此值） */
  events: NodeEventFlags
  /** 房间业务信息（预览页点击弹框内容），存放于 node.data.room */
  room: RoomInfo
}

/** 属性面板下发的增量修改 */
export type NodePropsPatch = Partial<Omit<NodeSnapshot, 'id' | 'shape' | 'room'>> & {
  /** 房间业务信息只做字段级合并，避免整块覆盖 */
  room?: RoomPatch
}

/**
 * 多选（≥2 个节点）时的批量样式状态：右侧「批量样式」面板的数据源。
 * 各属性「全部选中节点一致」才给具体值；否则为 undefined（面板显示"混合"占位）。
 * 背景/描边只对非文字节点有意义（文字节点透明本体），故 fill/stroke/strokeWidth/strokeStyle
 * 只在选区存在可应用节点时才可能给出共享值。
 */
export interface MultiStyleState {
  /** 实际参与批量样式的节点数（已剔除隐形组合容器） */
  count: number
  /** 选区是否包含文字节点：是则背景/描边禁用（无意义） */
  hasTextNode: boolean
  /** 文字字号（对所有节点生效，含文字节点） */
  fontSize: number | undefined
  /** 文字颜色（对所有节点生效） */
  fontFill: string | undefined
  /** 背景色（仅对非文字节点取共享值） */
  fill: string | undefined
  /** 描边色 */
  stroke: string | undefined
  /** 描边宽度 */
  strokeWidth: number | undefined
  /** 描边样式：实线 / 虚线 */
  strokeStyle: StrokeStyle | undefined
}

/**
 * 多选（Ctrl / 框选 ≥2 个**且全部为编号房间节点**）时的房间批量样式状态。
 * 各属性仅当「所有房间一致」才回填具体值，否则为 undefined（面板显示"混合"）。
 * 返回 null 表示不符合条件（<2 个节点，或选中项里混入了非房间节点）。
 *
 * ⚠️ 与 MultiStyleState（矩形/圆/文字）是两条独立通道：房间节点的背景/描边由
 * 顶部色条与归属公司颜色控制，不能用通用批量样式覆盖，故单独成类。
 */
export interface MultiRoomStyleState {
  /** 实际参与批量样式的房间节点数 */
  count: number
  /** 各属性共享值；不一致则为 undefined（混合态） */
  shared: {
    /** 归属公司编码（roomOwnership），null 表示自定义/未归属 */
    roomOwnership?: number | null
    /** 文字颜色 */
    fontFill?: string
    /** 文字大小 */
    fontSize?: number
    /** 顶部色条高度 */
    topbarHeight?: number
    /** 面积标注是否显示 */
    areaVisible?: boolean
    /** 描边宽度 */
    strokeWidth?: number
    /** 描边样式：实线 / 虚线 */
    strokeStyle?: StrokeStyle
    /** 节点宽度 */
    width?: number
    /** 节点高度 */
    height?: number
    /** 面积文字内容（如 "20m*30m"） */
    areaText?: string
  }
}

/**
 * 画布参考线（用户从标尺拖出，持久存在，节点拖近时吸附对齐）
 * - axis: 'v' = 竖线（固定画布 x 坐标）；'h' = 横线（固定画布 y 坐标）
 * - pos: 画布局部坐标（与节点 bbox 同一坐标系），非屏幕像素
 */
export interface GuideLine {
  id: string
  axis: 'v' | 'h'
  pos: number
}

/** 右键菜单项（纯展示结构，文案由 Vue 侧决定） */
export interface ContextMenuItem {
  key: string
  label: string
  /** 右侧快捷键提示，如 Ctrl+C */
  shortcut?: string
  disabled?: boolean
  /** 该项上方显示分隔线 */
  divided?: boolean
  /** 危险操作，标红 */
  danger?: boolean
}

/**
 * 画布编辑器封装类
 * 负责 X6 Graph 实例的创建、插件注册、快捷键绑定、节点示例、尺寸自适应与销毁。
 * 与 Vue 组件解耦，方便复用与单测。
 */
export class GraphEditor {
  /** 方向键默认步长（px） */
  private static readonly STEP = 1
  /** 按住 Shift 时的大步长（px），用于快速移动 */
  private static readonly STEP_FAST = 10
  /** 组合容器 hover 时的描边色 */
  private static readonly GROUP_HL_STROKE = '#409EFF'
  /** 组合容器 hover 时的填充色 */
  private static readonly GROUP_HL_FILL = 'rgba(64,158,255,0.06)'
  /** 文字节点自适应时，文字与节点边缘的内边距（px）。设为 0 = 完全紧贴文字渲染边界。 */
  private static readonly TEXT_PAD_X = 0
  private static readonly TEXT_PAD_Y = 0
  /** 组合成员拖拽的启动阈值（px），与 Graph 的 moveThreshold 保持一致，
   *  避免点击时 1~2px 抖动就把整组挪走 */
  private static readonly MOVE_THRESHOLD = 2
  /** 预览画布四周留白（px）。
   *  ⚠️ X6 画布 SVG 是 overflow:hidden，内容 bbox 之外的部分会被直接裁掉；
   *  而描边是以路径为中线「向内外各扩 strokeWidth/2」绘制，bbox 并不含这部分。
   *  所以画布尺寸若严格等于内容 bbox，最外层矩形/圆形节点的边框就会被切掉一半
   *  （表现为「预览时边框显示不完整」）。留出几十像素的余量足够覆盖任意描边宽度。 */
  private static readonly PREVIEW_PADDING = 8

  private graph: Graph | null = null
  private readonly container: HTMLElement
  /** 当前 hover 高亮的组合容器 id */
  private highlightedId: string | null = null
  /** hover 清除的延迟句柄，避免组内节点间移动闪烁 */
  private hoverTimer: number | null = null
  /** 左侧面板拖放的 dnd 实例 */
  private dnd: Dnd | null = null
  /** Transform 插件实例：用于在"自研指针选中"改选后手动同步变换框（插件只监听 node:click） */
  private transformPlugin: Transform | null = null
  /** Selection 插件实例：用于"按住空格平移画布"期间临时关闭框选 */
  private selectionPlugin: Selection | null = null
  /** 空格手势守卫的清理句柄（移除 keydown/keyup/blur 监听） */
  private spaceGuardCleanup: (() => void) | null = null
  /** 空格是否处于按住状态（平移模式）。bindPointerSelection 需读它来放行平移 */
  private spaceDown = false
  /** 空格平移时临时关闭 interacting 前的原值，松开时还原 */
  private prevInteracting: unknown = true
  /** 缩放快捷键（Ctrl/Cmd + 0/-/+）原生监听的清理句柄 */
  private zoomGuardCleanup: (() => void) | null = null
  /** 是否以只读预览模式初始化：屏蔽所有编辑交互（拖拽/框选/滚轮缩放/平移/快捷键） */
  private preview = false
  /** 容器尺寸观察器：三栏布局下中间栏宽度变化不会触发 window.resize */
  private resizeObserver: ResizeObserver | null = null
  /** 组合容器角度基线（记录上一次角度，用于计算旋转增量并带动子节点） */
  private lastAngles = new Map<string, number>()
  /** 旋转传播进行中标记：避免子节点角度变化事件递归触发 */
  private rotating = false
  /** 选区归并进行中标记：避免 resetSelection 再次触发归并 */
  private normalizingSelection = false
  /** 组合成员拖拽进行中的清理句柄（移除 mousemove/mouseup 并结束 batch），同时用于兜底清理上一次 */
  private groupDragCleanup: (() => void) | null = null
  /** 整组拖拽进行中标记：压制 refitParent —— 整组平移时子节点会同步位移，
   *  若此刻重算容器包围盒会把刚移好的容器位置覆盖掉，导致"拖不动" */
  private groupDragging = false
  /** 最近一次 dnd 落点生成的节点 id，用于放置后自动选中 */
  private pendingDropId: string | null = null
  /** 等待下一帧用真实 DOM 尺寸重新自适应的文字节点 id 集合（拖入/导入时 view 尚未渲染） */
  private pendingTextFitIds = new Set<string>()

  // ---------------- 画布参考线（标尺拖出 + 吸附） ----------------
  /** 参考线列表（画布局部坐标，持久化） */
  private guides: GuideLine[] = []
  /** 参考线 DOM 覆盖层：挂在 graph.container 内，常态 pointer-events:none */
  private guideLayer: HTMLDivElement | null = null
  /** 顶部 / 左侧标尺 DOM（由 HomeView 提供，仅用于拖出参考线与绘制刻度） */
  private topRuler: HTMLElement | null = null
  private leftRuler: HTMLElement | null = null
  /** 标尺刻度画布（tick 绘制） */
  private topRulerCanvas: HTMLCanvasElement | null = null
  private leftRulerCanvas: HTMLCanvasElement | null = null
  /** 是否显示参考线 + 标尺（默认显示） */
  private guidesVisible = true
  /** 吸附触发距离（屏幕像素），按需求选 6；换算成画布单位要 ÷ 缩放 */
  private static readonly SNAP_TOLERANCE = 6

  /**
   * 面板当前正在编辑的节点 id（即最近一次 getSelectedNodeSnapshot 命中的节点）。
   * ⚠️ 故意在"选区清空"时不重置：属性面板的文字/样式输入用 @change（失焦才下发），
   *    而点击画布空白会"先"清掉选区再触发输入框失焦，此时 getSelectedCells 已为空；
   *    用这个 id 兜底，applyNodeProps 仍能把修改写回正确的节点，避免修改丢失。
   *    （切换到另一个节点时此值会被覆盖为新的 id，不存在定位到错误节点的问题。）
   */
  private lastSelectedNodeId: string | null = null
  /** 吸附进行中标记：避免 node:moving 中调整位置再次递归触发本逻辑 */
  private snapping = false
  /** 当前命中的参考线 id（用于高亮）；null = 无吸附 */
  private snappedGuideId: string | null = null
  /** 标尺拖出 / 参考线移动中的临时预览线（不进 guides，不持久化） */
  private previewGuide: GuideLine | null = null
  /** 参考线交互的 document 监听清理句柄（拖出 / 移动 / 删除） */
  private guideDragCleanup: (() => void) | null = null

  constructor(container: HTMLElement) {
    this.container = container
  }

  /** 初始化画布：注册图形、创建实例、注册插件、添加示例节点、绑定快捷键并居中内容 */
  init(preview = false): void {
    this.preview = preview
    // ⚠️ 必须在 new Graph() 之前注册自定义 shape
    registerShapes()

    // 从容器实际尺寸初始化，替代写死的 1200*600，实现自适应
    this.graph = new Graph({
      container: this.container,
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      background: {
        // 预览态用纯白底，编辑态保留浅蓝灰（与网格/工具栏视觉一致）
        color: preview ? '#FFFFFF' : '#F2F7FA',
      },
      grid: preview
        ? { visible: false }
        : {
            visible: true,
            type: 'doubleMesh',
            args: [
              {
                color: '#eee',
                thickness: 1, // 主网格线宽度
              },
              {
                color: '#ddd',
                thickness: 1,
                factor: 4, // 主次网格线间隔
              },
            ],
          },
      // 预览模式：禁用平移与滚轮缩放（只读，内容由 loadJSONForPreview 自适应居中，不超出则保持 100%）。
      // 节点拖拽/选中/旋转由 interacting=false + 关闭 Transform 锁定。
      panning: preview
        ? { enabled: false }
        : {
            enabled: true,
            modifiers: ['space'],
            eventTypes: ['leftMouseDown'],
          },
      mousewheel: !preview,
      // 限制缩放范围，避免过度缩放导致画布丢失
      scaling: {
        min: 0.3,
        max: 3,
      },
      // 拖拽阈值：指针需移动超过该像素才视为"开始拖动"
      // 默认 0 —— 点击时鼠标 1~2px 抖动会被当成拖动，导致节点（及其所在组合的容器）被误移动。
      // 设为 2 后，纯点击/轻微抖动不再触发节点位移，只有真正拖动才会移动。
      moveThreshold: 2,
      // 点击判定上限：指针移动不超过该像素视为"点击"而非拖拽，与 moveThreshold 配合
      clickThreshold: 2,
      embedding: {
        enabled: false,
        findParent: ({ node }) => {
          const bbox = node.getBBox()
          return this.graph!.getNodes().filter((candidate) => {
            const targetBBox = candidate.getBBox()
            return bbox.isIntersectWithRect(targetBBox) && candidate !== node
          })
        },
      },
    })

    this.registerPlugins()
    // 预览模式不绑定任何编辑交互（快捷键/方向键/整组高亮/拖放/组合同步/选区归并）
    if (!preview) this.bindShortcuts()
    if (!preview) this.bindArrowKeys()
    if (!preview) this.bindGroupHover()

    // 示例节点不进撤销栈，让撤销/重做从干净状态开始
    this.graph.cleanHistory()

    // 内容居中
    this.graph.centerContent()

    // 挂载拖放（左侧面板拖入画布）
    if (!preview) this.initDnd()

    // 三栏布局下中间栏宽度会随面板变化，window.resize 不一定触发 → 观察容器本身
    this.observeContainer()

    if (!preview) {
      // 组合容器旋转带动子节点 / 子节点变化带动父容器贴合
      this.bindGroupSync()
      // 选区归并：容器与后代同时选中时只保留容器，避免 Transform 把成员旋转两次
      this.bindSelectionNormalize()
      // 指针选中接管：Ctrl/Cmd 多选切换 + 普通点击穿透选中框覆盖层
      this.bindPointerSelection()
      // 按住空格平移画布时关闭框选，避免同时拉出蓝色选框
      this.bindSpaceRubberbandGuard()
      // 参考线系统：DOM 覆盖层 + 节点拖拽吸附（预览模式不启用）
      this.initGuides()
    } else {
      // 预览只读锁定：关闭框选/点选交互、禁节点拖拽、禁滚轮缩放、禁旋转/缩放手柄。
      const g = this.graph
      if (g) {
        g.disableSelection()
        g.disableRubberband()
        g.disableMouseWheel()
        g.options.interacting = false
      }
    }
  }

  /**
   * 选区归并：若容器与它的后代同时被选中，只保留最外层容器。
   *
   * 原因：X6 的 Transform 对**每一个选中的 cell** 各应用一次旋转/缩放。
   * 框选一个组合时必然同时选中隐形容器和它的成员（橡皮筋按 bbox 相交判定），
   * 于是成员会被旋转两次——Transform 一次 + 组合传播一次——整组立刻错位。
   * 归并后 Transform 只作用于容器，组合传播只作用于成员，各一次。
   */
  private bindSelectionNormalize(): void {
    const g = this.graph
    if (!g) return
    const schedule = () => {
      queueMicrotask(() => this.normalizeSelection())
    }
    g.on('cell:selected', schedule)
    g.on('cell:unselected', schedule)
    // 任何选区变化（Ctrl+V 粘贴 / 撤销重做 / 程序化选中 / 点选）都同步 Transform 变换框，
    // 让节点进入"完整选中态"（橙框 + 黑框）。否则仅靠 bindPointerSelection 的手动分支同步，
    // 会漏掉 Ctrl+V / undo 这类不由自研逻辑触发的选区变化。
    g.on('selection:changed', () => this.syncTransformWidget())
  }

  /** 执行一次选区归并（幂等，可重复调用） */
  private normalizeSelection(): void {
    const g = this.graph
    if (!g || this.normalizingSelection) return
    const selected = g.getSelectedCells().filter((c) => c.isNode()) as Node[]
    if (selected.length < 2) return
    const ids = new Set(selected.map((n) => n.id))
    // 祖先（容器）也在选区里 → 该后代交给容器代表，自身退出选区
    const drop = selected.filter((n) => n.getAncestors().some((a) => ids.has(a.id)))
    if (drop.length === 0) return
    this.normalizingSelection = true
    try {
      g.resetSelection(selected.filter((n) => drop.indexOf(n) === -1))
    } finally {
      this.normalizingSelection = false
    }
  }

  /**
   * 指针选中接管：① Ctrl / Cmd + 点击 = 多选切换；② 普通点击穿透选中框覆盖层改选底层节点。
   *
   * 为什么要自己做（实测得出的两条硬伤）：
   * 1) 一旦有节点被选中，X6 会在**它的 bbox 上盖一层 `.x6-widget-selection-box` div**
   *    （`pointer-events: auto`）。此后鼠标落在这层区域内的**其它节点**上时，mousedown
   *    被这层 div 吃掉：该节点收不到 cell:mousedown / cell:mouseup，ctrl 多选必然失效。
   *    更糟的是插件对"选中框 + ctrl + mousedown"的处理（onBoxMouseDown）会把**被框住的节点
   *    直接取消选中**，于是「先选大矩形 → ctrl 点里面的房间」表现为选区被清空。
   *    同理，**普通点击**（不带 ctrl）落在覆盖层内的节点上也会被吞掉、点不上。
   * 2) 反过来「先选房间 → ctrl 点矩形」又会被插件的 movedMap / selectCellOnMoved 判定挡掉，
   *    同样选不上。
   *
   * 做法：在容器上**捕获阶段**监听 mousedown / mouseup——捕获先于插件（挂在 container 子节点上）
   * 与各 cell view 的处理器执行。
   *
   * ⚠️ 关键实现细节（踩过的坑）：穿透改选**必须在 mousedown 阶段拦截**，绝不能在 mouseup 拦截。
   * 因为点击覆盖层时 X6 已经在 mousedown 启动了"拖动整组"；若在 mouseup 才 stopPropagation，
   * 会把事件挡在容器、传不到 X6 挂在 document 上的 mouseup 监听器 → 拖动永远不结束 →
   * 节点跟着鼠标跑（即本次回归）。在 mousedown 就拦下并 preventDefault，X6 根本不会启动拖动。
   *
   * 接管条件（两分支都要求"底层确有可改选的节点"）：
   * - Ctrl/Cmd + 左键：命中节点就自行切换选中并吞掉事件；
   * - 普通左键 **且落点在"别的已选节点的选中框覆盖层"上、且底层节点不在当前选区**：
   *   改选该底层节点（穿透覆盖层）。其余一律放行（普通选中、拖动节点、拖选中框、缩放手柄、框选）。
   */
  private bindPointerSelection(): void {
    const g = this.graph
    if (!g) return
    // 本次 mousedown 是否已被我们接管（用于吞掉配对的 mouseup）
    let handled = false

    const onMouseDown = (e: MouseEvent) => {
      handled = false
      // 空格平移模式：整幅画布交给 X6 Panning 接管，这里完全放行，
      // 否则捕获阶段的 preventDefault/stopPropagation 会挡掉 Panning 的
      // node:unhandled:mousedown，导致落在节点/组合上时无法平移。
      if (this.spaceDown) return
      if (e.button !== 0) return
      const node = this.findNodeAtClientPoint(e.clientX, e.clientY)
      if (!node) return // 空白 / 纯选中框边缘 → 交回默认行为（框选、拖选中框等）

      const ctrl = e.ctrlKey || e.metaKey
      // 落点真正命中的元素
      const target = e.target as Element | null
      // 旋转/缩放手柄（.x6-widget-transform）交给 X6，避免误判成成员点击而重置选区
      if (target?.closest?.('.x6-widget-transform')) return
      const onOverlay = !!target?.closest?.('.x6-widget-selection')

      // 底层节点本身就在当前选区（含已选中组合容器的后代）→ 保持整组语义，放行交给 X6
      const isInSelection =
        g.isSelected(node) ||
        g.getSelectedCells().some(
          (c) => c.isNode() && this.isGroupContainer(c as Node) && node.isDescendantOf(c),
        )

      if (ctrl) {
        // Ctrl/Cmd 多选：自行切换并吞掉事件，避免 X6 默认判定（onBoxMouseDown 会 unselect 被框节点）
        // ⚠️ 切换的是"鼠标下的那个节点本身"（node）—— 组内成员也能被个别多选，
        //    与下面的普通点击一致（点谁选谁、拖谁动谁）。
        e.preventDefault()
        e.stopPropagation()
        handled = true
        if (g.isSelected(node)) g.unselect(node)
        else g.select(node)
        this.syncTransformWidget()
        // preventDefault 会连带阻止"mousedown → 容器获得焦点"，而 Keyboard 插件（global:false）
        // 依赖容器焦点，不补这一步的话 ctrl 点完再按 Delete 会失效。
        this.container.focus({ preventScroll: true })
        return
      }

      // 组合成员 + 按住 Alt → 整组移动；否则交还 X6 原生（单成员选中/移动）
      const outer = this.findOuterGroup(node)
      const isMemberOfGroup =
        !this.isGroupContainer(node) &&
        outer.isNode() &&
        this.isGroupContainer(outer as Node) &&
        outer !== node
      const unit: Node = isMemberOfGroup ? (outer as Node) : (node as Node)

      if (isMemberOfGroup && e.altKey) {
        // Alt + 拖成员：位移落到最外层容器上 —— 容器平移递归带动全部子节点 = 整组移动。
        // ⚠️ 绝不能拖成员本身：成员单独平移会脱离容器；若成员和容器都平移，成员会双倍移动。
        e.preventDefault()
        e.stopPropagation()
        g.resetSelection([node])
        this.syncTransformWidget()
        this.container.focus({ preventScroll: true })
        this.beginGroupDrag(unit, e.clientX, e.clientY)
        return
      }

      // 未按住 Alt：组合成员交还 X6 原生行为，点击选中、拖动**移动该成员个体**。
      // 成员移动后，bindGroupSync 的 refitParent 会自动把容器重新贴合到子节点包围盒
      // （容器跟着成员一起走，不会散组）。遵循"点谁选谁、拖谁动谁"。

      if (onOverlay && !isInSelection) {
        // 普通点击穿透覆盖层改选底层节点：必须在 mousedown 就拦下并 preventDefault，
        // 否则 X6 会在覆盖层上启动"拖动整组"，而我们若只在 mouseup 拦截，
        // stopPropagation 会挡掉 X6 的 mouseup → 拖动无法结束 → 节点跟着鼠标跑。
        e.preventDefault()
        e.stopPropagation()
        handled = true
        g.resetSelection([node])
        this.syncTransformWidget()
        this.container.focus({ preventScroll: true })
        return
      }

      // 点击「已选中节点」本身（落在它自己的覆盖层上、无 modifier）：
      // 覆盖层 .x6-widget-selection-box（pointer-events:auto）盖住节点，X6 的
      // cell:mousedown / cell:mouseup / node:click 全部合成不了（委托靠
      // e.target.closest('[data-cell-id]')，而覆盖层无此属性），于是 X6 的
      // Transform（node:click 显示黑框）和 Selection（cell:mouseup 才 reset）对
      // 这次点击毫无反应 → 表现为「高亮但点击不变选中」。
      // 这里不拦截事件（避免破坏穿透与拖动手感），只手动同步变换框 + 补容器焦点，
      // 让已选中节点点一下就进入完整选中态（橙框 + 黑框）。
      if (isInSelection) {
        this.syncTransformWidget()
        this.container.focus({ preventScroll: true })
      }

      // 其它普通点击（点到了未覆盖的节点 / 点选区内节点准备拖动 / 已选中组合的整组拖动）→ 放行，交给 X6
    }

    const onMouseUp = (e: MouseEvent) => {
      // 空格平移模式：不放行，避免误吞 Panning 的 mouseup
      if (this.spaceDown) return
      // 仅当我们已在 mousedown 接管时，才吞掉配对的 mouseup，避免插件二次切换
      if (handled) {
        handled = false
        e.stopPropagation()
      }
    }

    this.container.addEventListener('mousedown', onMouseDown, true)
    this.container.addEventListener('mouseup', onMouseUp, true)
  }

  /**
   * 组合成员的"整组拖拽"（仅 Alt 修饰键触发）：成员本身保持在选中态（点击可选中/编辑），
   * 位移却落到最外层容器上。
   *
   * 为什么不能交给 X6 原生拖拽：X6 拖的是 mousedown 命中的那个节点，命中成员就只会平移成员，
   * 组合就散了；而容器 `translate` 会递归带动全部子节点，这才是"整组移动"。
   *
   * 实现要点：
   * - 坐标用 `graph.clientToLocal` 换算，天然跟随画布缩放/平移，无需手动算 zoom。
   * - 用「目标位置 − 当前实际位置」做增量 `translate`，规避 X6 位置取整带来的累积漂移。
   * - 越过阈值才真正开始移动，并整段包在一个 batch 里 → 一次拖动只产生一条撤销记录；
   *   纯点击（未越过阈值）不开 batch，不会污染 Undo 栈。
   * - 拖拽期间用 `groupDragging` 压制 `refitParent`，否则容器 translate 递归带动子节点触发
   *   `fitContainer` 重算包围盒，会把刚移好的容器位置覆盖掉（表现为"拖不动"）。
   */
  private beginGroupDrag(container: Node, startClientX: number, startClientY: number): void {
    const g = this.graph
    if (!g) return
    // 兜底：上一次拖拽若异常未清理（如 mouseup 丢失），先收尾，避免 batch 悬挂
    this.groupDragCleanup?.()

    let started = false
    let finished = false
    const startPos = { x: 0, y: 0 }

    const finish = () => {
      if (finished) return
      finished = true
      this.groupDragging = false
      this.setSnappedGuide(null) // 清除参考线吸附高亮
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', finish)
      if (started) g.stopBatch('move-group')
      if (this.groupDragCleanup === finish) this.groupDragCleanup = null
    }

    const onMove = (ev: MouseEvent) => {
      const gg = this.graph
      if (!gg || finished) return
      // 鼠标已松开（某些情况下 mouseup 丢失）→ 结束
      if (ev.buttons === 0) {
        finish()
        return
      }
      if (!started) {
        // 阈值判定：纯点击不做任何移动
        if (
          Math.abs(ev.clientX - startClientX) < GraphEditor.MOVE_THRESHOLD &&
          Math.abs(ev.clientY - startClientY) < GraphEditor.MOVE_THRESHOLD
        ) {
          return
        }
        const p = container.getPosition()
        startPos.x = p.x
        startPos.y = p.y
        started = true
        gg.startBatch('move-group') // 整段拖动 = 一条撤销记录
      }
      const from = gg.clientToLocal(startClientX, startClientY)
      const to = gg.clientToLocal(ev.clientX, ev.clientY)
      const dx = to.x - from.x
      const dy = to.y - from.y
      if (dx === 0 && dy === 0) return
      const cur = container.getPosition()
      // 整组平移：先压制 refitParent —— 容器 translate 会递归带动子节点，
      // 每个子节点 emit change:position 会触发 fitContainer 重算容器包围盒，
      // 把刚移好的容器位置覆盖掉（表现为"拖不动"）。整组移动时子节点与容器同位移，
      // 包围盒关系天然不变，无需重算。
      // 参考线吸附：用容器当前 bbox 算最小吸附位移，叠加到本次位移上（整组拖走的是容器，成员跟随）。
      const bbox = container.getBBox()
      const snap = this.computeGuideSnapDelta(bbox)
      this.setSnappedGuide(snap.hitId)
      this.groupDragging = true
      try {
        container.translate(
          startPos.x + dx - cur.x + snap.dx,
          startPos.y + dy - cur.y + snap.dy,
        )
      } finally {
        this.groupDragging = false
      }
    }

    this.groupDragCleanup = finish
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', finish)
  }

  /**
   * 取屏幕坐标下最上层的节点（跳过选中框等覆盖层）。
   *
   * 不能用 `graph.findViewsFromPoint`：它按 cell 的 bbox 命中，且用的是**画布局部坐标**；
   * 这里要的是"视觉上最顶的那个节点"，所以直接问浏览器要该点的元素栈，
   * 从最上层往下找第一个能映射到 cell view 的元素。
   */
  private findNodeAtClientPoint(clientX: number, clientY: number): Node | null {
    const g = this.graph
    if (!g) return null
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      // 选中框 / 选中内容层只是覆盖物，不是节点本体
      if (el.closest('.x6-widget-selection')) continue
      const cell = g.findViewByElem(el)?.cell
      if (cell && cell.isNode()) return cell
    }
    return null
  }

  /**
   * 把 Transform 变换框同步到"当前选择"，供自研指针选中在改选后手动调用。
   *
   * ⚠️ 为什么必须手动同步：X6 的 Transform 插件**只监听 `graph` 上的 `node:click`**
   * （显示/迁移变换框）与 `blank:mousedown`（清空）。我们为了穿透选中框覆盖层，
   * 在**捕获阶段** `stopPropagation` + `preventDefault`，原生 `node:click` 因此不会合成。
   * 结果就是「Selection 的橙色框已经切到新节点，但黑色变换框（缩放/旋转手柄）仍停在上一个
   * 节点」——用户看到的就是"点了但没选中"（正是本 bug）。
   *
   * 直接用插件的公开 API 补齐：
   * - 恰好选中 1 个节点 → `createWidget(node)`（内部会先 clearWidgets 再建，等价于原生 node:click）
   * - 多选 / 空选 → `clearWidgets()`（多选不做单节点变换，空选自然无框）
   *
   * 不要用 `g.trigger('blank:mousedown')` 来清空：Selection 插件也监听它，会把选区一并清掉。
   */
  private syncTransformWidget(): void {
    const g = this.graph
    const plugin = this.transformPlugin
    if (!g || !plugin) return
    const selectedNodes = g.getSelectedCells().filter((c) => c.isNode())
    if (selectedNodes.length === 1) {
      plugin.createWidget(selectedNodes[0] as Node)
    } else {
      plugin.clearWidgets()
    }
  }

  /** 初始化 Dnd：负责左侧节点 → 画布的拖放 */
  private initDnd(): void {
    const g = this.graph
    if (!g) return

    this.dnd = new Dnd({
      target: g,
      // 拖拽预览保持原始尺寸，不随画布缩放放大缩小
      scaled: false,
      // 拖动的只是一个"影子"，真正落图的是它的克隆
      getDragNode: (node) => node.clone(),
      getDropNode: (draggingNode) => {
        const dropped = draggingNode.clone()
        this.pendingDropId = dropped.id
        return dropped
      },
    })

    // 拖出来的节点自动选中，属性面板立即可用
    g.on('node:added', ({ node }) => {
      if (this.pendingDropId && node.id === this.pendingDropId) {
        this.pendingDropId = null
        // 文字节点：落图后立即按文字内容自适应宽高（保持落点中心，见 fitTextNode 注释）
        if (this.isTextNode(node)) this.fitTextNode(node)
        g.cleanSelection()
        g.select(node)
        // ⚠️ 拖入后必须同步变换框：X6 的 Transform 只认 node:click，而拖入是
        // g.select 直接建选区、没有点击，黑色变换框（缩放/旋转手柄）不会自动出现；
        // 且选中后覆盖层 .x6-widget-selection-box（pointer-events:auto）盖住节点，
        // 后续点击也合成不了 node:click → 用户看到「高亮但点击不变选中」。
        // 这里手动补齐，让拖入即刻进入完整选中态（橙框 + 黑框）。
        this.syncTransformWidget()
      }
    })
  }

  /** 左侧面板按下时调用：创建源节点并交给 Dnd 接管后续拖拽 */
  startDragCreate(item: PaletteItem, e: MouseEvent): void {
    const g = this.graph
    if (!g || !this.dnd) return
    // createNode 只创建不落图，落图由 Dnd 在鼠标释放时完成
    this.dnd.start(g.createNode(item.meta), e)
  }

  /** 观察容器尺寸变化（三栏布局下必须，window.resize 覆盖不到侧栏展开/收起） */
  private observeContainer(): void {
    if (typeof ResizeObserver === 'undefined') return
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(this.container)
  }

  /**
   * 空格手势守卫：按住空格 = 平移画布，此时不能同时触发框选。
   *
   * 为什么需要：X6 的框选允许判定 `allowRubberband(e, true)` 在严格模式下只检查
   * ctrl/shift/alt/meta 四个修饰键（内部把 `spaceKey` 强制置 false），空格不在检查范围内，
   * 于是"空格 + 左键拖"会同时启动平移和 rubberband，画布在动、蓝色选框也在画。
   * 而 Panning 只认 `modifiers: ['space']`，两者互不知情、无法靠配置互斥
   * （Selection 自带的 resolvePanningSelectionConflict 只比较 eventTypes/modifiers，这里不命中）。
   *
   * 解法：按住空格期间临时 `disableRubberband()`，松开恢复。平移逻辑不受影响
   * （Panning 的启动条件只看自己，与框选是否可用无关）。
   */
  private bindSpaceRubberbandGuard(): void {
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' '
    // 在输入框里敲空格（如属性面板改名称）不该改动框选状态
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el || !el.tagName) return false
      const tag = el.tagName.toUpperCase()
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSpace(e) || isTyping(e.target)) return
      if (this.spaceDown) return
      this.spaceDown = true
      // 关闭框选：避免「空格平移」与「橡皮筋框选」同时发生
      this.selectionPlugin?.disableRubberband()
      // 关闭画布交互（节点拖拽/选中）：让落在节点/组合上的 mousedown 变 unhandled，
      // X6 Panning 插件才会接管整幅画布平移（否则节点拖拽把 mousedown 吃掉，平移不触发）
      const g = this.graph
      if (g) {
        this.prevInteracting = g.options.interacting
        g.options.interacting = false
        g.container.classList.add('space-pan')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isSpace(e)) return
      this.endSpacePan()
    }
    // 空格按住时切走窗口，keyup 收不到 → 失焦时兜底恢复，否则框选/交互会一直失效
    const onBlur = () => this.endSpacePan()

    // 拖拽进行中切到「抓手抓取态」视觉（grab → grabbing）
    const onGrabDown = (e: MouseEvent) => {
      if (this.spaceDown && e.button === 0) this.graph?.container.classList.add('space-pan-grabbing')
    }
    const onGrabUp = () => this.graph?.container.classList.remove('space-pan-grabbing')

    // 捕获阶段监听：早于 Keyboard 插件等内部监听，避免被中途 stopPropagation 吃掉
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mousedown', onGrabDown, true)
    document.addEventListener('mouseup', onGrabUp, true)

    this.spaceGuardCleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousedown', onGrabDown, true)
      document.removeEventListener('mouseup', onGrabUp, true)
      this.endSpacePan()
    }
  }

  /** 结束空格平移模式：恢复框选、恢复 interacting、清除手型样式（幂等） */
  private endSpacePan(): void {
    if (!this.spaceDown) return
    this.spaceDown = false
    this.selectionPlugin?.enableRubberband()
    const g = this.graph
    if (g) {
      g.options.interacting = this.prevInteracting as typeof g.options.interacting
      g.container.classList.remove('space-pan', 'space-pan-grabbing')
    }
  }

  /** 注册所有 X6 插件 */
  private registerPlugins(): void {
    if (!this.graph) return

    // 框选插件：rubberband 默认仅在空白处触发，拖节点时不会误拉框选中其他元素
    this.selectionPlugin = new Selection({
      enabled: true,
      rubberband: true,
      multiple: true,
      showNodeSelectionBox: true,
      multipleSelectionModifiers: ['ctrl', 'meta'],
    })
    this.graph.use(this.selectionPlugin)

    // 对齐线插件：拖拽/缩放节点时，离其它节点的边或中心在 tolerance 像素内
    // 即自动对齐并画出对齐虚线（即"节点之间的间距吸附"）
    this.graph.use(new Snapline({
      enabled: true,
      sharp: true,
      tolerance: 10,          // 吸附触发距离（像素）：越大越容易吸附，默认 4
      resizing: true,          // 调整大小时也启用对齐
    }))

    // Transform 插件：节点缩放与旋转
    // ⚠️ 预览模式下 resizing / rotating 全部关闭，彻底禁掉"拖动放大(缩放)"与"旋转"手柄
    this.transformPlugin = new Transform({
        resizing: {
          enabled: !this.preview,
          // minWidth: 4,
          // minHeight: 4,
          orthogonal: true,
          restrict: false,
          preserveAspectRatio: false,
          // 直线墙的「高 = 墙厚」：拖上下手柄不该改墙厚（否则和 L 形墙的臂宽对不齐），
          // 墙厚唯一入口是面板「墙厚」。函数值按节点解析，钳制到当前高度即锁死。
          minHeight: (node: Node) =>
            node.shape === SHAPE_WALL_LINE ? node.getSize().height : 0,
          maxHeight: (node: Node) =>
            node.shape === SHAPE_WALL_LINE ? node.getSize().height : 0,
        },
        rotating: {
          enabled: !this.preview,
        },
    })
    this.graph.use(this.transformPlugin)

    // 键盘插件：仅在画布聚焦时响应，避免与 snapline 冲突
    this.graph.use(
      new Keyboard({
        enabled: true,
        global: false,
      }),
    )

    // 复制粘贴
    this.graph.use(
      new Clipboard({
        enabled: true,
      }),
    )

    // 撤销与重做
    this.graph.use(
      new History({
        enabled: true,
      }),
    )
  }

  /** 绑定快捷键：删除、撤销/重做、复制/粘贴、全选 */
  private bindShortcuts(): void {
    const g = this.graph
    if (!g) return

    // 走 removeSelected，保证删组合时成员一起删掉（递归删除）
    g.bindKey('delete', () => this.removeSelected())
    // Backspace 与 Delete 同义（X6 输入框内会自行忽略，不会误删文字）
    g.bindKey('backspace', () => this.removeSelected())

    g.bindKey(['ctrl+z', 'command+z'], () => g.undo())

    g.bindKey(['ctrl+shift+z', 'command+shift+z'], () => g.redo())

    // 走 copySelected / paste：组合会被整体复制、粘贴后保持成组
    g.bindKey(['ctrl+c', 'command+c'], () => this.copySelected())

    g.bindKey(['ctrl+v', 'command+v'], () => this.paste())

    g.bindKey(['ctrl+a', 'command+a'], (e) => {
      e.preventDefault()
      g.select(g.getCells())
    })

    // 视图缩放快捷键走原生监听（见 bindZoomShortcuts），避免 X6 键名解析对 "+" 的歧义
    this.bindZoomShortcuts()
  }

  /**
   * 缩放快捷键：Ctrl/Cmd + 0 重置缩放(100%)、Ctrl/Cmd + - 缩小、Ctrl/Cmd + + 放大。
   * 用原生 document 捕获监听而非 X6 bindKey：X6 的键名解析会把 "+" 归一成 "="/shift，
   * 对主键盘 Shift+= 与小键盘 + 的命中不稳定；原生监听直接读 event.key/code，覆盖两种 "+"。
   * - 输入框（属性面板等）内不干预，避免误触；
   * - 命中后 preventDefault，阻止浏览器自身的页面缩放。
   */
  private bindZoomShortcuts(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return // 输入框内不干预
      }

      let command: TransformCommand | null = null
      if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
        command = 'zoomTo' // 重置为 100%
      } else if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
        command = 'zoomOut' // 缩小 -0.2
      } else if (
        e.key === '+' ||
        e.key === '=' ||
        e.code === 'Equal' ||
        e.code === 'NumpadAdd'
      ) {
        command = 'zoomIn' // 放大 +0.2（主键盘 = 或 Shift+=，小键盘 +）
      }
      if (!command) return

      e.preventDefault()
      this.transform(command)
    }

    document.addEventListener('keydown', onKeyDown, true) // 捕获阶段，早于其它监听
    this.zoomGuardCleanup = () => document.removeEventListener('keydown', onKeyDown, true)
  }

  /**
   * 方向键微移选中节点
   * - 默认每次移动 10px，按住 Shift 精细移动 1px
   * - 走 batchUpdate，一次移动只产生一条撤销记录（撤销一次整体回退）
   */
  private bindArrowKeys(): void {
    const g = this.graph
    if (!g) return

    const move = (dx: number, dy: number) => (e: KeyboardEvent) => {
      // 默认：移动"选中的节点本身"（点谁选谁、拖谁动谁）；
      // 按住 Alt：移动"最外层组容器"（整组移动，与 Alt+拖动 语义一致）。
      const useWholeGroup = e.altKey
      const targets = this.resolveArrowTargets(useWholeGroup)
      if (targets.length === 0) return

      e.preventDefault() // 阻止方向键滚动页面

      const step = e.shiftKey ? GraphEditor.STEP_FAST : GraphEditor.STEP
      // 整组移动（Alt）时，容器 translate 会递归带动子节点，每个子节点 emit change:position
      // 触发 refitParent 重算容器包围盒、把刚移好的位置覆盖掉（表现同拖拽"拖不动"），
      // 故用 groupDragging 标记压制 refitParent；单成员移动则相反，需要容器跟随重算。
      if (useWholeGroup) this.groupDragging = true
      try {
        g.batchUpdate(() => {
          targets.forEach((t) => t.translate(dx * step, dy * step))
        })
      } finally {
        if (useWholeGroup) this.groupDragging = false
      }
    }

    // X6 Keyboard 插件按「按键 + 精确修饰键集合」匹配：绑定 'up' 只在无修饰键时触发，
    // 按住 Shift / Alt 时事件修饰键集合变为 ['shift'] / ['alt']，与空集合不等 → 回调不触发。
    // 故同方向需同时绑定 plain / shift+ / alt+ 三种写法（回调内部自行读 e.shiftKey / e.altKey）。
    const dirs: Array<[string, number, number]> = [
      ['up', 0, -1],
      ['down', 0, 1],
      ['left', -1, 0],
      ['right', 1, 0],
    ]
    dirs.forEach(([name, dx, dy]) => {
      const handler = move(dx, dy)
      g.bindKey(name, handler)
      g.bindKey('shift+' + name, handler)
      g.bindKey('alt+' + name, handler)
    })
  }

  /**
   * 计算方向键实际要平移的节点集合。
   * - useWholeGroup=false：移动"选中的节点本身"，但去掉"祖先也已选中"的节点，
   *   避免橡皮筋把容器和成员一起选中时，容器与成员都被 translate 而导致成员双重移动。
   * - useWholeGroup=true：移动各选中节点所属的"最外层组容器"（整组移动）。
   */
  private resolveArrowTargets(useWholeGroup: boolean): Node[] {
    const g = this.graph
    if (!g) return []
    const selected = g.getSelectedCells().filter((c) => c.isNode()) as Node[]
    if (selected.length === 0) return []
    const raw: Node[] = useWholeGroup
      ? Array.from(new Set(selected.map((n) => this.findOuterGroup(n) as Node)))
      : selected
    const idSet = new Set(raw.map((t) => t.id))
    // 去掉"祖先已在同一集合内"的节点：容器与其成员同时被选中时，只平移容器一侧
    return raw.filter((t) => {
      const ancestors = t.getAncestors()
      return !ancestors.some((a) => idSet.has(a.id))
    })
  }

  /** hover 任意成员时，整组高亮（让隐形容器的描边显现） */
  private bindGroupHover(): void {
    const g = this.graph
    if (!g) return

    g.on('node:mouseenter', ({ node }) => {
      if (this.preview) return // 预览模式不做整组高亮
      if (this.hoverTimer !== null) {
        clearTimeout(this.hoverTimer)
        this.hoverTimer = null
      }
      this.setGroupHighlight(this.findGroupParent(node)?.id ?? null)
    })

    g.on('node:mouseleave', () => {
      // 延迟清除：组内节点之间移动会 leave→enter，避免高亮闪烁
      if (this.hoverTimer !== null) clearTimeout(this.hoverTimer)
      this.hoverTimer = window.setTimeout(() => {
        this.setGroupHighlight(null)
        this.hoverTimer = null
      }, 50)
    })
  }

  /** 找到节点所属的组容器（自身是容器则返回自身） */
  private findGroupParent(node: Node): Node | null {
    if ((node.getChildren() ?? []).length > 0) return node
    const p = node.getParent()
    return p && p.isNode() ? p : null
  }

  /** 是否为组合容器（隐形父节点，data.isGroup = true） */
  private isGroupContainer(node: Node): boolean {
    return !!node.getData()?.isGroup
  }

  /**
   * 组合容器的"刚性跟随"：
   * - 旋转容器时，X6 默认只转容器本身、子节点不跟转（translate 会递归、rotate 不会）。
   *   这里监听 angle 变化，把增量 delta 应用到「容器内全部后代」绕容器中心旋转，
   *   使整个子树刚性旋转。嵌套组用 rotating 标记屏蔽其自身事件，避免重复旋转。
   * - 子节点尺寸/位置变化时，父容器重新贴合包围盒（修复"节点变大超过包盒时包盒不跟变"）。
   * - 旋转传播期间用 rotating 屏蔽 refit，避免容器在旋转过程中被反复重算尺寸。
   */
  private bindGroupSync(): void {
    const g = this.graph
    if (!g) return

    // 子节点尺寸/位置/角度变化 → 父容器重新贴合（按「旋转后」真实占用计算）
    const refitParent = (changed: Node) => {
      if (this.rotating || this.groupDragging) return
      const parent = changed.getParent()
      if (parent && parent.isNode() && this.isGroupContainer(parent as Node)) {
        const children = (parent as Node).getChildren() ?? []
        if (children.length) this.fitContainer(parent as Node, children)
      }
    }
    g.on('node:change:size', ({ node }) => refitParent(node as Node))
    g.on('node:change:position', ({ node }) => refitParent(node as Node))

    g.on('node:change:angle', ({ node }) => {
      if (this.rotating) return
      const container = node as Node

      // 成员自身被旋转（不是容器）→ 父容器需要按旋转后的占用重新贴合
      if (!this.isGroupContainer(container)) {
        refitParent(container)
        return
      }

      const prev = this.lastAngles.get(container.id)
      if (prev === undefined) {
        // 首次出现，建立角度基线，本次不处理
        this.lastAngles.set(container.id, container.getAngle())
        return
      }
      const cur = container.getAngle()
      let delta = cur - prev
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360
      this.lastAngles.set(container.id, cur)
      if (delta === 0) return

      const center = container.getBBox().getCenter()
      const descendants = container.getDescendants({ deep: true })
      this.rotating = true
      g.batchUpdate(() => {
        descendants.forEach((d) => {
          if (d.isNode()) this.rotateNodeAround(d as Node, delta, center)
        })
      })
      this.rotating = false
      // 同步全部后代基线角度，保证下次增量正确
      this.syncAngleBaseline(container)
    })

    // 节点删除时清理角度基线，避免遗留脏数据
    g.on('cell:removed', ({ cell }) => {
      const clean = (n: Cell) => {
        this.lastAngles.delete(n.id)
        const kids = n.isNode() ? (n as Node).getDescendants({ deep: true }) : []
        kids.forEach((k) => this.lastAngles.delete(k.id))
      }
      clean(cell)
    })
  }

  /** 把容器及其全部后代的当前角度写入基线表 */
  private syncAngleBaseline(container: Node): void {
    const all = [container, ...container.getDescendants({ deep: true })]
    all.forEach((n) => {
      if (n.isNode()) this.lastAngles.set(n.id, (n as Node).getAngle())
    })
  }

  /**
   * 让节点绕**任意点**刚性旋转 delta 度（自身角度同步 +delta）
   *
   * ⚠️ 不能用 X6 的 `node.rotate(delta, { center })`：v3.1.8 源码里
   * `center.rotate(currentAngle - angle, center)` 用的是「当前角度 - 增量」，
   * 只在节点初始角度为 0 时等价于绕点旋转；节点已带角度时转角会偏成
   * `angle - currentAngle`（例如 30° 的节点再转 45°，实际只转 15°）→ 整组错位。
   * 这里自己算：中心绕 center 旋转 delta，再整体设角度。
   */
  private rotateNodeAround(node: Node, delta: number, center: { x: number; y: number }): void {
    const b = node.getBBox()
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const rad = (delta * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const dx = cx - center.x
    const dy = cy - center.y
    const nx = center.x + dx * cos - dy * sin
    const ny = center.y + dx * sin + dy * cos
    // 先设角度（不影响 position），再移动中心到目标落点
    node.rotate(delta)
    node.position(nx - b.width / 2, ny - b.height / 2)
  }

  /** 切换组高亮：显示/隐藏容器的描边与淡填充 */
  private setGroupHighlight(id: string | null): void {
    const g = this.graph
    if (!g) return
    if (this.highlightedId === id) return

    const apply = (cellId: string | null, on: boolean) => {
      if (!cellId) return
      const cell = g.getCellById(cellId)
      if (!cell) return
      cell.attr('body/stroke', on ? GraphEditor.GROUP_HL_STROKE : 'transparent')
      cell.attr('body/fill', on ? GraphEditor.GROUP_HL_FILL : 'transparent')
      if (on) {
        // 旧数据里可能带 rx/ry 圆角，hover 时归零让边框显示直角
        cell.attr('body/rx', 0)
        cell.attr('body/ry', 0)
      }
    }

    apply(this.highlightedId, false)
    this.highlightedId = id
    apply(this.highlightedId, true)
  }

  /** 视图变换：放大、缩小、重置、适配、居中 */
  transform(command: TransformCommand): void {
    const g = this.graph
    if (!g) return // 防空：画布未初始化时不执行

    switch (command) {
      case 'zoomIn':
        g.zoom(0.2)
        break
      case 'zoomOut':
        g.zoom(-0.2)
        break
      case 'zoomTo':
        g.zoomTo(1)
        break
      case 'zoomToFit':
        g.zoomToFit({ padding: 20 }) // 适配时留 20px 边距，不贴边
        break
      case 'centerContent':
        g.centerContent()
        break
    }
  }

  // 撤销
  undo():void {
    const g = this.graph
    if (!g) return
    g.undo()
  }

  // 重做
  redo():void {
    const g = this.graph
    if (!g) return
    g.redo()
  }

  /** 清空画布：移除全部节点与边（背景保留，操作进入历史可撤销） */
  clearCanvas(): void {
    const g = this.graph
    if (!g) return
    if (g.getCellCount() === 0) return // 已是空画布，无需操作
    g.clearCells()
    g.cleanSelection()
  }

  /**
   * 重置画布为空白：清空节点/边、清选区、清撤销栈。
   * 用于切换到「尚无内容」的营地地图（等价于 importJSON 空内容但不依赖外部 JSON）。
   */
  resetCanvas(): void {
    const g = this.graph
    if (!g) return
    g.clearCells()
    g.cleanSelection()
    g.cleanHistory()
  }

  /** 当前画布上的节点与边数量 */
  getCellCount(): number {
    return this.graph ? this.graph.getCellCount() : 0
  }

  /** 当前是否可撤销 */
  canUndo(): boolean {
    return this.graph ? this.graph.canUndo() : false
  }

  /** 当前是否可重做 */
  canRedo(): boolean {
    return this.graph ? this.graph.canRedo() : false
  }

  /** 草稿存储键（localStorage），固定不随文件变化，保证"关掉再开"能命中 */
  private static readonly DRAFT_KEY = 'camp-map-draft'

  /**
   * 导出当前画布为 JSON 字符串（美化格式，便于人工查看与二次编辑）
   * 包含全部节点、边、组合层级以及自定义 attrs / data（如 isTextNode、isGroup）
   */
  exportJSON(): string {
    const g = this.graph
    if (!g) return '[]'
    const data = g.toJSON() as Record<string, unknown>
    // 参考线随画布一并导出（X6 的 fromJSON 只读 cells，guides 为附加字段，旧数据无视）
    data.guides = this.guides
    return JSON.stringify(data, null, 2)
  }

  /**
   * 从 JSON 字符串整体导入画布：用给定数据替换当前全部内容
   * - 解析失败会向外抛错，由调用方（UI）负责提示
   * - 导入后清空选区与撤销栈：把导入结果作为新的基线，
   *   避免"撤销"一下子退回导入前的状态（cleanHistory 同时刷新 Undo/Redo 按钮）
   * - 重新适配视图：导入内容保留原始坐标，必须主动 zoomToFit 才能让内容
   *   落在可视区并居中（zoomToFit 只改视口不改 cell，不会污染撤销栈）
   */
  importJSON(text: string): void {
    const g = this.graph
    if (!g) return
    const data = JSON.parse(text)
    g.fromJSON(data)
    // 文字节点按内容重新自适应：导入/恢复草稿的数据里存的是旧尺寸（默认 120×40 或用户
    // 手动调过的值），不重算就会出现「框比文字大很多、不贴内容」。拖入路径已在 node:added
    // 里 fit，这里补上其余所有加载路径（导入 JSON / 恢复草稿 / 切换地图都走 importJSON）。
    // 放在 zoomToFit 之前：fit 会改节点尺寸，先 fit 再适配视图，内容才紧凑且居中。
    g.getNodes().forEach((node) => {
      if (this.isTextNode(node)) this.fitTextNode(node)
    })
    // 恢复参考线（旧格式无 guides 字段则清空）；graph:transform(zoomToFit) 会触发重绘
    this.guides = Array.isArray(data.guides)
      ? (data.guides as GuideLine[]).filter(
          (gd) => gd && (gd.axis === 'v' || gd.axis === 'h') && typeof gd.pos === 'number',
        )
      : []
    this.renderGuides()
    g.cleanSelection()
    if (g.getCellCount() > 0) g.zoomToFit({ padding: 20 })
    g.cleanHistory()
    // 整体替换画布后统一重置缩放为 100%：importJSON 收尾的 zoomToFit 只是把内容
    // 适配进视口，缩放值随内容大小变化。三条路径（导入 JSON / 恢复草稿 / 切换地图）
    // 都要求重置，下沉到这里统一处理，避免调用方各自补一行而漏掉（导入曾因此漏改）。
    // zoomTo 是视口操作，不进撤销栈，cleanHistory 之后调用不受影响。
    this.transform('zoomTo')
  }

  /**
   * 保存草稿：把当前画布序列化后写入 localStorage（覆盖式）
   * - 与导出 JSON 不同，草稿不下载文件，只存浏览器本地，用于"关掉再开还能找回"
   * - 用紧凑格式（不美化）节省本地存储；外层包一层 { ts, data } 记录保存时间
   * - 存储失败（隐私模式 / 配额满）会向外抛错，由 UI 提示
   * - 返回格式化后的保存时间，供 UI 展示
   */
  saveDraft(): string {
    const g = this.graph
    if (!g) throw new Error('画布尚未初始化')
    const ts = Date.now()
    const payload = JSON.stringify({ ts, data: { ...g.toJSON(), guides: this.guides } })
    try {
      localStorage.setItem(GraphEditor.DRAFT_KEY, payload)
    } catch {
      throw new Error('草稿保存失败：本地存储不可用或已满')
    }
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  }

  /** 是否存在已保存的草稿 */
  hasDraft(): boolean {
    try {
      return localStorage.getItem(GraphEditor.DRAFT_KEY) != null
    } catch {
      return false
    }
  }

  /** 读取草稿的保存时间戳（毫秒），无草稿返回 null */
  getDraftTime(): number | null {
    try {
      const raw = localStorage.getItem(GraphEditor.DRAFT_KEY)
      if (!raw) return null
      const payload = JSON.parse(raw)
      return typeof payload?.ts === 'number' ? payload.ts : null
    } catch {
      return null
    }
  }

  /**
   * 从 localStorage 恢复草稿：整体替换当前画布内容
   * - 复用 importJSON 的"替换 + 适配视图 + 重置缩放为 100% + 清空撤销栈"逻辑
   * - 数据损坏 / 无草稿会向外抛错，由 UI 提示
   */
  loadDraft(): void {
    const g = this.graph
    if (!g) return
    const raw = localStorage.getItem(GraphEditor.DRAFT_KEY)
    if (!raw) throw new Error('没有可用的草稿')
    let payload: { ts: number; data: unknown }
    try {
      payload = JSON.parse(raw)
    } catch {
      throw new Error('草稿数据损坏，无法解析')
    }
    if (!payload || payload.data == null) throw new Error('草稿数据损坏')
    this.importJSON(JSON.stringify(payload.data))
  }

  /**
   * 订阅撤销栈变化（新增/撤销/重做/清空都会触发 history:change）
   * 用于同步 Undo/Redo 按钮的 disabled 状态
   */
  onHistoryChange(cb: () => void): void {
    this.graph?.on('history:change', cb)
  }

  /**
   * 订阅"选区或属性变化"：任何一个都会让右侧属性面板需要刷新
   * - selection:changed：点选/框选变化
   * - node:change:*：拖节点、改尺寸、改 attrs（含属性面板自己的改动回流）
   * - cell:removed：删掉正在编辑的节点
   */
  onNodeChange(cb: () => void): void {
    const g = this.graph
    if (!g) return
    g.on('selection:changed', cb)
    g.on('node:change:position', cb)
    g.on('node:change:size', cb)
    g.on('node:change:attrs', cb)
    // data 变化（房间业务信息编辑）也要刷新面板，否则表单回填的是旧值
    g.on('node:change:data', cb)
    g.on('cell:removed', cb)
  }

  /**
   * 当前选中节点的属性快照
   * 仅**单个**选中时返回（多选、无选中返回 null）——属性面板不支持批量编辑
   */
  getSelectedNodeSnapshot(): NodeSnapshot | null {
    const g = this.graph
    if (!g) return null
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode())
    if (nodes.length !== 1) return null
    const node = nodes[0] as Node
    // 记录面板正在编辑的节点（选区清空时不清空，供 applyNodeProps 兜底，详见字段说明）
    this.lastSelectedNodeId = node.id

    const pos = node.getPosition()
    const size = node.getSize()
    const asNumber = (v: unknown, fallback: number): number =>
      typeof v === 'number' ? v : fallback
    // X6 里可能写 'transparent'/'none'，统一规范成 rgba 供取色器使用
    const asColor = (v: unknown): string =>
      typeof v === 'string' && v !== 'transparent' && v !== 'none' ? v : 'rgba(0, 0, 0, 0)'

    const isLWall = node.shape === SHAPE_WALL_L
    const isWall = isLWall || node.shape === SHAPE_WALL_LINE
    // 墙体是"填充型"图形：直线墙的填充色在 body，L 形墙在两段臂上
    const wallFill = isLWall ? node.attr('vArm/fill') : node.attr('body/fill')

    return {
      id: node.id,
      shape: node.shape,
      isGroup: !!node.getData()?.isGroup,
      isWall,
      isTextNode: this.isTextNode(node),
      // 墙厚：直线墙 = 节点高度，L 形墙 = 臂宽（都是几何量，和 bbox 一致）
      wallThickness: isWall
        ? isLWall
          ? asNumber(node.attr('vArm/width'), WALL_THICKNESS)
          : Math.round(size.height)
        : 4,
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: Math.round(size.width),
      height: Math.round(size.height),
      label: this.readNodeLabel(node),
      // 面积文字：仅编号房间有 area 选择器；其余形状没有，读出来是 undefined → 兜底空串
      areaText: node.shape === SHAPE_ROOM_NUMBER
        ? (typeof node.attr('area/text') === 'string' ? (node.attr('area/text') as string) : '')
        : '',
      // 显示面积：area 选择器未设 display 或 display 非 'none' 即视为显示
      areaVisible: node.shape === SHAPE_ROOM_NUMBER
        ? node.attr('area/display') !== 'none'
        : false,
      // 面积文字字号与颜色：仅编号房间有 area 选择器
      areaFontSize: node.shape === SHAPE_ROOM_NUMBER
        ? asNumber(node.attr('area/fontSize'), 10)
        : 10,
      areaFontFill: node.shape === SHAPE_ROOM_NUMBER
        ? asColor(node.attr('area/fill'))
        : 'rgba(0, 0, 0, 0)',
      // 顶部色条：仅编号房间有 topbar 选择器（默认高度 8、橙红配色）
      topbarHeight: node.shape === SHAPE_ROOM_NUMBER
        ? asNumber(node.attr('topbar/height'), 8)
        : 8,
      // 色条颜色：填充与描边共用一个值，读取以 topbar/fill 为准（二者始终同步）
      topbarColor: node.shape === SHAPE_ROOM_NUMBER
        ? asColor(node.attr('topbar/fill'))
        : 'rgba(0, 0, 0, 0)',
      // 归属公司：编号房间才可能有；存在 node.data.roomOwnership（选中归属编码），否则 null
      roomOwnership: node.shape === SHAPE_ROOM_NUMBER
        ? ((node.getData()?.roomOwnership as number | undefined) ?? null)
        : null,
      fill: asColor(wallFill),
      // 墙体填充实色、无描边，描边相关字段对墙不适用
      stroke: isWall ? 'rgba(0, 0, 0, 0)' : asColor(node.attr('body/stroke')),
      strokeWidth: isWall ? 0 : asNumber(node.attr('body/strokeWidth'), 1),
      strokeStyle: isWall ? 'solid' : readStrokeStyle(node.attr('body/strokeDasharray')),
      fontSize: this.readNodeFontSize(node),
      fontFill: asColor(node.attr('label/fill') ?? node.attr('text/fill')),
      // 加粗：label/text 两条路径都查，fontWeight ≥ 600 视为加粗
      fontBold: this.readNodeFontBold(node),
      // 圆角大小：body 的 rx（ry 与此同值），所有形状都读取、无圆角形状兜底 0
      cornerRadius: asNumber(node.attr('body/rx'), 0),
      // 事件开关：来自 node.data.events（预览交互总开关），缺省关闭
      events: this.readNodeEvents(node),
      // 房间业务信息：来自 node.data.room（预览弹框的数据源，可在面板编辑）
      room: this.readRoomInfo(node),
    }
  }

  /**
   * 读取节点的房间业务信息
   * 数据存放于 `node.data.room`，缺字段一律补空值（弹框按"未填写"渲染占位符），
   * 避免面板/弹框拿到 undefined 导致渲染异常。
   */
  private readRoomInfo(node: Node): RoomInfo {
    const data = node.getData() as { room?: Partial<RoomInfo> } | undefined
    const raw = (data?.room ?? {}) as Partial<RoomInfo>
    const base = createRoomInfo()
    const str = (v: unknown): string => (typeof v === 'string' ? v : '')
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null
    return {
      ...base,
      roomNo: str(raw.roomNo),
      roomId: num(raw.roomId),
      locationId: num(raw.locationId),
      zoneId: num(raw.zoneId),
      campId: num(raw.campId),
      allocated: !!raw.allocated,
      camp: str(raw.camp),
      zone: str(raw.zone),
      building: str(raw.building),
      category: str(raw.category),
      status: str(raw.status),
      ipPhoneExt: str(raw.ipPhoneExt),
      musterPoint: str(raw.musterPoint),
      safeLocker: str(raw.safeLocker),
      checkIn: str(raw.checkIn),
      checkOut: str(raw.checkOut),
      rotatorOnly: !!raw.rotatorOnly,
      fullName: str(raw.fullName),
      position: str(raw.position),
      department: str(raw.department),
      company: str(raw.company),
      reserveCompany: str(raw.reserveCompany),
      reserveColor: str(raw.reserveColor),
      rotationPattern: str(raw.rotationPattern),
      bindPax: str(raw.bindPax),
      remark: str(raw.remark),
    }
  }

  /**
   * 写入指定节点的房间业务信息（按 id，不依赖选中状态）。
   * 预览弹框的「Confirm Room / Remove Binding」用它做本地演示反馈：
   * 只改 node.data.room，不改变画布上的图形。
   */
  setRoomInfo(id: string, patch: RoomPatch): void {
    const g = this.graph
    if (!g) return
    const cell = g.getCellById(id)
    if (!cell || !cell.isNode()) return
    const node = cell as Node
    const data = { ...(node.getData() ?? {}) } as Record<string, unknown>
    data.room = { ...this.readRoomInfo(node), ...patch }
    node.setData(data)
  }

  /**
   * 预览弹框「选房间号绑定」：按接口房间记录把房间信息写入节点。
   * - roomNo 存原始号（唯一性以此为准），节点显示文字写换行版
   * - 详情字段映射与属性面板 onRoomNumberPick 保持一致
   */
  bindRoom(id: string, room: RoomOption): void {
    const g = this.graph
    if (!g) return
    const cell = g.getCellById(id)
    if (!cell || !cell.isNode()) return
    const node = cell as Node
    g.batchUpdate(() => {
      // 两条路径都写：room-number 的 markup 文字元素是 selector:'label'（真正渲染靠 label/text），
      // text/text 是 X6 Base 的 canonical 路径（属性面板也写它），两条都写才不会因 shape 差异漏渲染。
      const displayText = formatRoomNoForDisplay(room.roomNumber)
      node.attr('label/text', displayText)
      node.attr('text/text', displayText)
      const data = { ...(node.getData() ?? {}) } as Record<string, unknown>
      data.room = {
        ...this.readRoomInfo(node),
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
      }
      node.setData(data)
    })
  }

  /**
   * 预览弹框「解除绑定」：清空房间号与详情，并把节点显示文字清成空。
   * 与属性面板 onClearRoom 语义一致；清文字用两条 attrs 路径兜底（text / label）。
   */
  unbindRoom(id: string): void {
    const g = this.graph
    if (!g) return
    const cell = g.getCellById(id)
    if (!cell || !cell.isNode()) return
    const node = cell as Node
    g.batchUpdate(() => {
      node.attr('text/text', '')
      node.attr('label/text', '')
      const data = { ...(node.getData() ?? {}) } as Record<string, unknown>
      // 整块重置为空白房间信息：截图要求解除绑定后所有详情字段都回到占位符
      data.room = createRoomInfo()
      node.setData(data)
    })
  }

  /** 按 id 读取节点房间信息（供预览弹框在绑定/解绑后回读画布最新数据） */
  getRoomInfo(id: string): RoomInfo {
    const g = this.graph
    if (!g) return createRoomInfo()
    const cell = g.getCellById(id)
    if (!cell || !cell.isNode() || !this.isRoomNode(cell as Node)) return createRoomInfo()
    return this.readRoomInfo(cell as Node)
  }

  /**
   * 画布上已被分配的房间号集合（roomNo 非空）。
   * 供属性面板的 roomNumber 下拉禁用「已被其它节点占用」的号。
   * @param excludeNodeId 排除指定节点（编辑自身时，自身当前占用的号仍应可选）
   */
  getAssignedRoomNumbers(excludeNodeId?: string): Set<string> {
    const g = this.graph
    const set = new Set<string>()
    if (!g) return set
    g.getNodes().forEach((node) => {
      if (node.id === excludeNodeId) return
      const no = this.readRoomInfo(node).roomNo.trim()
      if (no) set.add(no)
    })
    return set
  }

  /**
   * 校验画布内 roomNumber 唯一性（原始值 roomNo，空值跳过）。
   * @returns 重复的房间号数组（每个号只出现一次）；空数组表示校验通过
   */
  validateRoomNumbers(): string[] {
    const g = this.graph
    if (!g) return []
    const seen = new Map<string, number>()
    g.getNodes().forEach((node) => {
      const no = this.readRoomInfo(node).roomNo.trim()
      if (!no) return
      seen.set(no, (seen.get(no) ?? 0) + 1)
    })
    return Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([no]) => no)
  }

  /**
   * 订阅预览模式下的节点点击 / 悬停（用于交互反馈）。
   * 预览已 `interacting=false`（节点不可拖拽），但 X6 的 `node:click` / `node:mouseenter`
   * 不受影响，因此交互只"看"、不会改变画布内容。
   *
   * 交互由「事件开关」驱动，但房间节点例外：
   * - 房间：一律可点击弹框、可悬停高亮；弹框样式由 allocated 决定
   *   （未分配 → Confirm Room Allocation；已分配 → ROOM DETAILS），外观不随状态改变。
   * - 非房间：仅当对应「点击事件 / hover 事件」开关开启时才响应。
   */
  onNodeClickInPreview(cb: (payload: PreviewNodeClick) => void): void {
    const g = this.graph
    if (!g || !this.preview) return
    g.on('node:click', ({ node }) => {
      if (this.isGroupContainer(node)) return
      if (this.isRoomNode(node)) {
        cb({
          id: node.id,
          shape: node.shape,
          label: this.readNodeLabel(node),
          isRoom: true,
          isText: false,
          room: this.readRoomInfo(node),
        })
        return
      }
      // 非房间节点：仅当「点击事件」开关开启时，点击弹简洁信息卡
      if (!this.readNodeEvents(node).click) return
      cb({
        id: node.id,
        shape: node.shape,
        label: this.readNodeLabel(node),
        isRoom: false,
        isText: this.isTextNode(node),
        room: createRoomInfo(),
      })
    })
    g.on('node:mouseenter', ({ node }) => {
      if (this.isGroupContainer(node)) return
      if (this.isRoomNode(node)) {
        // 房间：一律可交互（pointer + 高亮），不因分配状态改变外观
        this.setRoomCursor(node, 'pointer')
        this.setPreviewHover(node, true)
        return
      }
      // 非房间：仅当「hover 事件」开关开启时，悬停高亮 + pointer
      const hover = this.readNodeEvents(node).hover
      this.setRoomCursor(node, hover ? 'pointer' : 'default')
      if (hover) this.setPreviewHover(node, true)
    })
    g.on('node:mouseleave', ({ node }) => {
      if (this.isGroupContainer(node)) return
      this.setRoomCursor(node, 'default')
      this.setPreviewHover(node, false)
    })
  }

  /**
   * Reception 页专用：只订阅房间节点的 hover，回抛房号/分类/屏幕坐标。
   * - 仅房间节点触发（非房间无 hover 效果），pointer 光标 + 高亮复用预览态样式。
   * - 鼠标离开回抛 null，供页面隐藏卡片。
   * - 只读：只加/移除视图 class 与光标，不写节点数据、不触发选择。
   */
  onRoomHover(cb: (payload: RoomHoverPayload | null) => void): void {
    const g = this.graph
    if (!g || !this.preview) return
    g.on('node:mouseenter', ({ node }: { node: Node }) => {
      if (!this.isRoomNode(node)) return
      this.setRoomCursor(node, 'pointer')
      this.setPreviewHover(node, true)
      const room = this.readRoomInfo(node)
      // 节点视图根元素的屏幕矩形（<g> 的 getBoundingClientRect 即 CSS 像素、相对视口）
      const view = g.findViewByCell(node)
      const el = view?.container as SVGElement | undefined
      const r = el?.getBoundingClientRect?.()
      cb({
        id: node.id,
        roomNo: room.roomNo,
        category: room.category,
        rect: r
          ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
          : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
      })
    })
    g.on('node:mouseleave', ({ node }: { node: Node }) => {
      if (!this.isRoomNode(node)) return
      this.setRoomCursor(node, 'default')
      this.setPreviewHover(node, false)
      cb(null)
    })
  }

  /**
   * RoomAllocate 页专用：加载后一次性给所有房间节点打「可分配 / 不可分配」状态 class。
   * - 可分配：`room-allocatable`（黄色高亮 + pointer 光标）
   * - 不可分配：`room-not-allocatable`（灰化 + not-allowed 光标）
   * 状态色持续显示（对齐图1：27 号常亮黄、其余常灰），非 hover 临时效果。
   * 样式只加在视图 <g> 的 class 上，不写节点数据；应在 loadJSONForPreview 之后调用。
   */
  markAllocationStates(isAllocatable: (label: string, nodeId: string) => boolean): void {
    const g = this.graph
    if (!g) return
    const rooms = g.getNodes().filter((n) => this.isRoomNode(n))
    rooms.forEach((node) => {
      const label = this.readNodeLabel(node).trim()
      const ok = isAllocatable(label, node.id)
      this.setAllocationClass(node, 'room-allocatable', ok)
      this.setAllocationClass(node, 'room-not-allocatable', !ok)
      // 光标直接设在视图 <g>（子 rect/text 继承），否则挂在容器 div 上无法穿透 SVG
      this.setRoomCursor(node, ok ? 'pointer' : 'not-allowed')
    })
  }

  /**
   * Reception 页专用：给「已入住」房间节点染色（常驻写入节点 attrs，与 hover 无关）。
   * - 已入住（判定回调返回 true）：body/fill = #fcfdbb、label/fill = #b8b6b6
   * - 未入住：保持画布原有外观，不写属性
   * 判定标准由页面提供（复用其客人数据源），避免把"入住"业务定义写死在画布类里。
   * 应在 loadJSONForPreview 之后调用。
   */
  markOccupiedRooms(
    isOccupied: (roomNo: string, nodeId: string, category: string) => boolean,
  ): void {
    const g = this.graph
    if (!g) return
    g.getNodes().forEach((node) => {
      if (!this.isRoomNode(node)) return
      const room = this.readRoomInfo(node)
      if (!isOccupied(room.roomNo, node.id, room.category)) return
      node.attr('body/fill', '#fcfdbb')
      node.attr('label/fill', '#b8b6b6')
    })
  }

  /**
   * RoomAllocate 页专用：订阅房间节点点击。只有可分配节点回抛弹框数据，
   * 灰态（不可分配）与非房间节点点击均不响应。只读，不改画布。
   */
  onRoomClickForAllocation(
    isAllocatable: (label: string, nodeId: string) => boolean,
    cb: (payload: RoomAllocateClickPayload) => void,
  ): void {
    const g = this.graph
    if (!g || !this.preview) return
    g.on('node:click', ({ node }: { node: Node }) => {
      if (!this.isRoomNode(node)) return
      const label = this.readNodeLabel(node).trim()
      if (!isAllocatable(label, node.id)) return
      cb({ id: node.id, label, room: this.readRoomInfo(node) })
    })
  }

  /** 给节点视图根元素 <g> 加/移除分配态 class（不污染节点数据） */
  private setAllocationClass(node: Node, cls: 'room-allocatable' | 'room-not-allocatable', on: boolean): void {
    const g = this.graph
    if (!g) return
    const view = g.findViewByCell(node)
    const el = view?.container as SVGElement | undefined
    if (!el || typeof el.classList?.add !== 'function') return
    if (on) el.classList.add(cls)
    else el.classList.remove(cls)
  }

  /** 是否为房间节点（shape 为 room-number，详情弹框仅对其生效） */
  private isRoomNode(node: Node): boolean {
    return node.shape === SHAPE_ROOM_NUMBER
  }

  /**
   * 设置房间节点悬停光标。直接作用于节点自身的视图根元素（<g>），
   * 其子图形（body/topbar/label/area）会继承该 cursor（X6 未对单元格设置 cursor）。
   * 直接挂在 g.container(外层 div) 上的 cursor 无法穿透 SVG 生效，故必须针对节点视图设置。
   * view 不可用时回退到 g.container。
   */
  private setRoomCursor(node: Node, cursor: string): void {
    const g = this.graph
    if (!g) return
    const view = g.findViewByCell(node)
    const el = (view?.container as HTMLElement | SVGElement | undefined) ?? (g.container as HTMLElement | undefined)
    if (el) el.style.cursor = cursor
  }

  /**
   * 预览态：给节点视图根元素（<g>）加/移除 hover 高亮 class。
   * 高亮样式（drop-shadow 发光）定义在 guides.css 的 .preview-node-hover，
   * 直接作用于 SVG <g> 不污染节点数据，且能穿透到子图形整体发光。
   */
  private setPreviewHover(node: Node, on: boolean): void {
    const g = this.graph
    if (!g) return
    const view = g.findViewByCell(node)
    const el = view?.container as SVGElement | undefined
    if (!el || typeof el.classList?.add !== 'function') return
    if (on) el.classList.add('preview-node-hover')
    else el.classList.remove('preview-node-hover')
  }

  /** 读取文字是否加粗：attrs.label 与 attrs.text 两条路径都查（与字号/颜色一致） */
  private readNodeFontBold(node: Node): boolean {
    const v = node.attr('label/fontWeight') ?? node.attr('text/fontWeight')
    if (typeof v === 'number') return v >= 600
    if (typeof v === 'string') return v === 'bold' || parseInt(v, 10) >= 600
    return false
  }

  /** 读取节点的事件开关；data.events 缺省时返回 { click:false, hover:false } */
  private readNodeEvents(node: Node): NodeEventFlags {
    const data = node.getData() as { events?: Partial<NodeEventFlags> } | undefined
    const raw = data?.events ?? {}
    return { click: !!raw.click, hover: !!raw.hover }
  }

  /** 把属性面板的修改写回选中节点（一次修改 = 一条撤销记录） */
  applyNodeProps(patch: NodePropsPatch): void {
    const g = this.graph
    if (!g) return
    // 优先用当前单选中节点；若此刻没有单选中（例如：面板输入失焦前，画布已被点空白清掉选区），
    // 退回到面板最后编辑的节点（lastSelectedNodeId），避免文字/样式修改因"先清选区"而丢失。
    let node: Node | null = null
    const live = g.getSelectedCells().filter((cell) => cell.isNode())
    if (live.length === 1) {
      node = live[0] as Node
    } else if (this.lastSelectedNodeId) {
      const cell = g.getCellById(this.lastSelectedNodeId)
      if (cell && cell.isNode()) node = cell as Node
    }
    if (!node) return

    g.batchUpdate(() => {
      if (patch.x !== undefined || patch.y !== undefined) {
        const pos = node.getPosition()
        node.position(patch.x ?? pos.x, patch.y ?? pos.y)
      }
      if (patch.width !== undefined || patch.height !== undefined) {
        const size = node.getSize()
        node.size(patch.width ?? size.width, patch.height ?? size.height)
      }

      // 墙厚：直线墙直接改节点高度（高 = 墙厚），L 形墙改两臂宽度
      if (patch.wallThickness !== undefined) {
        const t = Math.max(1, Math.round(patch.wallThickness))
        if (node.shape === SHAPE_WALL_L) {
          node.attr('vArm/width', t)
          node.attr('hArm/height', t)
          // refDy 从右下角算偏移，必须跟着厚度一起改，否则下臂会脱离底边
          node.attr('hArm/refDy', -t)
        } else if (node.shape === SHAPE_WALL_LINE) {
          node.resize(node.getSize().width, t)
        }
      }

      // 通用样式字段（填充/描边/文字/圆角/房间专属等）抽出共用，批量写入也走这里
      this._writeStyleFields(node, patch)
    })

    // 文字节点：文字内容或字号变化时，按新内容重新自适应尺寸
    // （仅在 label/fontSize 改动时触发；手动改宽高的改动不重算，避免覆盖用户意图）
    if ((patch.label !== undefined || patch.fontSize !== undefined) && this.isTextNode(node)) {
      this.fitTextNode(node)
    }
  }

  /**
   * 把通用样式字段写回单个节点（不含 x/y/宽高/墙厚，这些走 position/size API）。
   * 单选 `applyNodeProps` 与多选 `applyMultiStyle` 共用，避免两套写入逻辑分叉。
   */
  private _writeStyleFields(node: Node, patch: NodePropsPatch): void {
    // 填充色：墙体是填充型图形，直接写 fill（L 形墙两段臂都要写）
    if (patch.fill !== undefined) {
      if (node.shape === SHAPE_WALL_L) {
        node.attr('vArm/fill', patch.fill)
        node.attr('hArm/fill', patch.fill)
      } else {
        node.attr('body/fill', patch.fill)
      }
    }
    if (patch.label !== undefined) node.attr('text/text', patch.label)
    // 面积文字：仅编号房间有 area 选择器，写回 attrs/area/text
    if (patch.areaText !== undefined && node.shape === SHAPE_ROOM_NUMBER) {
      node.attr('area/text', patch.areaText)
    }
    // 面积显隐：显示 → display:''（SVG 空串即可见，避免删除属性后回退到 shape 的 display:none 默认值）；
    // 隐藏 → display:'none'。读取端一律按 display !== 'none' 判为显示，二者一致。
    if (patch.areaVisible !== undefined && node.shape === SHAPE_ROOM_NUMBER) {
      node.attr('area/display', patch.areaVisible ? '' : 'none')
    }
    // 面积文字字号与颜色（仅编号房间）
    if (patch.areaFontSize !== undefined && node.shape === SHAPE_ROOM_NUMBER) {
      node.attr('area/fontSize', Math.max(6, Math.round(patch.areaFontSize)))
    }
    if (patch.areaFontFill !== undefined && node.shape === SHAPE_ROOM_NUMBER) {
      node.attr('area/fill', patch.areaFontFill)
    }
    // 顶部色条（仅编号房间）：填充/描边颜色 + 高度；
    // 高度变化联动 label 的 refY2 = 高度/2，让编号文字始终落在色条下方
    if (node.shape === SHAPE_ROOM_NUMBER) {
      // 归属公司：选中后「顶部色条 + 描边」用公司颜色，房间内部填充保持白色
      if (patch.roomOwnership !== undefined) {
        if (patch.roomOwnership === null) {
          // 取消归属：仅解除 data 关联，保留当前已绘制的颜色，允许自定义
          const data = { ...(node.getData() ?? {}) } as Record<string, unknown>
          delete data.roomOwnership
          node.setData(data)
        } else {
          const c: CompanyColor | undefined = getCompanyColorByOwnership(patch.roomOwnership)
          if (c) {
            // 顶部色条 + 描边 用公司颜色；房间内部填充保持白色（不做整块色块）
            node.attr('topbar/fill', c.color)
            node.attr('topbar/stroke', c.color)
            node.attr('body/fill', '#ffffff')
            node.attr('body/stroke', c.color)
            const data = { ...(node.getData() ?? {}) } as Record<string, unknown>
            data.roomOwnership = c.roomOwnership
            node.setData(data)
          }
        }
      }
      // 色条颜色：一个值同时写入填充与描边，二者保持一致
      if (patch.topbarColor !== undefined) {
        node.attr('topbar/fill', patch.topbarColor)
        node.attr('topbar/stroke', patch.topbarColor)
      }
      if (patch.topbarHeight !== undefined) {
        const h = Math.max(0, Math.round(patch.topbarHeight))
        node.attr('topbar/height', h)
        node.attr('label/refY2', h / 2)
      }
    }
    if (patch.stroke !== undefined) node.attr('body/stroke', patch.stroke)
    if (patch.strokeWidth !== undefined) node.attr('body/strokeWidth', patch.strokeWidth)
    if (patch.strokeStyle !== undefined) {
      node.attr('body/strokeDasharray', STROKE_DASH_MAP[patch.strokeStyle])
    }
    if (patch.fontSize !== undefined) node.attr('label/fontSize', patch.fontSize)
    if (patch.fontFill !== undefined) node.attr('label/fill', patch.fontFill)
    // 加粗文字：fontWeight 700（非加粗回到 400）。label/text 两条路径都写，
    // 保证无论文字内容走哪条渲染路径都生效（与 fontSize/fill 的 label/... 写法一致）
    if (patch.fontBold !== undefined) {
      const w = patch.fontBold ? 700 : 400
      node.attr('label/fontWeight', w)
      node.attr('text/fontWeight', w)
    }
    // 圆角大小（房间 / 矩形节点的 body 圆角）：rx 与 ry 同值
    if (patch.cornerRadius !== undefined) {
      const r = Math.max(0, Math.round(patch.cornerRadius))
      node.attr('body/rx', r)
      node.attr('body/ry', r)
    }
    // 房间业务信息（预览弹框内容）：字段级合并进 node.data.room，
    // 保留其它 data（如 isTextNode / isGroup），不影响画布渲染
    if (patch.room !== undefined) {
      const data = { ...(node.getData() ?? {}) } as Record<string, unknown>
      data.room = { ...this.readRoomInfo(node), ...patch.room }
      node.setData(data)
    }
    // 事件开关：字段级合并进 node.data.events（预览交互的总开关）
    if (patch.events !== undefined) {
      const data = { ...(node.getData() ?? {}) } as Record<string, unknown>
      data.events = { ...this.readNodeEvents(node), ...patch.events }
      node.setData(data)
    }
  }

  /**
   * 多选（Ctrl / 框选 ≥2 个节点）时返回批量样式状态。
   * 各属性仅当「所有可应用节点一致」才回填具体值，否则为 undefined（面板显示"混合"）。
   * 返回 null 表示不符合多选条件（0/1 个节点）。
   */
  getMultiStyleState(): MultiStyleState | null {
    const g = this.graph
    if (!g) return null
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode()) as Node[]
    if (nodes.length < 2) return null
    // 剔除隐形组合容器与房间节点：批量样式只作用于可见内容节点，
    // 房间节点的背景/描边由顶部色条与归属公司颜色控制，批量写入会破坏其外观
    const targets = nodes.filter((n) => !this.isGroupContainer(n) && !this.isRoomNode(n))
    if (targets.length === 0) return null

    // 与 getSelectedNodeSnapshot 一致的规范化辅助
    const asNumber = (v: unknown, fallback: number): number =>
      typeof v === 'number' ? v : fallback
    const asColor = (v: unknown): string =>
      typeof v === 'string' && v !== 'transparent' && v !== 'none' ? v : 'rgba(0, 0, 0, 0)'
    const isWallShape = (n: Node) => n.shape === SHAPE_WALL_L || n.shape === SHAPE_WALL_LINE

    const hasTextNode = targets.some((n) => this.isTextNode(n))
    // 背景/描边只对非文字节点有意义（文字节点透明本体）；文字节点从取共享值集合里剔除
    const fillTargets = targets.filter((n) => !this.isTextNode(n))

    // 文字字号 / 颜色：对所有节点（含文字节点）取共享值
    const fontSize = this.readSharedNumber(targets.map((n) => this.readNodeFontSize(n)))
    const fontFill = this.readSharedColor(
      targets.map((n) => asColor(n.attr('label/fill') ?? n.attr('text/fill'))),
    )
    // 背景 / 描边：仅对非文字节点取共享值（墙体的填充按 getSelectedNodeSnapshot 的 wallFill 口径读取）
    const fill = fillTargets.length
      ? this.readSharedColor(
          fillTargets.map((n) =>
            asColor(isWallShape(n) ? (n.attr('vArm/fill') ?? n.attr('body/fill')) : n.attr('body/fill')),
          ),
        )
      : undefined
    const stroke = fillTargets.length
      ? this.readSharedColor(fillTargets.map((n) => asColor(n.attr('body/stroke'))))
      : undefined
    const strokeWidth = fillTargets.length
      ? this.readSharedNumber(fillTargets.map((n) => asNumber(n.attr('body/strokeWidth'), 1)))
      : undefined
    const strokeStyle = fillTargets.length
      ? this.readSharedStroke(fillTargets.map((n) => readStrokeStyle(n.attr('body/strokeDasharray'))))
      : undefined

    return { count: targets.length, hasTextNode, fontSize, fontFill, fill, stroke, strokeWidth, strokeStyle }
  }

  /** 把批量样式写回所有选中（非容器）节点：整批包在一个 batchUpdate → 一条撤销记录 */
  applyMultiStyle(patch: NodePropsPatch): void {
    const g = this.graph
    if (!g) return
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode()) as Node[]
    if (nodes.length < 2) return
    // 剔除隐形组合容器与房间节点：房间背景/描边由顶部色条与归属公司颜色控制，批量写入会破坏外观
    const targets = nodes.filter((n) => !this.isGroupContainer(n) && !this.isRoomNode(n))
    if (targets.length === 0) return

    g.batchUpdate(() => {
      for (const node of targets) {
        // 文字节点：透明本体，背景/描边无意义 → 剥离这四项，只改文字样式
        const p: NodePropsPatch = this.isTextNode(node)
          ? { ...patch, fill: undefined, stroke: undefined, strokeWidth: undefined, strokeStyle: undefined }
          : patch
        this._writeStyleFields(node, p)
      }
    })

    // 文字节点字号变化：按新内容重新自适应尺寸
    if (patch.fontSize !== undefined) {
      for (const node of targets) {
        if (this.isTextNode(node)) this.fitTextNode(node)
      }
    }
  }

  /** 多个取值完全一致时才返回该值，否则返回 undefined（表示"混合"） */
  private readSharedNumber(values: number[]): number | undefined {
    if (values.length === 0) return undefined
    return values.every((v) => v === values[0]) ? values[0] : undefined
  }
  private readSharedColor(values: string[]): string | undefined {
    if (values.length === 0) return undefined
    return values.every((v) => v === values[0]) ? values[0] : undefined
  }
  private readSharedStroke(values: StrokeStyle[]): StrokeStyle | undefined {
    if (values.length === 0) return undefined
    return values.every((v) => v === values[0]) ? values[0] : undefined
  }
  /** 取布尔值共享：全部一致才返回该值，否则 undefined（混合态） */
  private readSharedBoolean(values: boolean[]): boolean | undefined {
    if (values.length === 0) return undefined
    return values.every((v) => v === values[0]) ? values[0] : undefined
  }
  /** 取字符串共享（用于面积文字等）：全部一致才返回该值，否则 undefined（混合态） */
  private readSharedString(values: string[]): string | undefined {
    if (values.length === 0) return undefined
    return values.every((v) => v === values[0]) ? values[0] : undefined
  }

  /**
   * 房间批量样式状态：仅当「全部」选中节点都是编号房间（且不含组合容器）时返回，
   * 否则 null。各属性仅当所有房间一致才回填具体值，否则 undefined（混合态）。
   */
  getRoomStyleState(): MultiRoomStyleState | null {
    const g = this.graph
    if (!g) return null
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode()) as Node[]
    if (nodes.length < 2) return null
    // 严格条件：选区必须"全部是房间节点"，混入组合容器或非房间节点则不可进入房间批量
    const allRooms = nodes.every((n) => this.isRoomNode(n) && !this.isGroupContainer(n))
    if (!allRooms) return null
    const targets = nodes

    const asNumber = (v: unknown, fallback: number): number =>
      typeof v === 'number' ? v : fallback
    const asColor = (v: unknown): string =>
      typeof v === 'string' && v !== 'transparent' && v !== 'none' ? v : 'rgba(0, 0, 0, 0)'

    const roomOwnership = this.readSharedOwnership(
      targets.map((n) => (n.getData()?.roomOwnership as number | undefined) ?? null),
    )
    const fontFill = this.readSharedColor(
      targets.map((n) => asColor(n.attr('label/fill') ?? n.attr('text/fill'))),
    )
    const fontSize = this.readSharedNumber(targets.map((n) => this.readNodeFontSize(n)))
    const topbarHeight = this.readSharedNumber(
      targets.map((n) => asNumber(n.attr('topbar/height'), 8)),
    )
    const areaVisible = this.readSharedBoolean(
      targets.map((n) => n.attr('area/display') !== 'none'),
    )
    const strokeWidth = this.readSharedNumber(
      targets.map((n) => asNumber(n.attr('body/strokeWidth'), 1)),
    )
    const strokeStyle = this.readSharedStroke(
      targets.map((n) => readStrokeStyle(n.attr('body/strokeDasharray'))),
    )
    const width = this.readSharedNumber(targets.map((n) => Math.round(n.getSize().width)))
    const height = this.readSharedNumber(targets.map((n) => Math.round(n.getSize().height)))
    // 面积文字：仅编号房间有 area 选择器；其余读出来是 undefined → 兜底空串
    const areaText = this.readSharedString(
      targets.map((n) =>
        typeof n.attr('area/text') === 'string' ? (n.attr('area/text') as string) : '',
      ),
    )

    return {
      count: targets.length,
      shared: {
        roomOwnership,
        fontFill,
        fontSize,
        topbarHeight,
        areaVisible,
        strokeWidth,
        strokeStyle,
        width,
        height,
        areaText,
      },
    }
  }

  /** 取归属公司编码共享（含 null）：全部一致才返回该值，否则 undefined */
  private readSharedOwnership(values: (number | null)[]): number | null | undefined {
    if (values.length === 0) return undefined
    return values.every((v) => v === values[0]) ? values[0] : undefined
  }

  /** 把房间批量样式写回所有选中的房间节点：整批包在一个 batchUpdate → 一条撤销记录 */
  applyRoomStyle(patch: NodePropsPatch): void {
    const g = this.graph
    if (!g) return
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode()) as Node[]
    if (nodes.length < 2) return
    // 仅作用于房间节点（与 getRoomStyleState 同口径，剔除组合容器）
    const targets = nodes.filter((n) => this.isRoomNode(n) && !this.isGroupContainer(n))
    if (targets.length === 0) return

    g.batchUpdate(() => {
      for (const node of targets) {
        // 复用单选/通用写入逻辑：归属公司→色条+描边颜色、色条高度→联动 label/refY2、
        // 面积显隐→area/display、描边/文字等；房间专属字段已内建判断，写非房间会安全跳过
        this._writeStyleFields(node, patch)
        // 宽高：房间节点有固定几何（矩形）；整批统一尺寸（注意：文字节点按内容自适应，
        // 但房间节点不走 fitTextNode，直接 setSize 即可）
        if (patch.width !== undefined || patch.height !== undefined) {
          const size = node.getSize()
          node.size(patch.width ?? size.width, patch.height ?? size.height)
        }
      }
    })
  }

  /** 判断节点是否标记为"文字节点"（透明本体、按内容自适应） */
  private isTextNode(node: Node): boolean {
    const data = node.getData() as { isTextNode?: boolean } | undefined
    return !!data?.isTextNode
  }

  /**
   * 读取节点文字内容
   * ⚠️ X6 v3 的顶层 label 元数据经 Base 基类 propHooks 转存到 **attrs/text/text**
   *    （shape/base.js：setByPath(others, 'attrs/text/text', label)），
   *    渲染时经 CSS 标签名选择器作用到 <text> 元素；
   *    而 attrs/label/text 是经 markup selector 'label' 的另一条等价路径。
   *    读取必须两条路径都兼容，否则"顶层 label 创建"的节点会读到空串
   */
  private readNodeLabel(node: Node): string {
    const t = node.attr('text/text')
    if (typeof t === 'string') return t
    const l = node.attr('label/text')
    return typeof l === 'string' ? l : ''
  }

  /** 读取字号：attrs.label 与 attrs.text 两条路径都查（Base 默认值在 text 上） */
  private readNodeFontSize(node: Node): number {
    const v = node.attr('label/fontSize') ?? node.attr('text/fontSize')
    return typeof v === 'number' ? v : 14
  }

  /** 读取字体族：同上，兜底用 X6 Base 的默认字体 */
  private readNodeFontFamily(node: Node): string {
    const v = node.attr('label/fontFamily') ?? node.attr('text/fontFamily')
    return typeof v === 'string' ? v : 'Arial, helvetica, sans-serif'
  }

  /**
   * 文字节点自适应：把节点宽高缩放到刚好包裹其渲染文字。
   *
   * 尺寸来源优先级：真实 DOM 的 <text>.getBBox() > 离屏 canvas 估算。
   * - getBBox 与最终渲染同源（含字体/CJK 差异），零误差；canvas 与 SVG 是两套字体度量，
   *   同 "Text content" 14px 时 canvas 82.3 vs SVG 78.6，用 canvas 会把节点撑大几 px。
   * - 拖入落图 / 导入 JSON / 面板改文字字号的当下，view 里的 <text> 可能还没按最新内容
   *   渲染完，此时读到的 bbox 是旧的或读不到 → 先按能读到的做一次，并排到下一帧 DOM
   *   稳定后再用真实 bbox 精确重算一次（pendingTextFitIds 去重，重算帧不再排队）。
   *
   * ⚠️ 不要按 graph zoom 换算：canvas 的 px 与 <text>.getBBox() 都是节点内部局部坐标
   *    （X6 的 zoom 是套在外层的 transform scale，不改节点内字体的局部 px 值），节点
   *    width/height 也是局部坐标，同坐标系直接相加。曾除以 zoom 导致缩放后尺寸错乱。
   *
   * @param retry 是否允许排下一帧重算；重算帧传 false 避免无限递归
   */
  private fitTextNode(node: Node, retry = true): void {
    if (!this.isTextNode(node)) return
    const text = this.readNodeLabel(node)
    const fontSize = this.readNodeFontSize(node)
    const fontFamily = this.readNodeFontFamily(node)

    const { width, height, fromDom } = this.measureTextSize(text, fontSize, fontFamily, node)
    // 没拿到真实 DOM bbox（内容刚变、view 未渲染完）时，下一帧 DOM 稳定后再精确重算一次。
    if (retry && !fromDom && !this.pendingTextFitIds.has(node.id)) {
      this.pendingTextFitIds.add(node.id)
      requestAnimationFrame(() => {
        this.pendingTextFitIds.delete(node.id)
        if (this.graph?.getCellById(node.id) === node) this.fitTextNode(node, false)
      })
    }

    // 宽度：完全贴合文字（pad=0）；高度：文字 bbox 高 + 必要余量。
    // ⚠️ tspan 有 dy=0.3em 下移、且 X6 画布 SVG overflow:hidden，高度取太小会裁掉文字底部，
    //    故高度给字号级的最小余量（约一行 = fontSize），而非死板 24。
    const newWidth = Math.max(width + GraphEditor.TEXT_PAD_X * 2, 1)
    const newHeight = Math.max(height + GraphEditor.TEXT_PAD_Y * 2, Math.round(fontSize * 1.4))

    // ⚠️ 保住节点中心：Dnd 落点把"节点中心"对齐到鼠标，而 X6 resize 默认保持
    // 左上角（origin）不变、只改尺寸。先记旧中心，resize 后再平移回来，落点不丢。
    const oldCenter = node.getBBox().getCenter()
    node.resize(newWidth, newHeight)
    const newCenter = node.getBBox().getCenter()
    if (Math.abs(newCenter.x - oldCenter.x) > 1e-3 || Math.abs(newCenter.y - oldCenter.y) > 1e-3) {
      node.translate(oldCenter.x - newCenter.x, oldCenter.y - newCenter.y)
    }
    // 选中框（Transform widget）不会跟着 resize 自动刷新，多行文字从单行尺寸变高后
    // 会出现"文字竖排溢出、框还是横扁"的错位。这里显式重建一次变换框。
    if (this.graph?.getSelectedCells().includes(node)) this.syncTransformWidget()
  }

  /**
   * 测量文字尺寸。
   * ⚠️ 优先读真实 DOM 里 <text> 的 getBBox()：canvas.measureText 与 SVG 文本渲染
   *    用的是两套字体度量（实测同一 "Text content" 14px sans-serif：canvas 82.3px、
   *    SVG 78.6px），用 canvas 结果会把节点撑大 3~4px，视觉上「文字不贴框」。
   *    getBBox 与最终渲染同源，零误差。node:added / 属性面板改文字时 view 都已渲染，
   *    能直接读到；只有 view 尚未生成（如极端时序）才回退 canvas。
   */
  private measureTextSize(
    text: string,
    fontSize: number,
    fontFamily: string,
    node?: Node,
  ): { width: number; height: number; fromDom: boolean } {
    if (node && this.graph) {
      try {
        const view = node.findView(this.graph)
        const textEl = view?.container?.querySelector('text') as SVGTextElement | null
        // ⚠️ 必须确认这个 <text> 渲染的正是当前文字：面板刚改完 label 时 DOM 可能还是旧内容，
        //    直接读旧 bbox 会算错且误判 fromDom=true。
        // ⚠️ 换行不能丢！X6 把 \n 渲染成多个 <tspan>，textContent 里没有 \n；
        //    旧逻辑用 \s+ 把所有空白（含换行）抹掉后比对，"Text content"（单行）和
        //    "T\ne\nx\nt..."（多行）会被判为同一内容 → 读到旧的单行 bbox 且 fromDom=true
        //    → 跳过 rAF 重测 → 节点保持单行尺寸，多行文字溢出成竖排（用户截图场景）。
        //    正确做法：按 <tspan> 逐行比对，只归一化行内空格，保留行数与行序。
        const normLine = (s: string) => s.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ').trim()
        const wantLines = (text || ' ').split('\n').map(normLine)
        const tspans = textEl ? Array.from(textEl.querySelectorAll('tspan')) : []
        const domLines = tspans.length > 0
          ? tspans.map((t) => normLine(t.textContent ?? ''))
          : [normLine(textEl?.textContent ?? '')]
        const textMatches = domLines.length === wantLines.length &&
          domLines.every((line, i) => line === wantLines[i])
        // 字号也要一致：面板改 fontSize 时文字内容没变，仅比对内容会把"旧字号 DOM"误判为有效，
        // 导致按旧 bbox 设定尺寸（改字号后节点不跟随变宽/变高）。X6 渲染成 font-size="20"。
        const domFontSize = parseFloat(textEl?.getAttribute('font-size') ?? '')
        const fontSizeOk = Number.isNaN(domFontSize) || Math.abs(domFontSize - fontSize) < 0.5
        if (textEl && wantLines.length > 0 && textMatches && fontSizeOk) {
          const bbox = textEl.getBBox()
          if (bbox && bbox.width > 0 && bbox.height > 0) {
            return { width: Math.ceil(bbox.width), height: Math.ceil(bbox.height), fromDom: true }
          }
        }
      } catch {
        // view 未就绪 / getBBox 抛错 → 回退到 canvas 估算（下一帧会重试）
      }
    }
    const lines = (text && text.length ? text : ' ').split('\n')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = `${fontSize}px ${fontFamily}`
      const width = Math.max(...lines.map((l) => ctx.measureText(l || ' ').width))
      const lineHeight = Math.round(fontSize * 1.2)
      const height = Math.max(lineHeight, lines.length * lineHeight)
      return { width: Math.ceil(width), height: Math.ceil(height), fromDom: false }
    }
    // 兜底估算：无法创建 canvas 时退化为字符数 × 字号
    const width = Math.max(
      ...lines.map((l) => (l || ' ').length * fontSize * 0.6),
    )
    const height = Math.max(fontSize * 1.2, lines.length * fontSize * 1.2)
    return { width: Math.ceil(width), height: Math.ceil(height), fromDom: false }
  }

  /**
   * 订阅右键菜单：统一处理"右键节点"与"右键空白"
   * 命中未选中的节点会先选中它，再回抛上下文（不破坏已有选区）
   */
  onContextMenu(cb: (state: ContextMenuState) => void): void {
    const g = this.graph
    if (!g) return

    g.on('node:contextmenu', ({ e, node }) => {
      e.preventDefault() // 阻止浏览器原生右键菜单
      if (this.preview) return // 预览模式不弹编辑菜单
      if (!g.isSelected(node)) g.select(node)
      cb(this.buildMenuState(e.clientX, e.clientY, e.pageX, e.pageY))
    })

    g.on('blank:contextmenu', ({ e }) => {
      e.preventDefault()
      if (this.preview) return // 预览模式不弹编辑菜单
      // 框选后右键空白处：选区仍在，交给 selectedCount 判断显示哪些项
      cb(this.buildMenuState(e.clientX, e.clientY, e.pageX, e.pageY))
    })
  }

  /** 计算右键菜单上下文 */
  private buildMenuState(cx: number, cy: number, px: number, py: number): ContextMenuState {
    const g = this.graph!
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode())
    const p = g.pageToLocal(px, py)

    // 选区里必然混入"隐形组合容器"：橡皮筋框选按几何相交计算，容器包着成员，
    // 框到成员或附近节点时会连容器一起框进来。容器对用户不可见，
    // 所以判定前先把选区拆成两类"单元"：
    //   - 已有组合（容器本身，或成员所属的父容器，按容器 id 去重）→ 各算 1 个单元
    //   - 自由节点（既无父也无子）                              → 各算 1 个单元
    const groups = new Set<Cell>()
    const free: Cell[] = []
    nodes.forEach((n) => {
      if ((n.getChildren() ?? []).length > 0) {
        groups.add(n) // 容器本身
        return
      }
      const parent = n.getParent()
      if (parent) groups.add(parent) // 组成员 → 归并到它所在的组
      else free.push(n)
    })

    const unitCount = groups.size + free.length

    return {
      x: cx,
      y: cy,
      graphX: p.x,
      graphY: p.y,
      selectedCount: nodes.length,
      // 「组合 + 1 个或多个（新节点或组合）」→ 单元数 ≥ 2，允许组合（合并成一个大组）
      canGroup: unitCount >= 2,
      // 只有选区里全是"已分组的东西"（没有自由节点混入）时才显示取消组合
      canUngroup: free.length === 0 && groups.size > 0,
      hasContainer: nodes.some((n) => (n.getChildren() ?? []).length > 0),
      freeCount: free.length,
      groupCount: groups.size,
      unitCount,
      // 删除会递归删掉组内成员，菜单要显示真实删除数量
      removeCount: this.collectDeep(nodes).length,
      canPaste: !g.isClipboardEmpty(),
    }
  }

  /**
   * 收集待删除的 cell（含所有后代）
   * ⚠️ X6 的 Cell.remove() 本身就是递归的（内部 `eachChild(child => child.remove())`），
   *    这里显式收集一次，是为了能在菜单/提示里给出真实删除数量，且行为不依赖隐式默认值。
   */
  private collectDeep(cells: Cell[]): Cell[] {
    const all = new Set<Cell>()
    cells.forEach((c) => {
      all.add(c)
      // getDescendants 默认 deep = true，返回所有层级的后代
      c.getDescendants().forEach((d) => all.add(d))
    })
    return Array.from(all)
  }

  /** 在指定画布坐标新增节点（右键菜单用） */
  addNodeAt(graphX: number, graphY: number): void {
    const g = this.graph
    if (!g) return
    const node = g.addNode({
      x: graphX,
      y: graphY,
      width: 160,
      height: 40,
      label: '新节点',
    })
    g.cleanSelection()
    g.select(node)
  }

  /**
   * 组合：生成"隐形"父容器，把选中节点挂为子节点
   * - 容器平时 fill/stroke 均透明，视觉上不存在；hover 时才显示描边做整组高亮
   * - 仍可选中：点击组内空白(padding)区域即可选中整组，拖动时子节点原生跟随
   * - 支持「已有组合 + 新节点/另一个组合」合并：**旧组整块嵌套进新容器**（不拆散），
   *   形成 组C={组A, 组B, n4} 这种层级；之后取消组合 C 才能还原出 A、B、n4
   * - 参与组合的"单元"（已有组合 / 自由节点）必须 ≥ 2，避免无意义的单元素组合
   */
  groupSelection(): void {
    const g = this.graph
    if (!g) return

    // 拆单元：已有组合（容器本身或成员所属的父容器）各算 1 个，自由节点各算 1 个
    const groups = new Set<Cell>()
    const free: Cell[] = []
    g.getSelectedCells()
      .filter((cell) => cell.isNode())
      .forEach((n) => {
        if ((n.getChildren() ?? []).length > 0) groups.add(n)
        else {
          const parent = n.getParent()
          if (parent) groups.add(parent)
          else free.push(n)
        }
      })

    if (groups.size + free.length < 2) return

    g.batchUpdate(() => {
      // 嵌套时只取最外层的组合：内层组随外层整块进入新容器，不重复挂载
      const groupList = Array.from(groups)
      const outer = groupList.filter(
        (c) => !groupList.some((o) => o !== c && c.isDescendantOf(o)),
      )

      // 新容器的直接子节点 = 旧组容器（整块）+ 自由节点
      const nodes = Array.from(new Set<Cell>([...free, ...outer]))
      if (nodes.length < 2) return

      const bbox = g.getCellsBBox(nodes)
      const pad = 2
      const parent = g.addNode({
        x: bbox.x - pad,
        y: bbox.y - pad,
        width: bbox.width + pad * 2,
        height: bbox.height + pad * 2,
        // 容器必须在子节点之下，否则会盖住内容
        zIndex: Math.min(...nodes.map((n) => n.getZIndex())) - 1,
        data: { isGroup: true },
        attrs: {
          body: {
            fill: 'transparent',
            stroke: 'transparent',
            strokeWidth: 2,
            strokeDasharray: '4 2',
            rx: 0,
            ry: 0,
          },
        },
      })
      nodes.forEach((n) => parent.addChild(n))
      // 选中项里可能有已旋转的节点：getCellsBBox 不计角度会让初始框偏小，
      // 这里按「真实占用角点」再贴合一次，保证新组合一开始就完整包住内容
      this.fitContainer(parent, nodes)
      g.cleanSelection()
      g.select(parent)
      // 建立角度基线，确保首次旋转时增量计算正确
      this.syncAngleBaseline(parent)
    })
  }

  /**
   * 取消组合：只解除"选中项"这一层的组合关系
   * - 选中的是容器 → 解散该容器，**直接子节点整块释放**：
   *   嵌套子组保持成组（组C={组A,组B,n4} → 取消组合C → 得到 组A、组B、自由节点n4）
   * - 选中的是成员 → 只把它移出所在组，组内其余成员保持组合
   * - 框选时选区会同时包含容器和它的成员：位于被解散容器子树内的选中项
   *   一律跳过（随子树整块释放），否则嵌套子组会被掏空
   * - 同理，选中的嵌套容器若其祖先也在选区中，只解散最外层
   * - 容器被移走成员后：剩余 < 2 个则自动解散；否则重新贴合包围盒
   */
  ungroupSelection(): void {
    const g = this.graph
    if (!g) return
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode())

    g.batchUpdate(() => {
      const freed = new Set<Cell>()
      const touched = new Set<Node>() // 丢失了成员、稍后需要整理的容器

      // 1. 选中的容器：嵌套时只解散最外层，内层容器作为整体保留
      const selectedContainers = nodes.filter((n) => (n.getChildren() ?? []).length > 0)
      const dissolved = selectedContainers.filter(
        (c) => !selectedContainers.some((o) => o !== c && c.isDescendantOf(o)),
      )

      // 2. 选中的成员：跳过"位于被解散容器子树内"的（它们随子树整块释放）
      const members = nodes.filter(
        (n) =>
          (n.getChildren() ?? []).length === 0 &&
          !!n.getParent() &&
          !dissolved.some((c) => n.isDescendantOf(c)),
      )

      // 3. 解散容器：直接子节点整块释放（嵌套子组连成员原样保留）
      dissolved.forEach((c) => {
        const children = (c.getChildren() ?? []).slice()
        // ⚠️ 必须用 unembed：removeFromParent 内部会调用 child.remove() 把节点删掉
        children.forEach((ch) => {
          c.unembed(ch)
          freed.add(ch)
        })
        // 容器自身若嵌在别的容器里，那个父容器也要整理
        const p = c.getParent()
        if (p && p.isNode()) touched.add(p)
        g.removeCells([c])
      })

      // 4. 普通成员：只移出它自己，兄弟节点仍留在组内
      members.forEach((n) => {
        const p = n.getParent()
        if (!p || !p.isNode()) return
        p.unembed(n)
        freed.add(n)
        touched.add(p)
      })

      // 5. 整理被移走成员的容器：剩余 < 2 个则解散（避免留下隐形空框）；否则重新贴合。
      //    解散嵌套子组时它的父容器也丢了成员，级联向上整理（Set 遍历会覆盖后加进来的项）
      touched.forEach((p) => {
        if (!g.hasCell(p)) return // 可能已在前一步被解散
        const rest = (p.getChildren() ?? []).slice()
        if (rest.length < 2) {
          const pp = p.getParent() // ⚠️ remove 后 parent 会变 null，必须先取
          rest.forEach((c) => {
            p.unembed(c)
            freed.add(c)
          })
          g.removeCells([p])
          if (pp && pp.isNode()) touched.add(pp)
        } else {
          this.fitContainer(p, rest)
        }
      })

      const list = Array.from(freed).filter((c) => g.hasCell(c))
      if (list.length) {
        g.cleanSelection()
        g.select(list)
      }
    })
  }

  /**
   * 节点「旋转后」实际占用的 4 个角点（世界坐标）
   * - X6 的 getBBox() 不含 angle，旋转过的节点用 bbox 判断"占用区域"会偏小
   * - 节点绕自身 bbox 中心旋转，故把未旋转的 4 角绕中心转 angle 即得真实占用
   */
  private nodeCorners(node: Node): { x: number; y: number }[] {
    const b = node.getBBox()
    const rad = ((node.getAngle() || 0) * Math.PI) / 180
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    return [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
    ].map(([x, y]) => {
      const dx = x - cx
      const dy = y - cy
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
    })
  }

  /**
   * 让隐形容器重新贴合成员（支持容器自身已旋转）
   *
   * ⚠️ 关键：容器若带 angle，它的渲染框是「绕自身中心的旋转矩形」。
   * 直接按轴对齐 bbox 设 position/size 会让旋转框整体错位（用户反馈的"组合旋转有问题"）。
   * 正确做法：把成员的**真实角点**逆旋转到容器自身方向，取其最小包围矩形（这就是容器在
   * 该角度下能紧贴内容的最小尺寸），再把该矩形中心转回世界坐标作为容器中心。
   * angle = 0 时自动退化为「轴对齐 bbox + pad」，与旧行为一致。
   */
  private fitContainer(container: Node, children: Cell[]): void {
    const pts: { x: number; y: number }[] = []
    children.forEach((c) => {
      if (c.isNode()) pts.push(...this.nodeCorners(c as Node))
    })
    if (pts.length === 0) return

    const pad = 2
    // 参考点：角点集的轴对齐中心
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    pts.forEach((p) => {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    })
    const ox = (minX + maxX) / 2
    const oy = (minY + maxY) / 2

    const angle = container.getAngle() || 0
    const back = (-angle * Math.PI) / 180
    const cosB = Math.cos(back)
    const sinB = Math.sin(back)
    let lx1 = Infinity
    let ly1 = Infinity
    let lx2 = -Infinity
    let ly2 = -Infinity
    pts.forEach((p) => {
      const dx = p.x - ox
      const dy = p.y - oy
      const lx = dx * cosB - dy * sinB
      const ly = dx * sinB + dy * cosB
      lx1 = Math.min(lx1, lx)
      ly1 = Math.min(ly1, ly)
      lx2 = Math.max(lx2, lx)
      ly2 = Math.max(ly2, ly)
    })

    const w = lx2 - lx1 + pad * 2
    const h = ly2 - ly1 + pad * 2

    // 最小矩形的中心（容器局部方向）转回世界坐标
    const lcx = (lx1 + lx2) / 2
    const lcy = (ly1 + ly2) / 2
    const fwd = (angle * Math.PI) / 180
    const cosF = Math.cos(fwd)
    const sinF = Math.sin(fwd)
    const cx = ox + (lcx * cosF - lcy * sinF)
    const cy = oy + (lcx * sinF + lcy * cosF)

    container.position(cx - w / 2, cy - h / 2)
    container.size(w, h)
  }

  /**
   * 删除选中项：递归删除（删组合容器时，组内成员一起删掉）
   * - X6 的 Cell.remove() 默认就是递归的（内部 eachChild → child.remove），
   *   这里显式收集后代再删，行为更可控，也便于统计真实删除数量
   * - 连边由 X6 自动清理（model.unreference 会移除 connected edges），无需手动处理
   */
  removeSelected(): void {
    const g = this.graph
    if (!g) return
    const cells = this.collectDeep(g.getSelectedCells())
    if (cells.length === 0) return
    g.removeCells(cells)
  }

  /**
   * 对齐：**以"组合"为单位**
   * - 自由节点各算 1 个单元；同一组合里的节点归并为它所属的最外层容器（整组一个包围盒）
   * - 移动单元用 translate：容器平移时子节点原生跟随（Node.translate 内部递归平移子树）
   * - 框选把容器和成员一起选中也没关系：归并后同一组合只剩容器这 1 个单元
   */
  alignSelection(type: AlignType): void {
    const g = this.graph
    if (!g) return
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode())
    if (nodes.length < 2) return

    // 归并单元：与间距分布共用，组合作为 1 个单元，组合内被点选的多个成员则还原为成员本身
    const units = this.resolveUnits(nodes)
    if (units.length < 2) return // 全是同一个组合的成员 → 无可对齐

    const bbox = g.getCellsBBox(units)
    g.batchUpdate(() => {
      units.forEach((unit) => {
        const b = unit.getBBox()
        let dx = 0
        let dy = 0
        switch (type) {
          case 'left':
            dx = bbox.x - b.x
            break
          case 'right':
            dx = bbox.x + bbox.width - (b.x + b.width)
            break
          case 'top':
            dy = bbox.y - b.y
            break
          case 'bottom':
            dy = bbox.y + bbox.height - (b.y + b.height)
            break
          case 'centerX':
            dx = bbox.x + bbox.width / 2 - (b.x + b.width / 2)
            break
          case 'centerY':
            dy = bbox.y + bbox.height / 2 - (b.y + b.height / 2)
            break
        }
        if (dx !== 0 || dy !== 0) unit.translate(dx, dy)
      })
    })
  }

  /**
   * 找到节点所属的**最外层**容器：没有上层父级时返回自身
   * `getAncestors()` 返回 [直接父, ..., 最外层]，取最后一个即为根容器
   */
  private findOuterGroup(node: Cell): Cell {
    const ancestors = node.getAncestors() // 默认 deep: true，返回整条祖先链
    return ancestors.length > 0 ? ancestors[ancestors.length - 1] : node
  }

  /**
   * 把选中的节点归并为"可操作单元"，供对齐 / 间距分布复用：
   * 1. 若某节点的祖先容器也在选区里（如橡皮筋把容器和成员一起选中），成员交给容器代表 → 组合作为 1 个单元（刚性）。
   * 2. 若所有节点都归并到**同一个**容器、且**该容器本身不在选区**（用户是 Ctrl/点选了组合内的多个成员），
   *    则还原成这些成员本身参与操作——在组合"内部"排布 / 对齐成员，而不是把整个组合当 1 个单元（那样无对象可操作）。
   * 3. 自由节点（无父级）各算 1 个单元；跨多个组合的成员按各自容器各算 1 个单元。
   */
  private resolveUnits(nodes: Node[]): Cell[] {
    const grouped = nodes.map((n) => this.findOuterGroup(n))
    const distinct = Array.from(new Set(grouped))
    if (distinct.length > 1) return distinct
    // 归并后只剩 1 个单元：判断它是不是"被直接选中的容器"
    const only = distinct[0]
    const containerSelected = nodes.some((n) => n === only)
    // 容器没被选中 → 说明选中的是同一组合内的若干成员，还原为成员本身
    return containerSelected ? distinct : nodes
  }

  /**
   * 间距分布：让选中元素之间的"间隙"均匀相等（首尾元素位置保持不动）
   * - distributeH：沿水平方向排布，元素按左边缘排序，间隙指相邻元素右/左边缘之间的距离
   * - distributeV：沿垂直方向排布，元素按上边缘排序，间隙指相邻元素下/上边缘之间的距离
   * - 归并单元：与对齐一致，组合整体作为一个单元参与分布
   * - 至少需要 3 个单元（首尾固定，中间至少 1 个才有"均分间隙"的意义）
   */
  distributeSelection(type: DistributeType): void {
    const g = this.graph
    if (!g) return
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode())
    if (nodes.length < 3) return

    // 归并单元：与对齐共用，组合作为 1 个单元，组合内被点选的多个成员则还原为成员本身
    const units = this.resolveUnits(nodes)
    if (units.length < 3) return

    const horizontal = type === 'distributeH'
    // 排序：水平按左边缘、垂直按上边缘
    const sorted = [...units].sort((a, b) => {
      const ba = a.getBBox()
      const bb = b.getBBox()
      return horizontal ? ba.x - bb.x : ba.y - bb.y
    })

    const firstBox = sorted[0].getBBox()
    const lastBox = sorted[sorted.length - 1].getBBox()
    // 首元素起点 → 末元素起点 的跨度
    const start0 = horizontal ? firstBox.x : firstBox.y
    const startN = horizontal ? lastBox.x : lastBox.y
    const span = startN - start0

    // 所有单元的尺寸（水平取宽、垂直取高）之和
    const totalSize = sorted.reduce((sum, u) => {
      const b = u.getBBox()
      return sum + (horizontal ? b.width : b.height)
    }, 0)
    const lastSize = horizontal ? lastBox.width : lastBox.height

    // 间隙 = (跨度 - 中间及首尾所有尺寸 + 末元素尺寸) / (单元数-1)
    // 等价于 (startN - start0 - Σ_{0..n-2} w) / (n-1)，保证首尾不动、中间均分
    const gap = (span - totalSize + lastSize) / (sorted.length - 1)

    // 从首元素起点依次铺设：首尾固定，中间按 gap 均匀排布
    let cursor = start0
    g.batchUpdate(() => {
      sorted.forEach((unit, i) => {
        const b = unit.getBBox()
        const size = horizontal ? b.width : b.height
        if (i === 0) {
          cursor += size
          return
        }
        const newStart = cursor + gap
        if (horizontal) {
          const dx = newStart - b.x
          if (dx !== 0) unit.translate(dx, 0)
        } else {
          const dy = newStart - b.y
          if (dy !== 0) unit.translate(0, dy)
        }
        cursor = newStart + size
      })
    })
  }

  /** 当前选区的"单元"数量（组合按 1 个计，组合内被点选的多个成员则按成员计），用于判断是否满足分布/对齐的前置条件 */
  getSelectedUnitCount(): number {
    const g = this.graph
    if (!g) return 0
    const nodes = g.getSelectedCells().filter((cell) => cell.isNode())
    if (nodes.length === 0) return 0
    return this.resolveUnits(nodes).length
  }

  /**
   * 复制时把"组合"当整体：
   * - 选中组合的容器本身 → 以该容器为单元（不再向上爬，允许独立复制嵌套组）
   * - 选中组内成员 / 自由节点 → 上溯到最外层组合容器；自由节点无组祖先则保持自身
   * 去重后作为复制单元返回。配合 g.copy(units, { deep: true }) 才能把整棵子树
   * （容器 + 所有成员）一起复制——X6 的 copy 默认不递归子孙，只复制传入的 cell 本身，
   * 子节点进不了剪贴板，粘贴出来就只剩空容器或散落成员，表现为"粘贴后不是组合"。
   */
  private resolveCopyUnits(): Cell[] {
    const g = this.graph
    if (!g) return []
    const selected = g.getSelectedCells()
    if (!selected.length) return []
    const units = new Map<string, Cell>()
    selected.forEach((cell) => {
      if (!cell.isNode()) {
        // 边：保留原样（deep 复制时会一并带上两端都在复制集内的连边）
        units.set(cell.id, cell)
        return
      }
      const node = cell as Node
      if (this.isGroupContainer(node)) {
        // 选中的本身就是组合 → 以它为单元（不向上爬，允许独立复制嵌套组）
        units.set(node.id, node)
        return
      }
      // 成员 / 自由节点：上溯到最外层组合容器；自由节点无组祖先则保持自身
      let top: Node = node
      let parent = node.getParent()
      while (parent && parent.isNode() && this.isGroupContainer(parent as Node)) {
        top = parent as Node
        parent = (parent as Node).getParent()
      }
      units.set(top.id, top)
    })
    return Array.from(units.values())
  }

  /** 复制选中项（组合会被整体复制，保留成组关系） */
  copySelected(): void {
    const g = this.graph
    if (!g) return
    const units = this.resolveCopyUnits()
    if (units.length) g.copy(units, { deep: true })
  }

  /** 粘贴 */
  paste(): void {
    const g = this.graph
    if (!g || g.isClipboardEmpty()) return
    // deep 复制已把整组（容器 + 成员）及其父子关系一起带回
    const cells = g.paste({ offset: 32 })
    g.cleanSelection()
    // 只选中"顶层单元"（最外层组合容器 / 自由节点），不把成员逐个选中：
    // 否则拖拽成员（无 Alt）会只移动该成员、把刚粘贴的组合拆散
    const ids = new Set(cells.map((c) => c.id))
    const top = cells.filter((c) => {
      const p = c.getParent()
      return !p || !ids.has(p.id)
    })
    if (top.length) g.select(top)
  }

  /** 全选 */
  selectAll(): void {
    const g = this.graph
    if (!g) return
    g.select(g.getCells())
  }

  /**
   * 调整选中元素在图层中的堆叠顺序（修复旧实现直接 setZIndex(9999/0) 在组合/多选下的错位）。
   * - 'front'    置于顶层：选中项（按最外层组去重）移到最前；
   * - 'back'     置于底层：移到最后；
   * - 'forward'  置上一层：整体向上移一层；
   * - 'backward' 置下一层：整体向下移一层。
   * 选中组合成员时，作用于其"最外层组容器"，使整组一起移动（组合应作为整体参与层级）。
   * 策略：把顶层单元按当前 zIndex 排成序列 → 按动作重排 → 紧凑重分配 0..n-1 的 zIndex。
   */
  changeLayer(action: 'front' | 'back' | 'forward' | 'backward'): void {
    const g = this.graph
    if (!g) return
    const selected = g.getSelectedCells()
    if (selected.length === 0) return

    // 选中项归并成"顶层单元"：逐级上溯到最外层祖先（无父的顶层 cell）
    const unitIds = new Set<string>()
    selected.forEach((cell) => {
      let top: Cell = cell
      let p = top.getParent()
      while (p) {
        top = p
        p = top.getParent()
      }
      unitIds.add(top.id)
    })

    // 所有顶层单元（无父）按当前 zIndex 升序（0 = 最底，n-1 = 最顶）
    const tops = g.getCells().filter((c) => !c.getParent())
    tops.sort((a, b) => (a.getZIndex() ?? 0) - (b.getZIndex() ?? 0))
    let order = tops.map((c) => c.id)

    if (action === 'front') {
      order = [
        ...order.filter((id) => !unitIds.has(id)),
        ...order.filter((id) => unitIds.has(id)),
      ]
    } else if (action === 'back') {
      order = [
        ...order.filter((id) => unitIds.has(id)),
        ...order.filter((id) => !unitIds.has(id)),
      ]
    } else if (action === 'forward') {
      // 从后往前：单元若上方紧邻非单元，则与之交换（整组上移一层）
      for (let i = order.length - 1; i >= 0; i--) {
        if (unitIds.has(order[i]) && i < order.length - 1 && !unitIds.has(order[i + 1])) {
          const a = order[i]
          const b = order[i + 1]
          if (a !== undefined && b !== undefined) {
            order[i] = b
            order[i + 1] = a
          }
        }
      }
    } else if (action === 'backward') {
      for (let i = 0; i < order.length; i++) {
        if (unitIds.has(order[i]) && i > 0 && !unitIds.has(order[i - 1])) {
          const a = order[i]
          const b = order[i - 1]
          if (a !== undefined && b !== undefined) {
            order[i] = b
            order[i - 1] = a
          }
        }
      }
    }

    // 依据新顺序紧凑重排 zIndex
    g.batchUpdate('change-layer', () => {
      order.forEach((id, idx) => {
        const cell = g.getCellById(id)
        if (cell) cell.setZIndex(idx)
      })
    })
  }


  /** 窗口尺寸变化时同步画布尺寸（箭头函数保证 this 绑定稳定） */
  private handleResize = (): void => {
    if (!this.graph || !this.container) return
    this.graph.resize(this.container.clientWidth, this.container.clientHeight)
  }

  /** 销毁画布与拖放实例、断开尺寸观察，防止内存泄漏 */
  /**
   * 预览页加载画布数据：自适应居中显示。
   * - 内容超出视口时，缩放(最大不超过 100%)至刚好完整可见并居中 —— 不再有滚动条/滚动区域；
   * - 内容小于视口时，保持原始 100% 比例居中。
   * 视口锁定由 init(preview=true) 已设置（禁平移/滚轮缩放/拖拽/框选/快捷键）。
   */
  loadJSONForPreview(json: string): void {
    const g = this.graph
    if (!g) return
    g.fromJSON(JSON.parse(json))
    g.cleanSelection()

    // 预览是"看"的：先把节点几何对齐到像素网格，1px 描边才会渲染成实线
    // （只改内存副本，不影响保存的数据）
    this.snapNodesToPixelGrid()

    // 兜底重绘画布背景为纯白（预览态统一白底）：fromJSON 后需重绘一次，
    // 否则可能沿用上次背景。与 init(preview=true) 的白色保持一致。
    g.drawBackground({ color: '#FFFFFF' })

    // 房间外观完全按 JSON 中的样式渲染，不随分配状态（allocated）改变：
    // 空房与已分配房保持同一套外观，交互差异只体现在点击弹框上。

    // 按原始比例(100%)居中显示，不改变缩放——即使内容超出视口也不缩小（用户要求原比例）。
    g.centerContent()
  }

  /** 预览：内容实际尺寸（未变换坐标，即 100% 缩放下的真实宽高，单位 px） */
  getContentSize(): { width: number; height: number } {
    const g = this.graph
    if (!g) return { width: 0, height: 0 }
    const area = g.getContentArea()
    return { width: Math.round(area.width), height: Math.round(area.height) }
  }

  /** 预览：当前视口（画布可见区域）尺寸，单位 px */
  getViewportSize(): { width: number; height: number } {
    const g = this.graph
    if (!g || !g.container) return { width: 0, height: 0 }
    return {
      width: Math.round(g.container.clientWidth),
      height: Math.round(g.container.clientHeight),
    }
  }

  /** 预览：当前缩放比例（centerContent 后恒为 1，即 100%） */
  getScale(): number {
    const g = this.graph
    if (!g) return 1
    return g.zoom()
  }

  /**
   * 预览：把画布尺寸调整为「内容实际尺寸 + 四周留白」，配合外层 CSS overflow 实现原生滚动
   * （无需 Scroller 插件）。
   * - 留白：画布 SVG 是 overflow:hidden，描边有一半画在 bbox 之外，不加留白会被裁掉
   *   （矩形/圆形节点的边框看起来「缺一截/发虚」）；
   * - 对齐像素网格：留白、平移量、节点几何三者都要落在整像素（或半像素）上，
   *   否则 1px 描边会被摊到相邻两像素、每像素只有 ~50% 不透明度，
   *   看上去就是「边框断断续续/发虚」。
   *   （节点几何的对齐见 snapNodesToPixelGrid）
   */
  resizeToContent(): void {
    const g = this.graph
    if (!g) return
    const area = g.getContentArea()
    if (!area || area.width <= 0 || area.height <= 0) return
    const pad = GraphEditor.PREVIEW_PADDING
    // 用 ceil 兜住小数尺寸，避免右/下边缘再被削掉 1px
    g.resize(Math.ceil(area.width) + pad * 2, Math.ceil(area.height) + pad * 2)
    // resize 后视口尺寸变化，重新居中（仍保持 100% 缩放，不改变大小）；
    // 留白会自然均分到上下左右（内容居中）
    g.centerContent()
    // 对齐设备像素：平移量取整 + 节点几何对齐像素网格（见 snapNodesToPixelGrid），
    // 两者必须配合——描边落点由「平移量 + 节点坐标」共同决定，只取整其中之一仍会差半像素。
    const ts = g.translate()
    const tx = Math.round(ts.tx)
    const ty = Math.round(ts.ty)
    if (tx !== ts.tx || ty !== ts.ty) g.translate(tx, ty)
  }

  /**
   * 预览专用：把节点几何对齐到像素网格（只在内存副本上做，不改 JSON/编辑态数据，误差 ≤0.5px）。
   * 描边是以路径为中线向内外各扩 strokeWidth/2 绘制的：
   * - 奇数描边（1px/3px）：边缘落在 x.5 上才正好占满一个像素；
   * - 偶数描边（2px/4px）：边缘落在整数上才正好占满。
   * 落点若差半个像素，1px 描边会被摊到相邻两像素（各约 50% 不透明度），
   * 看起来就是「矩形/圆形边框发虚、断断续续」——用户反馈的正是这个。
   */
  private snapNodesToPixelGrid(): void {
    const g = this.graph
    if (!g) return
    g.getNodes().forEach((node) => {
      // 旋转后的描边必然是抗锯齿的，对齐没有意义，还可能让位置抖动
      if (node.getAngle() !== 0) return
      // 组合容器隐形且需要跟随成员，位置交给成员各自对齐，避免"容器挪一下、成员又各挪一下"
      if (node.getChildCount() > 0) return
      const strokeWidth = Number(node.attr('body/strokeWidth') ?? 1)
      const stroke = String(node.attr('body/stroke') ?? '')
      const hasStroke = strokeWidth > 0 && stroke !== 'none' && stroke !== 'transparent'
      const halfPixel = hasStroke && Math.round(strokeWidth) % 2 === 1
      const snap = (v: number) => (halfPixel ? Math.floor(v) + 0.5 : Math.round(v))
      const b = node.getBBox()
      const x = snap(b.x)
      const y = snap(b.y)
      const w = Math.max(1, snap(b.x + b.width) - x)
      const h = Math.max(1, snap(b.y + b.height) - y)
      if (x === b.x && y === b.y && w === b.width && h === b.height) return
      node.position(x, y)
      node.resize(w, h)
    })
  }

  // ===================== 画布参考线（标尺拖出 + 吸附） =====================

  /**
   * 初始化参考线系统（仅编辑模式）：创建 DOM 覆盖层、挂载节点拖拽吸附、绑定视口重绘。
   * 预览模式不调用，避免参考线/标尺进入只读画布。
   */
  private initGuides(): void {
    const g = this.graph
    if (!g) return
    const layer = document.createElement('div')
    layer.className = 'map-guide-layer'
    this.container.appendChild(layer)
    this.guideLayer = layer
    this.renderGuides()

    // 原生拖拽路径（普通节点 / 成员个体 / 选中整组）实时吸附
    g.on('node:moving', ({ node }) => this.snapSelectionToGuides(node as Node))
    // 拖拽结束清除吸附高亮
    g.on('node:moved', () => this.setSnappedGuide(null))
    // 视口变化（平移/缩放/容器尺寸）后参考线需重新定位（localToClient 依赖变换）
    // 注意 X6 v3 视口事件名是无前缀的 scale/translate/resize（'graph:transform' 不存在，监听了也不会触发）
    g.on('scale', () => this.renderGuides())
    g.on('translate', () => this.renderGuides())
    g.on('resize', () => this.renderGuides())
  }

  /**
   * 绑定标尺（由 HomeView 提供顶部/左侧标尺 DOM）。
   * 标尺用于：拖出参考线 + 绘制坐标刻度；视口变化时重绘刻度。
   */
  attachRulers(top: HTMLElement, left: HTMLElement): void {
    this.topRuler = top
    this.leftRuler = left
    this.topRulerCanvas = this.createRulerCanvas(top)
    this.leftRulerCanvas = this.createRulerCanvas(left)
    top.addEventListener('mousedown', (e) => this.onRulerMouseDown(e, 'v'))
    left.addEventListener('mousedown', (e) => this.onRulerMouseDown(e, 'h'))
    const g = this.graph
    g?.on('scale', () => this.renderRulers())
    g?.on('translate', () => this.renderRulers())
    g?.on('resize', () => this.renderRulers())
    this.renderRulers()
  }

  private createRulerCanvas(el: HTMLElement): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.className = 'ruler-canvas'
    el.appendChild(c)
    return c
  }

  /** 重绘两条标尺的刻度（视口变化时调用） */
  private renderRulers(): void {
    this.drawRuler(this.topRuler, this.topRulerCanvas, 'x')
    this.drawRuler(this.leftRuler, this.leftRulerCanvas, 'y')
  }

  /** 在标尺上绘制刻度与坐标值；axis='x' 表顶部标尺（画 x 刻度），'y' 表左侧标尺（画 y 刻度） */
  private drawRuler(
    el: HTMLElement | null,
    canvas: HTMLCanvasElement | null,
    axis: 'x' | 'y',
  ): void {
    if (!el || !canvas || !this.guidesVisible) {
      if (canvas) canvas.width = 0
      return
    }
    const g = this.graph
    if (!g) return
    const rect = el.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    if (w === 0 || h === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#fafbfc'
    ctx.fillRect(0, 0, w, h)

    // 标尺左/上边缘对应的画布局部坐标 = 当前可见局部范围起点
    const p0 = g.clientToLocal({ x: rect.left, y: rect.top })
    const p1 = g.clientToLocal({ x: rect.right, y: rect.bottom })
    const min = axis === 'x' ? p0.x : p0.y
    const max = axis === 'x' ? p1.x : p1.y
    const zoom = g.zoom()
    if (zoom <= 0) return
    // 期望主刻度间隔约 60px（屏幕）→ 画布单位，取 1/2/5×10^n 的"整齐"步长
    const step = this.niceStep(60 / zoom)
    const start = Math.floor(min / step) * step

    ctx.strokeStyle = '#c0c4cc'
    ctx.fillStyle = '#909399'
    ctx.font = '10px sans-serif'
    ctx.lineWidth = 1
    for (let v = start; v <= max; v += step) {
      const px = (v - min) * zoom
      const isMajor = Math.round(v / step) % 5 === 0
      const tickLen = isMajor
        ? axis === 'x'
          ? h - 3
          : w - 3
        : axis === 'x'
          ? h * 0.45
          : w * 0.45
      ctx.beginPath()
      if (axis === 'x') {
        ctx.moveTo(px + 0.5, h)
        ctx.lineTo(px + 0.5, h - tickLen)
      } else {
        ctx.moveTo(w, px + 0.5)
        ctx.lineTo(w - tickLen, px + 0.5)
      }
      ctx.stroke()
      if (isMajor) {
        const label = String(Math.round(v))
        if (axis === 'x') ctx.fillText(label, px + 2, 11)
        else ctx.fillText(label, 2, px + 9)
      }
    }
  }

  /** 把「原始步长」规整为 1/2/5 × 10^n 的整齐数（用于标尺刻度间隔） */
  private niceStep(raw: number): number {
    if (raw <= 0) return 1
    const pow = Math.pow(10, Math.floor(Math.log10(raw)))
    const n = raw / pow
    let nice: number
    if (n <= 1) nice = 1
    else if (n <= 2) nice = 2
    else if (n <= 5) nice = 5
    else nice = 10
    return nice * pow
  }

  /** 重绘参考线 DOM（local→容器像素定位；视口变化/增删/移动时调用） */
  private renderGuides(): void {
    const g = this.graph
    const layer = this.guideLayer
    if (!g || !layer) return
    layer.style.display = this.guidesVisible ? 'block' : 'none'
    if (!this.guidesVisible) return

    const rect = this.container.getBoundingClientRect()
    const all = this.previewGuide ? [...this.guides, this.previewGuide] : this.guides
    const want = new Set(all.map((gd) => gd.id))

    // 移除已不存在的线（连同其 handle 子元素）
    Array.from(layer.children).forEach((el) => {
      const id = (el as HTMLElement).dataset.guideId
      if (id && !want.has(id)) el.remove()
    })

    for (const gd of all) {
      let line = layer.querySelector<HTMLDivElement>(`[data-guide-id="${gd.id}"]`)
      if (!line) {
        line = document.createElement('div')
        line.dataset.guideId = gd.id
        line.className = 'map-guide'
        const handle = document.createElement('div')
        handle.className = 'map-guide__handle'
        line.appendChild(handle)
        this.bindGuideHandle(handle, gd.id)
        layer.appendChild(line)
      }
      const p = g.localToClient(gd.axis === 'v' ? { x: gd.pos, y: 0 } : { x: 0, y: gd.pos })
      const px = p.x - rect.left
      const py = p.y - rect.top
      if (gd.axis === 'v') {
        line.classList.add('map-guide--v')
        line.classList.remove('map-guide--h')
        line.style.left = `${px}px`
        line.style.top = '0'
        line.style.width = '0'
        line.style.height = '100%'
      } else {
        line.classList.add('map-guide--h')
        line.classList.remove('map-guide--v')
        line.style.top = `${py}px`
        line.style.left = '0'
        line.style.width = '100%'
        line.style.height = '0'
      }
      line.classList.toggle('is-snapped', gd.id === this.snappedGuideId)
    }
  }

  /** 绑定参考线手柄：拖动改位置（拖回标尺删除）/ 双击删除 */
  private bindGuideHandle(handle: HTMLElement, id: string): void {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.startGuideMove(id, e)
    })
    handle.addEventListener('dblclick', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.removeGuide(id)
    })
  }

  private startGuideMove(id: string, _e: MouseEvent): void {
    const g = this.graph
    if (!g) return
    this.guideDragCleanup?.()
    const guide = this.guides.find((gd) => gd.id === id)
    if (!guide) return
    const rect = this.container.getBoundingClientRect()

    const onMove = (ev: MouseEvent) => {
      const local = g.clientToLocal({ x: ev.clientX, y: ev.clientY })
      guide.pos = guide.axis === 'v' ? local.x : local.y
      this.renderGuides()
    }
    const onUp = (ev: MouseEvent) => {
      // 竖线拖回画布顶部之上 / 横线拖回画布左侧之左 → 删除
      const backToRuler =
        guide.axis === 'v' ? ev.clientY < rect.top : ev.clientX < rect.left
      if (backToRuler) this.removeGuide(id)
      else this.renderGuides()
      cleanup()
    }
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (this.guideDragCleanup === cleanup) this.guideDragCleanup = null
    }
    this.guideDragCleanup = cleanup
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  /** 标尺按下拖出一条参考线（预览跟随，松手落在画布内才落定） */
  private onRulerMouseDown(e: MouseEvent, axis: 'v' | 'h'): void {
    const g = this.graph
    if (!g || !this.guidesVisible || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    this.guideDragCleanup?.()

    const local = g.clientToLocal({ x: e.clientX, y: e.clientY })
    this.previewGuide = { id: '__preview__', axis, pos: axis === 'v' ? local.x : local.y }
    this.renderGuides()

    const rect = this.container.getBoundingClientRect()
    const onMove = (ev: MouseEvent) => {
      const lp = g.clientToLocal({ x: ev.clientX, y: ev.clientY })
      if (this.previewGuide) this.previewGuide.pos = axis === 'v' ? lp.x : lp.y
      this.renderGuides()
    }
    const onUp = (ev: MouseEvent) => {
      // 落点在画布内（竖线向下拖过画布顶边 / 横线向右拖过画布左边）才创建，否则取消
      const droppedInCanvas =
        axis === 'v' ? ev.clientY > rect.top : ev.clientX > rect.left
      if (droppedInCanvas && this.previewGuide) {
        this.guides.push({
          id: this.genGuideId(),
          axis,
          pos: this.previewGuide.pos,
        })
      }
      this.previewGuide = null
      this.renderGuides()
      cleanup()
    }
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (this.guideDragCleanup === cleanup) this.guideDragCleanup = null
    }
    this.guideDragCleanup = cleanup
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  private genGuideId(): string {
    return `g-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  }

  /** 删除单条参考线 */
  removeGuide(id: string): void {
    this.guides = this.guides.filter((gd) => gd.id !== id)
    if (this.snappedGuideId === id) this.snappedGuideId = null
    this.renderGuides()
  }

  /** 清空全部参考线 */
  clearGuides(): void {
    this.guides = []
    this.snappedGuideId = null
    this.renderGuides()
  }

  /** 切换参考线 + 标尺的显示/隐藏（不改变数据） */
  setGuidesVisible(v: boolean): void {
    this.guidesVisible = v
    if (this.topRuler) this.topRuler.style.visibility = v ? 'visible' : 'hidden'
    if (this.leftRuler) this.leftRuler.style.visibility = v ? 'visible' : 'hidden'
    this.renderGuides()
  }

  /** 当前参考线数量（供 UI 判断"清除"按钮可用） */
  getGuideCount(): number {
    return this.guides.length
  }

  /** 计算拖拽 bbox 相对参考线的最小吸附位移（画布局部坐标） */
  private computeGuideSnapDelta(bbox: {
    x: number
    y: number
    width: number
    height: number
  }): { dx: number; dy: number; hitId: string | null } {
    const g = this.graph
    if (!g || !this.guidesVisible || this.guides.length === 0) {
      return { dx: 0, dy: 0, hitId: null }
    }
    // 屏幕像素容差 ÷ 缩放 → 画布单位，避免放大过灵 / 缩小吸不上
    const tol = GraphEditor.SNAP_TOLERANCE / g.zoom()
    const xs = [bbox.x, bbox.x + bbox.width / 2, bbox.x + bbox.width]
    const ys = [bbox.y, bbox.y + bbox.height / 2, bbox.y + bbox.height]
    let best = { dx: 0, dy: 0, dist: Infinity, hitId: null as string | null }
    for (const gd of this.guides) {
      if (gd.axis === 'v') {
        for (const x of xs) {
          const d = gd.pos - x
          if (Math.abs(d) <= tol && Math.abs(d) < best.dist) {
            best = { dx: d, dy: 0, dist: Math.abs(d), hitId: gd.id }
          }
        }
      } else {
        for (const y of ys) {
          const d = gd.pos - y
          if (Math.abs(d) <= tol && Math.abs(d) < best.dist) {
            best = { dx: 0, dy: d, dist: Math.abs(d), hitId: gd.id }
          }
        }
      }
    }
    return { dx: best.dx, dy: best.dy, hitId: best.hitId }
  }

  /** 原生拖拽路径：选中节点（含整组）拖近参考线时吸附对齐 */
  private snapSelectionToGuides(_primary: Node): void {
    const g = this.graph
    if (!g || this.snapping || !this.guidesVisible) return
    const selected = g.getSelectedCells().filter((c) => c.isNode()) as Node[]
    if (selected.length === 0) return
    const bbox = g.getCellsBBox(selected)
    if (!bbox) return
    const { dx, dy, hitId } = this.computeGuideSnapDelta(bbox)
    this.setSnappedGuide(hitId)
    if (dx === 0 && dy === 0) return
    // 同一位移施加到所有选中节点，保持相对排布；用 snapping 标记防止 node:moving 递归
    this.snapping = true
    try {
      for (const n of selected) n.translate(dx, dy)
    } finally {
      this.snapping = false
    }
  }

  /** 设置当前命中的参考线（用于高亮），无变化则跳过重绘 */
  private setSnappedGuide(id: string | null): void {
    if (this.snappedGuideId === id) return
    this.snappedGuideId = id
    this.renderGuides()
  }

  // ===================== 参考线结束 =====================

  dispose(): void {
    window.removeEventListener('resize', this.handleResize)
    if (this.hoverTimer !== null) {
      clearTimeout(this.hoverTimer)
      this.hoverTimer = null
    }
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    // 收尾参考线交互监听与 DOM
    this.guideDragCleanup?.()
    this.guideDragCleanup = null
    this.guideLayer?.remove()
    this.guideLayer = null
    this.guides = []
    this.previewGuide = null
    this.snappedGuideId = null
    this.topRuler = null
    this.leftRuler = null
    this.topRulerCanvas = null
    this.leftRulerCanvas = null
    this.dnd?.dispose()
    this.dnd = null
    this.highlightedId = null
    this.pendingDropId = null
    this.spaceGuardCleanup?.()
    this.spaceGuardCleanup = null
    this.selectionPlugin = null
    // 组合拖拽可能仍挂着 document 上的 mousemove/mouseup + 未收尾的 batch，
    // 必须在 graph.dispose() 之前收尾（否则 stopBatch 会作用在已销毁的 graph 上）
    this.groupDragCleanup?.()
    this.groupDragCleanup = null
    this.zoomGuardCleanup?.()
    this.zoomGuardCleanup = null
    this.graph?.dispose()
    this.graph = null
  }

  /** 暴露底层 Graph 实例（只读访问，便于扩展） */
  get instance(): Graph | null {
    return this.graph
  }
}
