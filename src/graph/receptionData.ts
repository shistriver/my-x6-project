/**
 * Reception 页面 mock 客人数据
 * ------------------------------------------------------------------
 * 按房间号索引的「上一位 / 下一位 / 当前 / 分配」客人演示数据。
 * 用于 reception 只读页的房间节点 hover 卡片：
 *   - 四类客人都为空 → 无人房，hover 显示房间分类（如 Dining Room）
 *   - 有客人 → hover 显示对应卡片（Previous / Next / Current / Assigned）
 *
 * 接真实接口时只需替换 getRoomGuestInfo() 的数据源，页面与卡片渲染无需改动。
 */

/** 客人分类（决定卡片配色与标题） */
export type GuestKind = 'previous' | 'next' | 'current' | 'assigned'

/** 单个客人条目 */
export interface GuestPerson {
  name: string
  company: string
  department: string
  /** 状态徽章（仅 Current Guest 用，如 On-Board） */
  status?: string
}

/** 一个房间的客人汇总；四类都为空 = 无人房 */
export interface RoomGuestInfo {
  roomNo: string
  /** 无人时显示的房间分类，如 Dining Room / Guest Room / Office */
  category: string
  previous: GuestPerson[]
  next: GuestPerson[]
  current: GuestPerson[]
  assigned: GuestPerson[]
}

const emptyRoom = (roomNo: string, category: string): RoomGuestInfo => ({
  roomNo,
  category,
  previous: [],
  next: [],
  current: [],
  assigned: [],
})

/** 6 种演示场景（与用户提供的 6 张截图一一对应） */
type SceneFactory = (roomNo: string) => RoomGuestInfo

const SCENES: SceneFactory[] = [
  // 图1：无人房 → 只显示分类
  (no) => emptyRoom(no, 'Dining Room'),
  // 图2：Previous Guest
  (no) => ({
    ...emptyRoom(no, 'Guest Room'),
    previous: [{ name: 'Zou Ke', company: 'CNPC', department: 'Drilling & WellWork' }],
  }),
  // 图3：Assigned To（两人并排）
  (no) => ({
    ...emptyRoom(no, 'Guest Room'),
    assigned: [
      { name: 'Ossama Ahmed', company: 'ISOS', department: 'SHE' },
      { name: 'Yassir TALIB', company: 'ISOS', department: 'SHE' },
    ],
  }),
  // 图4：Current Guest
  (no) => ({
    ...emptyRoom(no, 'Guest Room'),
    current: [{ name: 'hello Y', company: 'Wood', department: 'IT' }],
  }),
  // 图5：Previous + Current
  (no) => ({
    ...emptyRoom(no, 'Guest Room'),
    previous: [{ name: 'Chen Hanlin', company: 'CNPC', department: 'Major Project' }],
    current: [{ name: 'F', company: 'CNPC', department: 'FOD Project' }],
  }),
  // 图6：Next + Current(On-Board) + Assigned
  (no) => ({
    ...emptyRoom(no, 'Guest Room'),
    next: [{ name: 'Ma Si', company: 'CNPC', department: 'Drilling & WellWork' }],
    current: [
      {
        name: 'LAING Peter',
        company: 'G.W',
        department: 'Process & Control',
        status: 'On-Board',
      },
    ],
    assigned: [{ name: 'Xue Lilin', company: 'CNPC', department: 'Major Project' }],
  }),
]

/**
 * 显式房号 → 场景索引映射（还原用户截图里的具体房间）。
 * 未列出的房号按下方规则兜底，保证任意画布 hover 都有演示效果。
 */
const ROOM_SCENE_INDEX: Record<string, number> = {
  '141': 0, // 图1 Dining Room（无人）
  '137': 1, // 图2 Previous Guest
  '136': 2, // 图3 Assigned To
  '139': 3, // 图4 Current Guest
  'D107': 4, // 图5 Previous + Current
  '135': 5, // 图6 Next + Current + Assigned
}

/** 稳定 hash：把任意字符串映射到场景索引（保证同一节点每次 hover 结果一致） */
const sceneIndexByKey = (key: string): number => {
  let h = 0
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % SCENES.length
}

/**
 * 查询房间的客人信息。
 * @param roomNo 房间号（节点 data.room.roomNo）
 * @param nodeId 节点 id（房号为空或未显式映射时的兜底 key）
 * @param category 节点上的房间分类（有值则无人房优先显示它）
 */
export function getRoomGuestInfo(roomNo: string, nodeId: string, category?: string): RoomGuestInfo {
  const no = (roomNo || '').trim()
  const idx = ROOM_SCENE_INDEX[no] ?? (no ? sceneIndexByKey(no) : sceneIndexByKey(nodeId))
  const info = SCENES[idx](no)
  // 无人房优先用画布上的真实分类；mock 房号未绑定分类时仍显示场景默认分类
  if (info.category === 'Dining Room' || info.category === 'Guest Room') {
    const c = (category || '').trim()
    if (c) info.category = c
  }
  return info
}

/** 是否为无人房（四类客人都为空） */
export const isRoomEmpty = (info: RoomGuestInfo): boolean =>
  info.previous.length === 0 &&
  info.next.length === 0 &&
  info.current.length === 0 &&
  info.assigned.length === 0
