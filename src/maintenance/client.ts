import type { ManagedGraph, UpstreamRelation } from './model'

export type Status = { protocolVersion: 2; mode: 'maintenance'; capabilities: { storage: boolean; sessions: boolean; references: boolean; mainGraph: boolean }; reason?: string }
export type Page<T> = { items: T[]; nextCursor?: string | null }
export type DirectoryItem = { id: string; title: string; logicalSessionId?: string }
export type SessionIdentity = { logicalSessionId: string; nativeSessionId: string; title: string }
export type Capture = { sourceSessionId: string; anchorId: string; messageId?: string; role: 'assistant'; occurrence: 0; selectedText: string; expectedSourceVersionId?: string }
export type Preview = { logicalSessionId: string; nativeSessionId: string; sourceVersionId: string; items: { eventId: string; role: 'user' | 'assistant'; text: string; offset: number; complete: boolean }[]; capture?: Capture; nextCursor?: string | null; hasMore: boolean }
export type ExtensionObject = { objectId: string; title: string; revision: number; deleted: boolean; scope: { namespace: string }; schemaVersion: number; content?: { schemaVersion: number; title: string; body: unknown; references?: { logicalSessionId: string; messageId?: string }[] } }
export type ExtensionDetail = { object: ExtensionObject }
export type SaveResult = { status: 'saved' | 'unchanged'; object: ExtensionObject } | { status: 'conflict'; conflict: { current: ExtensionObject } }
export type GraphDocument = { objectId: string; revision: number; title: string; graph: ManagedGraph; reused?: boolean; draftObjectId?: string }
export type DisclosurePage = { items: { receiptId: string; referenceId: string; executionId: string; operation: 'initial' | 'read' | 'search' | 'preview'; delivery: 'prepared' | 'returned' | 'failed'; status: 'ok' | 'empty' | 'budget-exhausted' | 'unavailable' | 'revoked'; sourceVersionId: string; cutoffEventId: string; recordedAt: string; returnedBytes: number; ranges: { eventId: string; start: number; end: number; complete?: boolean }[]; next?: { eventId: string; offset: number } | null; hasMore: boolean; truncated: boolean; selectedTurnComplete?: boolean }[]; nextCursor: string | null; trimmed: boolean; trimmedCount: number; maxEntries: number; maxBytes: number }

export function captureFromPreview(preview: Preview, selectedText: string): Capture {
  if (!preview.capture) throw new Error('这段回复暂时不能建立引用。')
  return { ...preview.capture, selectedText, expectedSourceVersionId: preview.sourceVersionId }
}

export class ManagedApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.name = 'ManagedApiError'; this.status = status }
}

const BASE = '/thoughtdag/api/managed'

async function request<T>(endpoint: string, query: Record<string, string | undefined> = {}, body?: unknown): Promise<T> {
  const url = new URL(`${BASE}/${endpoint}`, window.location.origin)
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value)
  const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(30_000), ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const result = await response.json().catch(() => null) as { error?: string | { message?: string }; message?: string; status?: string } | null
  if (!response.ok) {
    const message = typeof result?.error === 'string' ? result.error : result?.error?.message ?? result?.message
    throw new ManagedApiError(message ?? `请求未完成（${response.status}），请重试。`, response.status)
  }
  if (!result) throw new ManagedApiError('服务未返回有效数据，请检查扩展连接。', response.status)
  return result as T
}

export const managedApi = {
  status: () => request<Status>('status'),
  directory: (workspaceId?: string, after?: string) => request<Page<DirectoryItem>>('directory', { workspaceId, after }),
  resolve: (logicalSessionId: string) => request<SessionIdentity>('resolve', { logicalSessionId }),
  resolveNative: (nativeSessionId: string) => request<SessionIdentity>('resolve', { nativeSessionId }),
  preview: (logicalSessionId: string, cursor?: string, sourceVersionId?: string, sourceAnchorId?: string) => request<Preview>('preview', cursor ? { logicalSessionId, cursor } : { logicalSessionId, sourceVersionId, sourceAnchorId }),
  relations: (logicalSessionId: string, after?: string) => request<Page<UpstreamRelation>>('relations', { logicalSessionId, after }),
  objects: (namespace: string, after?: string) => request<Page<ExtensionObject>>('objects', { namespace, after }),
  object: (namespace: string, objectId: string) => request<ExtensionDetail>('object', { namespace, objectId }),
  canvases: (after?: string) => request<Page<ExtensionObject>>('canvases', { after }),
  canvas: (objectId: string) => request<GraphDocument>('canvas', { objectId }),
  ensure: (logicalSessionId: string) => request<GraphDocument>('ensure', {}, { logicalSessionId }),
  bind: (objectId: string, expectedRevision: number, logicalSessionId: string) => request<GraphDocument>('bind', {}, { objectId, expectedRevision, logicalSessionId }),
  save: (input: { objectId?: string; expectedRevision: number; title?: string; graph: ManagedGraph }) => request<GraphDocument>('save', {}, input),
  remove: (input: { objectId: string; expectedRevision: number; nodeIds?: string[]; edgeIds?: string[]; operationId: string }) => request<GraphDocument>('remove', {}, input),
  createWorkspaces: (after?: string) => request<Page<DirectoryItem>>('create-workspaces', { after }),
  disclosures: (objectId: string, after?: string) => request<DisclosurePage>('disclosures', { objectId, after }),
  createSession: (operationId: string, workspaceId: string, title?: string) => request<SessionIdentity>('create-session', {}, { operationId, workspaceId, title }),
}

type ParentInputs = {
  'open-session': { nativeSessionId: string; referenceIds?: string[] }
  'add-reference': { targetSessionId: string; capture: Capture; operationId: string }
  'delete-reference': { nativeSessionId: string; referenceId: string }
  'open-object': { namespace: string; objectId: string }
  'session-sticker': { capture?: Capture }
}
type ParentRequestArgs = { [Operation in keyof ParentInputs]: [operation: Operation, input: ParentInputs[Operation]] }[keyof ParentInputs]

export function parentRequest<T = unknown>(...[operation, input]: ParentRequestArgs): Promise<T> {
  if (window.parent === window) return Promise.reject(new Error('请从当前实例的图谱面板打开，才能进入会话或操作引用。'))
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const cleanup = () => { window.removeEventListener('message', listener); window.clearTimeout(timer) }
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return
      const data = event.data as { source?: string; type?: string; requestId?: string; ok?: boolean; error?: string; result?: T } | null
      if (!data || data.source !== 'dsh-thoughtdag' || data.type !== 'td:managed-result' || data.requestId !== requestId) return
      cleanup()
      if (data.ok === true) resolve(data.result as T)
      else reject(new Error(typeof data.error === 'string' ? data.error : '会话操作未完成，请重试。'))
    }
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('会话操作暂未确认，请返回目标会话检查引用状态后再重试。')) }, 30_000)
    window.addEventListener('message', listener)
    window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:managed-request', requestId, operation, input }, window.location.origin)
  })
}
