/**
 * ThoughtDAG 自己需要的宿主数据形状。
 *
 * 这些类型曾经从 Maintenance 仓库的 `@linmu/dsh-session-contracts` 里以
 * `file:` 依赖引入 —— 那让「本插件不依赖 Maintenance」在安装层面并不成立。
 * 现在按本仓库实际读写的字段就地声明：只描述 DAG 真正触碰的宿主数据，
 * 不复制那份合同的其余部分，也不引入任何 maintenance 概念。
 *
 * 宿主侧的真实来源是 Core 的会话扩展数据端口（`sessionExtensionData`）与
 * 会话引用端口（`sessionReferenceContext`）；DAG 只经 `/thoughtdag/api/managed/*`
 * 读自己的数据。
 */

/** 宿主扩展对象的作用域：实例 + profile + 命名空间。 */
export type ExtensionScope = { instanceId: string; profileId: string; namespace: string }

/** 宿主扩展对象的内容。 */
export type ExtensionContent = {
  schemaVersion: number
  title: string
  body: unknown
  references?: Array<{ logicalSessionId: string; messageId?: string; anchorId?: string; sourceVersion?: string }>
}

/** 宿主扩展对象的元数据。 */
export type ExtensionMetadata = {
  scope: ExtensionScope
  objectId: string
  writerId: string
  revision: number
  schemaVersion: number
  title: string
  deleted: boolean
  updatedAt: string
  bytes: number
  conflicts: number
}

/** 一个可读的宿主扩展对象。 */
export interface ExtensionObject extends ExtensionMetadata {
  content: ExtensionContent
}

/** 扩展对象分页。 */
export type ExtensionPage = { items: ExtensionObject[]; nextCursor: string | null }

/** 会话的稳定身份。独立部署下 id 就是会话身份，两个字段同值。 */
export interface GraphSessionIdentity {
  logicalSessionId: string
  nativeSessionId: string
  title: string
}

/** 一段固定来源选区的捕获身份。 */
export interface GraphCapture {
  sourceSessionId: string
  anchorId: string
  messageId: string
  role: 'assistant'
  occurrence: number
  selectedText: string
}

/** 预览页：固定来源版本下的一段可读文本。 */
export interface GraphPreviewPage extends GraphSessionIdentity {
  sourceVersionId: string
  items: Array<{ eventId: string; role: string; text: string; offset: number; complete: boolean }>
  capture: GraphCapture
  nextCursor: string | null
  hasMore: boolean
}

/** 来源会话里一条已登记的上游引用（只读视图）。 */
export interface GraphRelation {
  namespace: 'annotation-upstream'
  objectId: string
  revision: number
  referenceId: string
  sourceSessionId: string
  targetSessionId: string
  sourceVersionId: string
  cutoffEventId: string
  sourceAnchorId: string
  state: 'pending' | 'sent' | 'revoked'
  targetMessageId: string | null
}

/** 来源标记：某个来源选段已经把材料送进了哪个目标会话。 */
export interface GraphSourceMarker {
  objectId: string
  referenceId: string
  sourceVersionId: string
  sourceAnchorId: string
  messageId: string
  selectedText: string
  occurrence: number
  targetLogicalSessionId: string
  targetTitle: string
}

/** 来源标记分页。 */
export interface GraphSourceMarkerPage {
  items: GraphSourceMarker[]
  nextCursor: string | null
}

// —— 原生上下文管理的只读/写入形状（`SourceContextPanel` 用到的部分）——
// 只声明面板真正读写的字段，不复制那份合同里其余的原生上下文概念。

/** 已授权范围里的一个事件区间。 */
export interface NativeContextRange {
  startEventId: string
  endEventId: string
}

/** 一条可管理的权威来源。 */
export interface NativeContextSource {
  referenceId: string
  sourceSessionId: string
  sourceVersionId: string
  cutoffEventId: string
  title: string
  enabled: boolean
  window: NativeContextRange[] | null
  generation: number
  authorityState: 'pending' | 'sent' | 'revoked' | 'unavailable'
}

/** 一份实际保留在原生输入里的材料记录。 */
export interface NativeContextMaterial {
  materialId: string
  referenceIds: string[]
  releasedReferenceIds?: string[]
  kind: 'initial' | 'read' | 'search' | 'requests'
  bytes: number
  state: 'retained' | 'release-pending' | 'released' | 'unavailable'
  pinnedByUser: boolean
  pinnedByModel: boolean
  createdAt: string
  ranges: Array<{ referenceId: string; eventId: string; start: number; end: number }>
}

/** 一条已登记的管理操作及其生效状态。 */
export interface NativeContextOperation {
  operationId: string
  action: string
  actor: 'user' | 'model' | 'host'
  state: 'applied' | 'pending-next-step' | 'failed' | 'unsupported'
  reason: string
  createdAt: string
}

/** 原生上下文状态文档。 */
export interface NativeContextDocument {
  protocolVersion: 1
  objectId: string
  revision: number
  nativeSessionId: string
  schemaVersion: 1
  kind: 'native-context'
  ownerSessionId: string
  sources: NativeContextSource[]
  materials: NativeContextMaterial[]
  operations: NativeContextOperation[]
  trimmedMaterials: number
  trimmedOperations: number
}

/** 用户请求索引里的一条请求。 */
export interface UserRequestEntry {
  requestId: string
  eventId: string
  ordinal: number
  createdAt: string | null
  text: string
  totalChars: number
  textOffset: number
  nextTextCursor: string | null
  sourceTrust: 'verified' | 'unverified'
  attachmentRefs: Array<{ id: string; type: string; name: string | null; mimeType: string | null }>
  attachmentsOmitted: number
  replyRefs: Array<{ eventId: string; nativeMessageId: string | null; completed: boolean }>
  relation: 'initial' | 'supplement' | 'unknown'
  state: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown'
  associationState: 'verified' | 'partial' | 'unknown'
  location: { requestEventId: string; startEventId: string; endEventId: string; replyEventId: string | null; readCursor: string; rangeState: 'complete' | 'partial' | 'request-only' } | null
}

/** 用户请求索引分页。 */
export interface UserRequestPage {
  schemaVersion: 1
  snapshot: string
  logicalSessionId: string
  sourceVersionId: string
  referenceId: string | null
  cutoffEventId: string | null
  directoryOnly: true
  items: UserRequestEntry[]
  nextCursor: string | null
  hasMore: boolean
  remainingBytes: number
  budgetExhausted: boolean
}

/** 固定问答范围的只读预览页。 */
export interface SessionContextPage {
  referenceId: string
  sourceSessionId: string
  sourceVersionId: string
  cutoffEventId: string
  items: Array<{ eventId: string; role: string; text: string; offset: number; complete: boolean; readCursor?: string }>
  nextCursor: string | null
  hasMore: boolean
  remainingBytes: number
  budgetExhausted: boolean
}
