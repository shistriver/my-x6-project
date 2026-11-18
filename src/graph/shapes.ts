import { Graph, type NodeMetadata } from '@antv/x6'

/** 自定义房间节点（区别于普通矩形：米黄底 + 粗描边 + 文字靠左上） */
export const SHAPE_ROOM = 'room-node'

/** 编号房间（竖长白底 + 粗边框 + 居中加粗编号，边框颜色靠描边色切换） */
export const SHAPE_ROOM_NUMBER = 'room-number'

/** L 形墙（两段矩形拼成，厚度 = 臂宽，随节点宽高等比伸展） */
export const SHAPE_WALL_L = 'wall-l'

/** 直线墙（填充矩形，厚度 = 节点高度，长度 = 节点宽度） */
export const SHAPE_WALL_LINE = 'wall-line'

/** 墙体默认厚度（px）：直线墙的高度 / L 形墙的臂宽 */
export const WALL_THICKNESS = 6

/** 墙体默认颜色 */
export const WALL_COLOR = '#595959'

/** 左侧节点库里的一个可拖拽项 */
export interface PaletteItem {
  key: string
  label: string
  /** 预览缩略图样式 */
  preview: 'room' | 'rect' | 'circle' | 'text' | 'room-number' | 'wall-l' | 'wall-line'
  /** 拖入画布时用来创建节点的元数据 */
  meta: NodeMetadata
}

export const PALETTE_GROUPS: { title: string; items: PaletteItem[] }[] = [
  {
    title: '房间',
    items: [
      // {
      //   key: 'room',
      //   label: 'Room',
      //   preview: 'room',
      //   meta: { shape: SHAPE_ROOM, width: 160, height: 100, label: '' },
      // },
      {
        key: 'room-number',
        label: 'Room No.',
        preview: 'room-number',
        meta: { shape: SHAPE_ROOM_NUMBER, label: '' },
      },
    ],
  },
  {
    title: '墙体',
    items: [
      {
        key: 'wall-l',
        label: 'L形墙',
        preview: 'wall-l',
        meta: { shape: SHAPE_WALL_L },
      },
      {
        key: 'wall-line',
        label: '直线墙',
        preview: 'wall-line',
        meta: { shape: SHAPE_WALL_LINE },
      },
    ],
  },
  {
    title: '基础图形',
    items: [
      {
        key: 'rect',
        label: 'Rect',
        preview: 'rect',
        meta: {
          shape: 'rect',
          width: 100,
          height: 60,
          label: '',
          attrs: {
            body: { fill: '#ECF5FF', stroke: '#409EFF', strokeWidth: 1, rx: 4, ry: 4 },
            label: { fill: '#1F2329', fontSize: 14 },
          },
        },
      },
      {
        key: 'circle',
        label: 'Circle',
        preview: 'circle',
        meta: {
          shape: 'circle',
          width: 60,
          height: 60,
          label: '',
          attrs: {
            body: { fill: '#F0F9EB', stroke: '#67C23A', strokeWidth: 1 },
            label: { fill: '#1F2329', fontSize: 14 },
          },
        },
      },
      {
        key: 'text',
        label: 'Text',
        preview: 'text',
        meta: {
          shape: 'rect',
          width: 120,
          height: 40,
          label: 'Text content',
          // 标记该节点为"文字节点"，落图后由画布按内容自适应宽高
          data: { isTextNode: true },
          attrs: {
            // 透明本体：视觉上只剩一行文字，但仍可选中/移动
            body: { fill: 'rgba(0, 0, 0, 0)', stroke: 'rgba(0, 0, 0, 0)' },
            // 显式指定字体族，使文字测量与渲染一致
            label: { fill: '#303133', fontSize: 14, fontFamily: 'sans-serif' },
          },
        },
      },
    ],
  },
]

/**
 * 注册自定义图形
 * ⚠️ 必须在 new Graph() 之前调用：X6 创建节点时按 shape 名查注册表，
 *    注册晚了对已创建实例无效
 */
