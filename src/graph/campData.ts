/**
 * 营地 / 区域 / 楼栋 / 房间 数据层（本地 mock）
 * ------------------------------------------------------------------
 * 数据来源：接口返回的营地三级树 + 按楼栋查询的房间列表。
 * 当前先以用户提供的样例数据作为本地 mock，后续接真实接口时只需把
 * getCampTree() / getRoomsByBuilding() 改为 await fetch(...)，保持返回结构不变即可。
 *
 * ⚠️ 楼栋判定不用 level 字段：样例里 level 不规整
 *    （DS6C-1 的 zone=1/building=2，DS6C-2 的 Area=2/building=3），
 *    统一用「叶子节点（children 为空）= 楼栋」判断，见 isBuilding()。
 */

/** 营地树节点（营地 / 区域 / 楼栋共用） */
export interface CampNode {
  id: number
  parentId: number
  name: string
  level: number
  sortOrder: number
  status: number
  address: string
  musterPoint: string
  createdAt: string | null
  code: string
  count: number
  children: CampNode[] | null
}

/** 房间记录（接口返回字段，尽量与后端一一对应） */
export interface RoomOption {
  id: number
  roomKey: string
  roomNumber: string
  locationId: number
  roomName: string
  companyId: number
  company: string
  groupType: number
  roomType: number
  category: number
  subcategory: number
  roomRemark: string | null
  roomStatus: number
  keyNumber: number
  barea: string
  musterPointId: number | null
  musterPointName: string | null
  rotationType: string | null
  rotatorOnly: number
  ipPhoneExt: string
  campId: number
  camp: string
  zoneId: number
  zone: string
  buildingId: number
  building: string
  categoryName: string
  subcategoryName: string
  b2bPaxName1: string | null
  b2bPaxName2: string | null
  roomOwnershipId: number
  roomOwnershipName: string
  color: string
  vipPaxName: string | null
  tcard: number
}

/** 营地三级树（mock，用户提供的接口样例，原样落地） */
const CAMP_TREE: CampNode[] = [
  {
    id: 31,
    parentId: 0,
    name: 'DS6C-1',
    level: 0,
    sortOrder: 1,
    status: 1,
    address: '',
    musterPoint: '',
    createdAt: '2026-10-19 15:09:37',
    code: 'DS6C',
    count: 0,
    children: [
      {
        id: 32,
        parentId: 31,
        name: 'zone-3',
        level: 1,
        sortOrder: 1,
        status: 1,
        address: '',
        musterPoint: '',
        createdAt: '2026-10-19 15:11:56',
        code: 'DS6C',
        count: 0,
        children: [
          { id: 33, parentId: 32, name: 'BUILDING-1', level: 2, sortOrder: 1, status: 1, address: '', musterPoint: '', createdAt: '2026-10-19 15:12:24', code: 'DS6C', count: 10, children: null },
          { id: 35, parentId: 32, name: 'BUILDING-2', level: 2, sortOrder: 2, status: 1, address: '', musterPoint: '', createdAt: '2026-10-19 15:15:04', code: 'DS6C', count: 27, children: null },
          { id: 36, parentId: 32, name: 'BUILDING-3', level: 2, sortOrder: 3, status: 1, address: '', musterPoint: '', createdAt: '2026-10-19 15:15:26', code: 'DS6C', count: 22, children: null },
          { id: 37, parentId: 32, name: 'BUILDING-5', level: 2, sortOrder: 5, status: 1, address: '', musterPoint: '', createdAt: '2026-10-19 15:15:43', code: 'DS6C', count: 34, children: null },
          { id: 38, parentId: 32, name: 'BUILDING-6', level: 2, sortOrder: 6, status: 1, address: '', musterPoint: '', createdAt: '2026-10-19 15:16:02', code: 'DS6C', count: 37, children: null },
          { id: 39, parentId: 32, name: 'BUILDING-7', level: 2, sortOrder: 7, status: 1, address: '', musterPoint: '', createdAt: '2026-10-19 15:16:16', code: 'DS6C', count: 97, children: null },
        ],
      },
      {
        id: 34,
        parentId: 31,
        name: 'zone-4',
        level: 1,
        sortOrder: 2,
        status: 1,
        address: '',
        musterPoint: '',
        createdAt: '2026-10-19 15:12:47',
        code: 'DS6C',
        count: 0,
        children: [
          { id: 40, parentId: 34, name: 'BUILDING-7', level: 2, sortOrder: 7, status: 1, address: '', musterPoint: '', createdAt: '2026-10-19 15:16:46', code: 'DS6C', count: 24, children: null },
        ],
      },
    ],
  },
  {
    id: 13,
    parentId: 0,
    name: 'DS6C-2',
    level: 0,
    sortOrder: 2,
    status: 1,
    address: '1',
    musterPoint: '4',
    createdAt: '2024-11-27 20:38:00',
    code: 'DS6C2',
    count: 0,
    children: [
      {
        id: 14,
        parentId: 13,
        name: 'Area D',
        level: 2,
        sortOrder: 0,
        status: 1,
        address: '1',
        musterPoint: '4',
        createdAt: '2024-11-27 20:38:00',
        code: 'DS6C2',
        count: 0,
        children: [
          { id: 26, parentId: 14, name: 'BUILDING-1', level: 3, sortOrder: 2, status: 1, address: '', musterPoint: '4', createdAt: null, code: 'DS6C2', count: 10, children: null },
        ],
      },
      {
        id: 15,
        parentId: 13,
        name: 'Area E',
        level: 2,
        sortOrder: 0,
        status: 1,
        address: '1',
        musterPoint: '4',
        createdAt: '2024-11-27 20:38:00',
        code: 'DS6C2',
        count: 0,
        children: [
          { id: 27, parentId: 15, name: 'BUILDING-1', level: 3, sortOrder: 1, status: 1, address: '', musterPoint: '4', createdAt: null, code: 'DS6C2', count: 23, children: null },
          { id: 28, parentId: 15, name: 'BUILDING-2', level: 3, sortOrder: 2, status: 1, address: '', musterPoint: '4', createdAt: null, code: 'DS6C2', count: 16, children: null },
          { id: 29, parentId: 15, name: 'BUILDING-3', level: 3, sortOrder: 3, status: 1, address: '', musterPoint: '4', createdAt: null, code: 'DS6C2', count: 16, children: null },
          { id: 30, parentId: 15, name: 'BUILDING-4', level: 3, sortOrder: 4, status: 1, address: '', musterPoint: '4', createdAt: null, code: 'DS6C2', count: 8, children: null },
        ],
      },
    ],
  },
]

