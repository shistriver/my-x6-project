/**
 * 公司归属配色数据
 * ------------------------------------------------------------------
 * 数据来源：后端接口返回的公司颜色列表（roomOwnership → 颜色）。
 * 当前以提供的样例数据作为本地默认值，后续可把 getCompanyColors()
 * 替换为接口请求（保持返回结构不变即可，UI 侧无需改动）。
 *
 * 房间节点（编号房间）的「顶部色条 / 填充色 / 描边色」共用所选公司的颜色，
 * 由归属下拉框统一驱动。
 */

/** 单条公司颜色记录（与接口返回字段一一对应） */
export interface CompanyColor {
  id: number
  /** 归属编码（唯一，下拉框以此作为选中值） */
  roomOwnership: number
  /** 归属名称，如 CNPC / PERT / WASHROOM */
  roomOwnershipName: string
  /** 关联公司 id（部分公共区域为 null） */
  companyId: number | null
  /** 该归属的代表色（十六进制） */
  color: string
  createdAt: string | null
}

/**
 * 默认公司颜色数据（接口样例）。
 * ⚠️ 注意：部分公共区域颜色为白色（#ffffff）或极浅色，
 *     作为「填充 + 描边」同色时可能与白底画布融合、视觉偏弱，
 *     如需更明显可在此调整对应 color，或后续由接口下发更合适的颜色。
 */
export const COMPANY_COLORS: CompanyColor[] = [
  { id: 1, roomOwnership: 1, roomOwnershipName: 'CNPC', companyId: 12, color: '#ed7d31', createdAt: null },
  { id: 2, roomOwnership: 2, roomOwnershipName: 'PERT', companyId: null, color: '#fce4d6', createdAt: null },
  { id: 3, roomOwnership: 3, roomOwnershipName: 'WOOD', companyId: 7, color: '#1f4e78', createdAt: null },
  { id: 4, roomOwnership: 4, roomOwnershipName: 'CRG', companyId: 18, color: '#e7c871', createdAt: null },
  { id: 5, roomOwnership: 6, roomOwnershipName: 'G.W', companyId: 10, color: '#808080', createdAt: null },
  { id: 6, roomOwnership: 7, roomOwnershipName: 'ISOS', companyId: 50, color: '#ff0000', createdAt: null },
  { id: 7, roomOwnership: 8, roomOwnershipName: 'ALBUSTAN', companyId: 15, color: '#2f75b5', createdAt: null },
  { id: 8, roomOwnership: 9, roomOwnershipName: 'AIRSWIFT', companyId: 8, color: '#7030a0', createdAt: null },
  { id: 9, roomOwnership: 10, roomOwnershipName: 'ALMCO', companyId: 27, color: '#239fdd', createdAt: null },
  { id: 10, roomOwnership: 11, roomOwnershipName: 'COFFIE STATION', companyId: null, color: '#806000', createdAt: null },
  { id: 11, roomOwnership: 12, roomOwnershipName: 'WASHROOM', companyId: null, color: '#ffffff', createdAt: null },
  { id: 12, roomOwnership: 13, roomOwnershipName: 'OFFICES', companyId: null, color: '#660033', createdAt: null },
  { id: 13, roomOwnership: 14, roomOwnershipName: 'STORE', companyId: null, color: '#1fbb7d', createdAt: null },
  { id: 14, roomOwnership: 15, roomOwnershipName: 'MASQUE', companyId: null, color: '#ffffff', createdAt: null },
  { id: 15, roomOwnership: 16, roomOwnershipName: 'IT ROOM', companyId: null, color: '#e2efda', createdAt: null },
  { id: 16, roomOwnership: 17, roomOwnershipName: 'OPEN', companyId: null, color: '#f5f8d2', createdAt: null },
  { id: 17, roomOwnership: 18, roomOwnershipName: 'SENTINEL', companyId: null, color: '#cfdf81', createdAt: null },
  { id: 18, roomOwnership: 19, roomOwnershipName: 'BOC', companyId: null, color: '#8ada86', createdAt: null },
  { id: 19, roomOwnership: 20, roomOwnershipName: 'ITOCHU', companyId: 17, color: '#ec7474', createdAt: null },
]

/**
 * 获取公司颜色列表。
 * 当前直接返回本地默认值；接入真实接口时，改为 await fetch(...) 即可，
 * 返回结构保持 CompanyColor[] 不变。
 */
export function getCompanyColors(): CompanyColor[] {
  return COMPANY_COLORS
}

/** 按 roomOwnership 编码查找公司颜色，找不到返回 undefined */
export function getCompanyColorByOwnership(
  roomOwnership: number | null | undefined,
): CompanyColor | undefined {
  if (roomOwnership === null || roomOwnership === undefined) return undefined
  return COMPANY_COLORS.find((c) => c.roomOwnership === roomOwnership)
}
