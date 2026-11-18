/**
 * 营地地图列表的数据与本地存储
 * ------------------------------------------------------------------
 * 当前以 localStorage 持久化（与草稿/预览一致），后续若要接后端，
 * 把下面几个函数改成接口请求即可，组件层无需改动。
 *
 * 位置（location）用 el-cascader 多选，值为「路径数组的数组」(string[][])，
 * 例如 [['middle-east','me-ruwais'], ['africa','af-lagos']]。
 */

/** 单条营地地图记录 */
export interface CampMap {
  id: string
  /** 地图名称 */
  mapName: string
  /** 位置多选：每项为一条级联路径（从根到叶的值数组） */
  location: string[][]
  /** 画布内容（X6 toJSON 序列化字符串）；null = 尚未保存过内容（空白画布） */
  content: string | null
  createdAt: number
  updatedAt: number
}

/** 级联选项节点 */
export interface CascaderNode {
  value: string
  label: string
  children?: CascaderNode[]
}

/**
 * 位置级联选项（占位示例：区域 → 营地）。
 * ⚠️ 实际数据可在此直接替换，或改为接口下发；组件只依赖结构，不依赖具体内容。
 */
export const LOCATION_OPTIONS: CascaderNode[] = [
  {
    value: 'middle-east',
    label: '中东',
    children: [
      { value: 'me-ruwais', label: 'Ruwais Camp' },
      { value: 'me-habshan', label: 'Habshan Camp' },
      { value: 'me-bab', label: 'BAB Camp' },
    ],
  },
  {
    value: 'africa',
    label: '非洲',
    children: [
      { value: 'af-lagos', label: 'Lagos Camp' },
      { value: 'af-luanda', label: 'Luanda Camp' },
    ],
  },
  {
    value: 'asia',
    label: '亚洲',
    children: [
      { value: 'as-dubai', label: 'Dubai Camp' },
      { value: 'as-sharjah', label: 'Sharjah Camp' },
    ],
  },
]

const STORAGE_KEY = 'camp-maps'

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 读取全部营地地图（按创建时间升序） */
export function loadCampMaps(): CampMap[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as CampMap[]
    return Array.isArray(list) ? list.sort((a, b) => a.createdAt - b.createdAt) : []
  } catch {
    return []
  }
}

/** 覆盖写入全部营地地图 */
export function saveCampMaps(list: CampMap[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

/** 新建一条记录（返回新记录，已写入存储；content 初始为 null = 空白画布） */
export function createCampMap(mapName: string, location: string[][]): CampMap {
  const now = Date.now()
  const map: CampMap = {
    id: genId(),
    mapName: mapName.trim(),
    location,
    content: null,
    createdAt: now,
    updatedAt: now,
  }
  const list = loadCampMaps()
  list.push(map)
  saveCampMaps(list)
  return map
}

/** 修改一条记录（按 id 更新名称与位置） */
export function updateCampMap(id: string, mapName: string, location: string[][]): void {
  const list = loadCampMaps()
  const i = list.findIndex((m) => m.id === id)
  if (i >= 0) {
    list[i] = { ...list[i], mapName: mapName.trim(), location, updatedAt: Date.now() }
    saveCampMaps(list)
  }
}

/** 保存某地图的画布内容（按 id；地图不存在则静默忽略，避免误重建已删除记录） */
export function updateCampMapContent(id: string, content: string): void {
  const list = loadCampMaps()
  const i = list.findIndex((m) => m.id === id)
  if (i >= 0) {
    list[i] = { ...list[i], content, updatedAt: Date.now() }
    saveCampMaps(list)
  }
}

/** 删除一条记录（按 id） */
export function deleteCampMap(id: string): void {
  const list = loadCampMaps().filter((m) => m.id !== id)
  saveCampMaps(list)
}

// 把所有节点的值 → 标签 摊平成 Map，供路径反查标签
function buildLabelMap(options: CascaderNode[], map = new Map<string, string>()): Map<string, string> {
  for (const o of options) {
    map.set(o.value, o.label)
    if (o.children?.length) buildLabelMap(o.children, map)
  }
  return map
}

/** 把多选级联值（string[][]）解析为可读标签数组，每条用 " / " 连接路径 */
export function resolveLocationLabels(value: string[][], options: CascaderNode[] = LOCATION_OPTIONS): string[] {
  const map = buildLabelMap(options)
  return (value ?? []).map((path) => path.map((v) => map.get(v) ?? v).join(' / '))
}