export function registerShapes(): void {
  Graph.registerNode(
    SHAPE_ROOM,
    {
      inherit: 'rect',
      width: 160,
      height: 100,
      attrs: {
        body: { fill: '#FFF7E6', stroke: '#D48806', strokeWidth: 2, rx: 4, ry: 4 },
        label: {
          fill: '#873800',
          fontSize: 14,
          refX: 8,
          refY: 10,
          textAnchor: 'start',
          textVerticalAnchor: 'top',
        },
      },
    },
    true,
  )

  Graph.registerNode(
    SHAPE_ROOM_NUMBER,
    {
      inherit: 'rect',
      width: 60,
      height: 60,
      markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'rect', selector: 'topbar' },
        { tagName: 'text', selector: 'label' },
        { tagName: 'text', selector: 'area' }
      ],
      attrs: {
        body: {
          refWidth: '100%',
          refHeight: '100%',
          fill: '#ffffff',
          stroke: '#F07800',
          strokeWidth: 2,
          rx: 0,
          ry: 0
        },
        topbar: {
          refX: 0,
          refY: 0,
          refWidth: '100%',
          height: 8,
          fill: '#F07800',
          stroke: '#F07800',
          rx: 0,
          ry: 0
        },
        label: {
          refX: '50%',
          refY: '50%',
          refY2: 4,
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          fontSize: 16,
          fontWeight: 700,
          fill: '#1F3F5E'
        },
        area: {
          refX: '50%',
          refY: '90%',
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          text: '',
          fontSize: 10,
          fontWeight: 500,
          fill: '#6B7C8E',
          // 面积标注默认隐藏：面板开关切到「显示」时删除该属性（回到可见），
          // 切到「隐藏」时设回 'none'。读写判定仍按 display !== 'none'。
          display: 'none',
        }
      }
    },
    true
  )

  // L 形墙：两段矩形（左臂 + 下臂）拼成，全部用 ref* 锚定到节点包围盒 ——
  // 无论怎么缩放，两条臂始终贴着 bbox 的外边，选框和墙体严丝合缝。
  // ⚠️ 不要退回 polyline：它的 refPoints 会被"等比缩放填满 bbox 并贴左上角"，
  //    宽度方向必然留空白，再叠加 stroke 向外溢出，选框就永远对不上墙体。
  Graph.registerNode(SHAPE_WALL_L, {
    inherit: 'rect',
    width: 60,
    height: 60,
    markup: [
      // 左臂：贴左边，高度撑满
      { tagName: 'rect', selector: 'vArm' },
      // 下臂：贴底边，宽度撑满
      { tagName: 'rect', selector: 'hArm' },
    ],
    attrs: {
      vArm: {
        x: 0,
        y: 0,
        width: WALL_THICKNESS,
        refHeight: '100%', // 高度 = 节点高度
        fill: WALL_COLOR,
        stroke: 'none',
      },
      hArm: {
        x: 0,
        // refDy 是从"右下角"算的偏移：-t → y = 高 - 厚度，始终贴底
        refDy: -WALL_THICKNESS,
        refWidth: '100%', // 宽度 = 节点宽度
        height: WALL_THICKNESS,
        fill: WALL_COLOR,
        stroke: 'none',
      },
    },
    ports: {
      groups: {
        start: { position: { name: 'absolute', args: { x: 0, y: 0 } } },
        corner: { position: { name: 'absolute', args: { x: 0, y: '100%' } } },
        end: { position: { name: 'absolute', args: { x: '100%', y: '100%' } } },
      },
    },
  }, true)

  // 直线墙：填充矩形，节点高 = 墙厚、宽 = 墙长，bbox 与墙体完全重合
  Graph.registerNode(SHAPE_WALL_LINE, {
    inherit: 'rect',
    width: 60,
    height: WALL_THICKNESS,
    attrs: {
      body: {
        fill: WALL_COLOR,
        stroke: 'none',
        strokeWidth: 0,
        rx: 0,
        ry: 0,
      },
    },
    ports: {
      groups: {
        left: {
          position: { name: 'absolute', args: { x: 0, y: '50%' } },
          attrs: {
            circle: { magnet: true, r: 5, stroke: '#1890ff', fill: '#fff' }
          }
        },
        right: {
          position: { name: 'absolute', args: { x: '100%', y: '50%' } },
          attrs: {
            circle: { magnet: true, r: 5, stroke: '#1890ff', fill: '#fff' }
          }
        },
      },
    },
  }, true)

}
