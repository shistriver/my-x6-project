/**
 * RoomAllocate 页面 mock 数据层
 * ------------------------------------------------------------------
 * 供「房间分配」只读页使用：
 *   1) 判定哪些房间「可分配」（图1里黄色高亮的 27 号 = 可分配，其余淡灰 = 不可分配）
 *   2) 弹框展示的房间信息 + 旅客信息（图2 Confirm Room Allocation）
 *   3) 分配结果写入 localStorage，供 reception 页读取实现「数据同步」
 *
 * 当前全部为 mock，接真实接口时只需替换 isRoomAllocatable() / getAllocationRoom()
 * 的数据源，页面无需改动。
 */

/** 弹框展示的一个「可分配房间」完整信息（房间信息 + PAX 信息） */
export interface AllocationRoom {
  roomNo: string
  camp: string
  zone: string
  building: string
  musterPoint: string
  checkIn: string
  checkOut: string
  rotatorOnly: boolean
  fullName: string
  position: string
  department: string
  company: string
}

/**
 * 显式可分配房号 → 弹框数据（还原图2的 27 号房间）。
 * 未列出的房号按 nodeId 稳定 hash 兜底，保证任意画布都有可分配/不可分配两种演示效果。
 */
const ALLOCATION_ROOMS: Record<string, AllocationRoom> = {
  '27': {
    roomNo: '27',
    camp: 'DS6C-1',
    zone: 'zone-3',
    building: 'BUILDING-5',
    musterPoint: 'MP#A1',
    checkIn: '2026-11-10',
    checkOut: '2026-11-30',
    rotatorOnly: true,
    fullName: 'Atheer Al-Malki',
    position: 'Travel Section head',
    department: 'Security',
    company: 'AIRSWIFT',
  },
}

/** 兜底池：hash 命中的房间复用这些样例（改 roomNo 为实际房号） */
const FALLBACK_TEMPLATES: Omit<AllocationRoom, 'roomNo'>[] = [
  {
    camp: 'DS6C-1', zone: 'zone-3', building: 'BUILDING-5', musterPoint: 'MP#B1',
    checkIn: '2026-11-10', checkOut: '2026-11-30', rotatorOnly: false,
    fullName: 'Ossama Ahmed', position: 'Drilling Supervisor', department: 'Drilling & WellWork', company: 'ISOS',
  },
  {
    camp: 'DS6C-1', zone: 'zone-3', building: 'BUILDING-6', musterPoint: 'MP#A1',
    checkIn: '2026-11-12', checkOut: '2026-12-01', rotatorOnly: true,
    fullName: 'Chen Hanlin', position: 'Project Engineer', department: 'Major Project', company: 'CNPC',
  },
  {
    camp: 'DS6C-1', zone: 'zone-3', building: 'BUILDING-5', musterPoint: 'MP#2',
    checkIn: '2026-11-15', checkOut: '2026-11-28', rotatorOnly: false,
    fullName: 'Yassir TALIB', position: 'HSE Officer', department: 'SHE', company: 'ISOS',
  },
]

/** 稳定 hash：同一节点每次判定结果一致 */
const hashOf = (key: string): number => {
  let h = 0
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

const FALLBACK_RATIO = 6 // 约 1/6 的节点兜底为可分配

/**
 * 判定房间是否可分配。
 * @param roomNo 节点显示文字（房间号）
 * @param nodeId 节点 id（无房号或房号未显式列出时的兜底 key）
 */
export function isRoomAllocatable(roomNo: string, nodeId: string): boolean {
  const no = (roomNo || '').trim()
  if (ALLOCATION_ROOMS[no]) return true
  // 有房号但不在显式列表：也用 hash 兜底，避免大多数房间都不可分配
  return hashOf(no || nodeId) % FALLBACK_RATIO === 0
}

/** 取房间的分配弹框数据（可分配房间调用；总是有返回） */
export function getAllocationRoom(roomNo: string, nodeId: string): AllocationRoom {
  const no = (roomNo || '').trim()
  const explicit = ALLOCATION_ROOMS[no]
  if (explicit) return { ...explicit }
  const tpl = FALLBACK_TEMPLATES[hashOf(no || nodeId) % FALLBACK_TEMPLATES.length]
  // 房间文字为空（旧画布）时给个稳定伪房号，避免弹框显示「—」
  const displayNo = no || String((hashOf(nodeId) % 90) + 10)
  return { ...tpl, roomNo: displayNo }
}

// ---------------- 分配结果（localStorage，供 reception 同步） ----------------

const ALLOCATION_STORAGE_KEY = 'camp-map-allocations'

/** 已分配记录：key = 节点 id */
export type AllocationMap = Record<string, AllocationRoom>

/** 读取全部分配记录 */
export function loadAllocations(): AllocationMap {
  try {
    const raw = localStorage.getItem(ALLOCATION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as AllocationMap) : {}
  } catch {
    return {}
  }
}

/** 读取单个节点的分配记录 */
export function getAllocation(nodeId: string): AllocationRoom | null {
  return loadAllocations()[nodeId] ?? null
}

/** 写入一个节点的分配记录（合并进已有记录） */
export function saveAllocation(nodeId: string, room: AllocationRoom): void {
  const all = loadAllocations()
  all[nodeId] = { ...room }
  localStorage.setItem(ALLOCATION_STORAGE_KEY, JSON.stringify(all))
}

/** 清空全部分配记录（调试/重置用） */
export function clearAllocations(): void {
  localStorage.removeItem(ALLOCATION_STORAGE_KEY)
}