/** 用户提供的房间列表样例（归属 locationId=36 / BUILDING-3 / zone-3 / DS6C-1，原样落地） */
const BUILDING_3_ROOMS: RoomOption[] = [
  { id: 442, roomKey: '73/74', roomNumber: '73/74', locationId: 36, roomName: '73/74', companyId: 12, company: 'CNPC', groupType: 0, roomType: 3, category: 1, subcategory: 4, roomRemark: null, roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: null, musterPointName: null, rotationType: null, rotatorOnly: 0, ipPhoneExt: '27536', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
  { id: 443, roomKey: '75/76', roomNumber: '75/76', locationId: 36, roomName: '75/76', companyId: 12, company: 'CNPC', groupType: 0, roomType: 3, category: 1, subcategory: 4, roomRemark: null, roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: null, musterPointName: null, rotationType: null, rotatorOnly: 0, ipPhoneExt: '27666', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
  { id: 444, roomKey: '77', roomNumber: '77', locationId: 36, roomName: '3', companyId: 12, company: 'CNPC', groupType: 0, roomType: 2, category: 1, subcategory: 4, roomRemark: null, roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: null, musterPointName: null, rotationType: null, rotatorOnly: 1, ipPhoneExt: '27605', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
  { id: 445, roomKey: '78', roomNumber: '78', locationId: 36, roomName: '4', companyId: 12, company: 'CNPC', groupType: 0, roomType: 1, category: 1, subcategory: 4, roomRemark: '', roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: 0, musterPointName: 'MP#Security', rotationType: null, rotatorOnly: 0, ipPhoneExt: '27636', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
  { id: 446, roomKey: '79', roomNumber: '79', locationId: 36, roomName: '5', companyId: 12, company: 'CNPC', groupType: 0, roomType: 1, category: 1, subcategory: 4, roomRemark: '', roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: 1, musterPointName: 'MP#2', rotationType: null, rotatorOnly: 0, ipPhoneExt: '27662', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
  { id: 447, roomKey: '80', roomNumber: '80', locationId: 36, roomName: '6', companyId: 12, company: 'CNPC', groupType: 0, roomType: 2, category: 1, subcategory: 4, roomRemark: null, roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: null, musterPointName: null, rotationType: '5', rotatorOnly: 1, ipPhoneExt: '27546', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
  { id: 448, roomKey: '81', roomNumber: '81', locationId: 36, roomName: '7', companyId: 12, company: 'CNPC', groupType: 0, roomType: 2, category: 1, subcategory: 4, roomRemark: null, roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: null, musterPointName: null, rotationType: '5', rotatorOnly: 1, ipPhoneExt: '27545', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
  { id: 449, roomKey: '82', roomNumber: '82', locationId: 36, roomName: '8', companyId: 12, company: 'CNPC', groupType: 0, roomType: 1, category: 1, subcategory: 4, roomRemark: null, roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: null, musterPointName: null, rotationType: null, rotatorOnly: 0, ipPhoneExt: '27541', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
  { id: 450, roomKey: '83', roomNumber: '83', locationId: 36, roomName: '9', companyId: 9, company: 'PERTAMINA', groupType: 0, roomType: 2, category: 1, subcategory: 4, roomRemark: '', roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: 1, musterPointName: 'MP#2', rotationType: '1', rotatorOnly: 1, ipPhoneExt: '27283', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 2, roomOwnershipName: 'PERT', color: '#fce4d6', vipPaxName: null, tcard: 2 },
  { id: 451, roomKey: '84', roomNumber: '84', locationId: 36, roomName: '10', companyId: 12, company: 'CNPC', groupType: 0, roomType: 2, category: 1, subcategory: 4, roomRemark: null, roomStatus: 1, keyNumber: 1, barea: 'Zone 3', musterPointId: null, musterPointName: null, rotationType: '5', rotatorOnly: 1, ipPhoneExt: '27516', campId: 31, camp: 'DS6C-1', zoneId: 32, zone: 'zone-3', buildingId: 36, building: 'BUILDING-3', categoryName: 'Guest Room', subcategoryName: 'Wet Room', b2bPaxName1: null, b2bPaxName2: null, roomOwnershipId: 1, roomOwnershipName: 'CNPC', color: '#ed7d31', vipPaxName: null, tcard: 2 },
]

/** 生成其它楼栋的示意房间（便于三级级联切换时下拉有内容，非真实数据） */
function makeDemoRooms(
  building: CampNode,
  zone: CampNode,
  camp: CampNode,
  startId: number,
  roomNumbers: string[],
): RoomOption[] {
  return roomNumbers.map((no, i) => ({
    id: startId + i,
    roomKey: no,
    roomNumber: no,
    locationId: building.id,
    roomName: no,
    companyId: 12,
    company: 'CNPC',
    groupType: 0,
    roomType: 2,
    category: 1,
    subcategory: 4,
    roomRemark: null,
    roomStatus: 1,
    keyNumber: 1,
    barea: zone.name,
    musterPointId: null,
    musterPointName: null,
    rotationType: null,
    rotatorOnly: 0,
    ipPhoneExt: '',
    campId: camp.id,
    camp: camp.name,
    zoneId: zone.id,
    zone: zone.name,
    buildingId: building.id,
    building: building.name,
    categoryName: 'Guest Room',
    subcategoryName: 'Wet Room',
    b2bPaxName1: null,
    b2bPaxName2: null,
    roomOwnershipId: 1,
    roomOwnershipName: 'CNPC',
    color: '#ed7d31',
    vipPaxName: null,
    tcard: 2,
  }))
}

/** 房间列表 mock 索引：key = 楼栋 id */
const ROOMS: Map<number, RoomOption[]> = new Map()
ROOMS.set(36, BUILDING_3_ROOMS)
// 其余楼栋补少量示意房间，仅为级联演示可用
CAMP_TREE.forEach((camp) => {
  ;(camp.children ?? []).forEach((zone) => {
    ;(zone.children ?? []).forEach((b) => {
      if (ROOMS.has(b.id)) return
      ROOMS.set(b.id, makeDemoRooms(b, zone, camp, b.id * 100, ['101', '102', '103/104']))
    })
  })
})

/** 是否楼栋：叶子节点（无 children） */
export function isBuilding(node: CampNode): boolean {
  return !node.children || node.children.length === 0
}

/** 获取营地三级树（mock；接接口时改为 await fetch） */
export function getCampTree(): CampNode[] {
  return CAMP_TREE
}

/** 按楼栋 id 查询房间列表（mock；接接口时改为 await fetch） */
export function getRoomsByBuilding(locationId: number): RoomOption[] {
  return ROOMS.get(locationId) ?? []
}

/**
 * 按楼栋 id 反查三级名称：营地 / 区域 / 楼栋。
 * 找不到返回 null（兼容旧数据里已不存在的楼栋 id）。
 */
export function findCampPathByBuildingId(
  buildingId: number,
): { camp: CampNode; zone: CampNode; building: CampNode } | null {
  for (const camp of CAMP_TREE) {
    for (const zone of camp.children ?? []) {
      for (const b of zone.children ?? []) {
        if (b.id === buildingId) return { camp, zone, building: b }
      }
    }
  }
  return null
}

/** 按房间号反查所属楼栋（遍历所有楼栋房间，用于旧数据通过 roomNo 推断归属） */
export function findBuildingByRoomNumber(roomNumber: string): RoomOption | null {
  if (!roomNumber) return null
  for (const rooms of ROOMS.values()) {
    const hit = rooms.find((r) => r.roomNumber === roomNumber)
    if (hit) return hit
  }
  return null
}

/**
 * 房间号显示格式化：含 "/" 的换行，"73/74" → "73\n/\n74"。
 * 斜杠两侧若有空格先去掉，避免产生多余空行；无斜杠原样返回。
 */
export function formatRoomNoForDisplay(roomNo: string): string {
  if (!roomNo) return ''
  if (!roomNo.includes('/')) return roomNo
  return roomNo
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n/\n')
}
