import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { FileText, GitBranch, Layers, MessageSquare, MoreHorizontal, Plus, RefreshCw, Save, StickyNote, X } from 'lucide-react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, applyNodeChanges } from '@xyflow/react'
import type { Connection, Edge, Node, NodeChange, NodeProps, ReactFlowInstance, Viewport } from '@xyflow/react'
import { captureFromPreview, managedApi, parentRequest } from './client'
import type { Capture, DirectoryItem, ExtensionObject, GraphDocument, Preview, SessionIdentity, Status } from './client'
import { acceptCanvasBody, addPlaceholder, addSessionNode, arrangeBySources, bindPlaceholder, connectPending, createActionGuard, EMPTY_GRAPH, importRelations, nextPosition, NODE_LABELS, relationPresentation } from './model'
import type { GraphNode, GraphNodeData, ManagedGraph, UpstreamRelation } from './model'
import { DisclosurePanel } from './DisclosurePanel'
import { graphReferenceIds, layoutDraft, reconcileGraph } from './sync'
import '@xyflow/react/dist/style.css'
import './managed.css'

type CanvasNode = Node<GraphNodeData, 'managed'>
type Picker = { purpose: 'add' | 'reference' | 'create'; nodeId?: string; capture?: Capture; operationId: string; position?: { x: number; y: number } }
type Menu = { x: number; y: number; nodeId?: string; edgeId?: string; position?: { x: number; y: number } }
type ConnectionDraft = { source: string; target: string; operationId: string; preview: Preview }
type Bounds = { sourceVersionId: string; sourceAnchorId: string }
type Cleanup = { nativeSessionId: string; referenceId: string }
const OBJECT_TYPES = [{ namespace: 'stickers', label: '会话贴纸与已迁移注释', kind: 'sticker' as const }, { namespace: 'annotation', label: '旧注释引用', kind: 'sticker' as const }, { namespace: 'obsidian-links', label: '笔记引用', kind: 'note' as const }]
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。'

const nodeIcons = { session: MessageSquare, sticker: StickyNote, material: FileText, note: FileText, placeholder: Plus }
function ManagedNode({ data, selected }: NodeProps<CanvasNode>) {
  const Icon = nodeIcons[data.kind]
  return <div className={`mg-node mg-node-${data.kind}${selected ? ' mg-selected' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="mg-node-heading"><span className="mg-node-kind"><Icon aria-hidden="true" />{NODE_LABELS[data.kind]}</span></div>
    <strong className="mg-node-title">{data.label || '未命名'}</strong>
    <span className="mg-node-hint">{data.kind === 'placeholder' ? '开始会话时选择工作区' : data.logicalSessionId ? '真实会话 · 按需读取来源' : '已保存的来源对象'}</span>
    <button className="mg-node-more nodrag" data-more="true" aria-label={`${data.label}的更多操作`}><MoreHorizontal className="mg-icon" aria-hidden="true" /></button>
    <Handle type="source" position={Position.Bottom} />
  </div>
}
const nodeTypes = { managed: ManagedNode }

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const element = useRef<HTMLElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; element.current?.focus(); return () => { if (previous?.isConnected) previous.focus() } }, [])
  return <div className="mg-dialog-backdrop" onClick={onClose}><section ref={element} tabIndex={-1} className="mg-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
    if (!controls.length) { event.preventDefault(); return }
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === element.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element.current)) { event.preventDefault(); first.focus() }
  }}><header><h2>{title}</h2><button onClick={onClose} aria-label="关闭"><X className="mg-icon" aria-hidden="true" /></button></header><div className="mg-dialog-content">{children}</div></section></div>
}

function SessionPicker({ picker, busy, error, onClose, onSelect, onCreate }: { picker: Picker; busy: boolean; error: string; onClose: () => void; onSelect: (item: DirectoryItem) => void; onCreate: (workspaceId: string) => void }) {
  const [workspace, setWorkspace] = useState<DirectoryItem | null>(null), [items, setItems] = useState<DirectoryItem[]>([]), [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState('')
  const ticket = useRef(0), pending = useRef(false)
  const load = useCallback(async (after?: string) => {
    if (pending.current) return
    pending.current = true; setLoading(true); setLoadError(''); const current = ++ticket.current
    try {
      const page = picker.purpose === 'create' ? await managedApi.createWorkspaces(after) : await managedApi.directory(workspace?.id, after)
      if (current !== ticket.current) return
      setItems(old => after ? [...old, ...page.items.filter(item => !old.some(row => row.id === item.id))] : page.items); setCursor(page.nextCursor ?? undefined)
    } catch (cause) { if (current === ticket.current) setLoadError(errorText(cause)) }
    finally { if (current === ticket.current) { pending.current = false; setLoading(false) } }
  }, [workspace, picker.purpose])
  useEffect(() => { const counter = ticket, active = pending; void load(); return () => { counter.current++; active.current = false } }, [load])
  const creating = picker.purpose === 'create'
  return <Dialog title={creating ? '选择新会话的工作区' : picker.purpose === 'reference' ? '引用到会话' : '添加已有会话'} onClose={onClose}><p>{creating ? '选择工作区后确认创建；取消不会创建会话。' : workspace ? workspace.title : '先选择工作区，再选择会话。'}</p>{workspace && !creating && <button disabled={busy} onClick={() => setWorkspace(null)}>← 返回工作区</button>}<div className="mg-picker-list" onScroll={event => { const el = event.currentTarget; if (cursor && el.scrollHeight - el.scrollTop - el.clientHeight < 80) void load(cursor) }}>{items.map(item => <button key={item.id} className={`mg-picker-item${creating && workspace?.id === item.id ? ' active' : ''}`} disabled={busy} onClick={() => creating || !workspace ? setWorkspace(item) : onSelect(item)}><span>{item.title || '未命名'}</span><span>{creating ? workspace?.id === item.id ? '已选择' : '选择' : workspace ? '添加' : '›'}</span></button>)}{!loading && !items.length && <p>此处暂时没有可用项目。</p>}{loading && <p>正在加载…</p>}{cursor && <button disabled={loading || busy} onClick={() => void load(cursor)}>加载更多</button>}{loadError && <p className="mg-error" role="alert">{loadError}<button onClick={() => void load(cursor)}>重试</button></p>}</div>{error && <p className="mg-error" role="alert">{error}</p>}{creating && <footer><button className="mg-primary" disabled={!workspace || busy} onClick={() => onCreate(workspace!.id)}>{busy ? '正在创建并绑定…' : '在所选工作区创建并绑定'}</button></footer>}</Dialog>
}

export default function ManagedGraphApp() {
  const [status, setStatus] = useState<Status | null>(null), [document, setDocument] = useState<GraphDocument | null>(null), [graph, setGraph] = useState<ManagedGraph>(EMPTY_GRAPH), [title, setTitle] = useState('未绑定主干草稿')
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [shown, setShown] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0), [syncError, setSyncError] = useState(''), [startFailureId, setStartFailureId] = useState<string | null>(null)
  const creations = useRef(new Map<string, { workspaceId: string; identity?: SessionIdentity }>())
  const [currentSession, setCurrentSession] = useState<{ id: string; title?: string } | null>(null)
  const [library, setLibrary] = useState(false), [canvases, setCanvases] = useState<ExtensionObject[]>([]), [canvasCursor, setCanvasCursor] = useState<string | undefined>()
  const [menu, setMenu] = useState<Menu | null>(null), [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]), [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([])
  const [picker, setPicker] = useState<Picker | null>(null), [connectSource, setConnectSource] = useState<string | null>(null), [connection, setConnection] = useState<ConnectionDraft | null>(null)
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null), [preview, setPreview] = useState<Preview | null>(null), [previewBusy, setPreviewBusy] = useState(false), [previewError, setPreviewError] = useState(''), [selection, setSelection] = useState<{ text: string; capture: Capture } | null>(null)
  const [relations, setRelations] = useState<UpstreamRelation[]>([]), [relationCursor, setRelationCursor] = useState<string | undefined>(), [confirmedDrafts, setConfirmedDrafts] = useState<Set<string>>(() => new Set()), [logEdgeId, setLogEdgeId] = useState<string | null>(null)
  const [showObjects, setShowObjects] = useState(false), [objectType, setObjectType] = useState(OBJECT_TYPES[0]), [objects, setObjects] = useState<ExtensionObject[]>([]), [objectCursor, setObjectCursor] = useState<string | undefined>()
  const [sourceChoices, setSourceChoices] = useState<{ nodeId: string; bounds: Bounds[] } | null>(null)
  const repairPage = useRef<{ owner: string; after?: string } | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null), [rename, setRename] = useState(''), [cleanup, setCleanup] = useState<Cleanup[]>([])
  const guard = useRef(createActionGuard()), flow = useRef<ReactFlowInstance<CanvasNode, Edge> | null>(null), previewTicket = useRef(0), presentedNative = useRef<string | null>(null)
  const docRef = useRef(document), graphRef = useRef(graph), dirtyRef = useRef(dirty), titleRef = useRef(title)
  const refreshPending = useRef(true), refreshActive = useRef(false), busyRef = useRef(busy)
  docRef.current = document; graphRef.current = graph; dirtyRef.current = dirty; titleRef.current = title
  busyRef.current = busy
  const archived = !!graph.archivedAt
  const editable = !!document && !busy && !archived && status?.capabilities.mainGraph === true
  const accept = useCallback((value: GraphDocument) => {
    const body = acceptCanvasBody(value.graph)
    setDocument(value); setGraph(body); setTitle(value.title); setDirty(false); docRef.current = value; graphRef.current = body; dirtyRef.current = false; titleRef.current = value.title; setSelectedNodeIds([]); setSelectedEdgeIds([]); setMenu(null)
  }, [])
  const run = useCallback(async (action: () => Promise<void>) => {
    if (!guard.current.begin()) return
    busyRef.current = true; setBusy(true); setError(''); setNotice(''); setStartFailureId(null)
    try { await action() } catch (cause) { setError(errorText(cause)) } finally { guard.current.end(); busyRef.current = false; setBusy(false) }
  }, [])
  const change = (next: ManagedGraph) => { setGraph(next); graphRef.current = next; dirtyRef.current = true; setDirty(true) }
  const edit = (operation: (old: ManagedGraph) => ManagedGraph) => { if (editable) guard.current.edit(() => change(operation(graphRef.current))) }
  const persist = async (next = graphRef.current) => {
    if (graphRef.current.archivedAt || next.archivedAt) throw new Error('主干会话已归档，当前布局仍保留。请先恢复会话，或另存布局草稿。')
    const old = docRef.current, result = await managedApi.save({ ...(old ? { objectId: old.objectId } : {}), expectedRevision: old?.revision ?? 0, title: titleRef.current, graph: next })
    accept(result); return result
  }
  const preserveBeforeLeaving = async () => {
    if (!dirtyRef.current) return
    if (!graphRef.current.archivedAt) { await persist(); return }
    await managedApi.save({ expectedRevision: 0, title: `${titleRef.current} · 布局草稿`, graph: layoutDraft(graphRef.current) })
    setNotice('已归档主干的未保存布局已另存为草稿。')
  }
  const loadRelations = async (owner: string | null, after?: string) => {
    if (!owner) { setRelations([]); setRelationCursor(undefined); return }
    const page = await managedApi.relations(owner, after)
    setRelations(old => after ? [...old, ...page.items.filter(item => !old.some(row => row.referenceId === item.referenceId))] : page.items); setRelationCursor(page.nextCursor ?? undefined)
  }
  const loadDocument = async (value: GraphDocument) => { accept(value); await loadRelations(value.graph.archivedAt ? null : value.graph.ownerSessionId); if (!value.graph.viewport) window.requestAnimationFrame(() => window.requestAnimationFrame(() => { void flow.current?.fitView({ maxZoom: 1, padding: 0.2 }) })) }
  const showOwner = async (logicalSessionId: string) => { await preserveBeforeLeaving(); await loadDocument(await managedApi.ensure(logicalSessionId)) }
  const repairRelations = async () => {
    if (dirtyRef.current) await persist()
    const owner = graphRef.current.ownerSessionId
    if (!owner) return
    const page = await managedApi.relations(owner, repairPage.current?.owner === owner ? repairPage.current.after : undefined)
    let next = graphRef.current
    for (const relation of page.items) {
      if (relation.state === 'revoked' || relation.targetSessionId !== owner || next.removedRelationIds?.includes(relation.referenceId)) continue
      next = addSessionNode(next, await managedApi.resolve(owner))
      next = addSessionNode(next, await managedApi.resolve(relation.sourceSessionId), { upstreamOf: owner })
    }
    await persist(importRelations(next, page.items))
    setRelations(old => [...old.filter(row => !page.items.some(item => item.referenceId === row.referenceId)), ...page.items])
    setRelationCursor(page.nextCursor ?? undefined)
    repairPage.current = { owner, after: page.nextCursor ?? undefined }
    setNotice(page.nextCursor ? '已导入当前接收会话的本页已有引用；可继续导入下一页。未创建新权限。' : '当前接收会话的已有引用已核对；已撤销引用不会恢复。')
  }
  const createDraft = () => run(async () => { await preserveBeforeLeaving(); accept(await managedApi.save({ expectedRevision: 0, title: '未绑定主干草稿', graph: { ...EMPTY_GRAPH } })); setRelations([]) })
  const listCanvases = async (after?: string) => { const page = await managedApi.canvases(after); setCanvases(old => after ? [...old, ...page.items] : page.items); setCanvasCursor(page.nextCursor ?? undefined) }
  const refreshGraph = async (background = false) => {
    const before = docRef.current
    if (!before) return
    const incoming = await managedApi.canvas(before.objectId)
    incoming.graph = acceptCanvasBody(incoming.graph)
    const page = incoming.graph.ownerSessionId && !incoming.graph.archivedAt ? await managedApi.relations(incoming.graph.ownerSessionId) : undefined
    if (docRef.current !== before || (background && busyRef.current)) { refreshPending.current = true; return }
    const next = dirtyRef.current ? reconcileGraph(before.graph, graphRef.current, incoming.graph) : incoming.graph
    setDocument(incoming); docRef.current = incoming; setGraph(next); graphRef.current = next
    if (!dirtyRef.current || titleRef.current === before.title) { setTitle(incoming.title); titleRef.current = incoming.title }
    setRelations(page?.items ?? []); setRelationCursor(page?.nextCursor ?? undefined); setSyncError('')
    setSelectedNodeIds(old => old.filter(id => next.nodes.some(node => node.id === id)))
    setSelectedEdgeIds(old => old.filter(id => next.edges.some(edge => edge.id === id)))
    if (incoming.graph.archivedAt) {
      setPicker(null); setConnection(null); setConnectSource(null); setRenameId(null); setShowObjects(false)
      setCanvases(old => old.filter(item => item.objectId !== incoming.objectId))
    }
  }
  const refreshLatest = useRef(refreshGraph)
  refreshLatest.current = refreshGraph
  const requestRefresh = useCallback(() => { refreshPending.current = true; setRefreshTick(value => value + 1) }, [])
  useEffect(() => {
    const receive = (event: MessageEvent) => { if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.source !== 'dsh-thoughtdag') return; if (event.data.type === 'td:current-session') setCurrentSession(event.data.session ?? null); if (event.data.type === 'td:view') setShown(event.data.shown === true); if (event.data.type === 'td:graph-changed' || (event.data.type === 'td:view' && event.data.shown)) requestRefresh(); if (event.data.type === 'td:view' && event.data.shown && !graphRef.current.viewport) window.requestAnimationFrame(() => window.requestAnimationFrame(() => { void flow.current?.fitView({ maxZoom: 1, padding: 0.2 }) })) }
    window.addEventListener('message', receive); window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:request-current' }, window.location.origin)
    void run(async () => { const result = await managedApi.status(); setStatus(result); if (result.protocolVersion !== 2 || !result.capabilities.mainGraph) throw new Error(result.reason || '请更新匹配的会话主干图与维护插件。') })
    return () => window.removeEventListener('message', receive)
  }, [run, requestRefresh])
  useEffect(() => {
    if (!shown) return
    const visibility = () => { if (window.document.visibilityState !== 'hidden') requestRefresh() }
    const timer = window.setInterval(visibility, 10_000)
    window.addEventListener('focus', visibility); window.document.addEventListener('visibilitychange', visibility)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', visibility); window.document.removeEventListener('visibilitychange', visibility) }
  }, [shown, requestRefresh])
  useEffect(() => {
    if (!shown || !document || busy || refreshActive.current || !refreshPending.current) return
    refreshPending.current = false; refreshActive.current = true
    void refreshLatest.current(true).catch(cause => setSyncError(`主干状态尚未同步：${errorText(cause)}`)).finally(() => {
      refreshActive.current = false
      if (refreshPending.current && !busyRef.current) setRefreshTick(value => value + 1)
    })
  }, [shown, document, busy, refreshTick])
  const showOwnerLatest = useRef(showOwner)
  showOwnerLatest.current = showOwner
  useEffect(() => {
    if (!shown || !status?.capabilities.mainGraph || !currentSession || presentedNative.current === currentSession.id || busy) return
    presentedNative.current = currentSession.id
    void run(async () => { const identity = await managedApi.resolveNative(currentSession.id); await showOwnerLatest.current(identity.logicalSessionId) })
  }, [currentSession, status, shown, busy, run])
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault() }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload) }, [])
  useEffect(() => {
    if (!menu) return
    const previous = window.document.activeElement as HTMLElement | null
    window.document.querySelector<HTMLElement>('[role="menu"] button:not(:disabled)')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [menu])
  const cleanReferences = async (items: Cleanup[]) => {
    let pending = items
    for (const item of items) {
      try { await parentRequest('delete-reference', item); pending = pending.filter(row => row !== item); setCleanup(pending) }
      catch (cause) { setCleanup(pending); throw new Error(`连接已撤销，草稿气泡清理尚未完成：${errorText(cause)}`) }
    }
  }
  const remove = (nodeIds: string[], edgeIds: string[]) => run(async () => {
    if (!docRef.current) return
    const edges = graphRef.current.edges.filter(edge => edgeIds.includes(edge.id) || nodeIds.includes(edge.source) || nodeIds.includes(edge.target)), affected: Cleanup[] = []
    for (const edge of edges) {
      if (!edge.data.relationId) continue
      const target = graphRef.current.nodes.find(node => node.id === edge.target)?.data.logicalSessionId
      if (!target) throw new Error('连接目标身份缺失，请先在维护面板恢复关系。')
      const identity = await managedApi.resolve(target); affected.push({ nativeSessionId: identity.nativeSessionId, referenceId: edge.data.relationId })
    }
    const saved = dirtyRef.current ? await persist() : docRef.current
    await loadDocument(await managedApi.remove({ objectId: saved.objectId, expectedRevision: saved.revision, nodeIds, edgeIds, operationId: crypto.randomUUID() })); setLogEdgeId(null); setPreviewNodeId(null)
    await cleanReferences(affected); setNotice('所选卡片和连接已移除，受影响引用已撤销；真实会话与既有回答保留。')
  })
  const keyboardRemove = useRef(remove), keyboardSelection = useRef({ nodeIds: selectedNodeIds, edgeIds: selectedEdgeIds, editable })
  keyboardRemove.current = remove; keyboardSelection.current = { nodeIds: selectedNodeIds, edgeIds: selectedEdgeIds, editable }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target !== window.document.body || window.document.querySelector('[role="dialog"]')) return
      const current = keyboardSelection.current
      if ((event.key === 'Delete' || event.key === 'Backspace') && current.editable && (current.nodeIds.length || current.edgeIds.length)) { event.preventDefault(); void keyboardRemove.current(current.nodeIds, current.edgeIds) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const start = (node: GraphNode) => {
    setMenu(null)
    if (graphRef.current.archivedAt) { setError('主干会话已归档，请先在会话列表恢复。当前布局仍保留。'); return }
    if (node.data.kind === 'placeholder') { setPicker({ purpose: 'create', nodeId: node.id, operationId: `start:${node.id}` }); return }
    if (!node.data.logicalSessionId) { if (node.data.namespace && node.data.objectId) void run(async () => { await parentRequest('open-object', { namespace: node.data.namespace!, objectId: node.data.objectId! }) }); return }
    void run(async () => {
      try {
        await refreshGraph()
        if (graphRef.current.archivedAt) throw new Error('主干会话已归档，请先在会话列表恢复。')
        let saved = dirtyRef.current ? await persist() : docRef.current!
        if (!saved.graph.ownerSessionId) { saved = await managedApi.bind(saved.objectId, saved.revision, node.data.logicalSessionId!); await loadDocument(saved); if (saved.reused) setNotice(`已复用会话主干；原草稿 ${saved.draftObjectId} 仍保留。`) }
        const ownGraph = saved.graph.ownerSessionId === node.data.logicalSessionId ? await managedApi.canvas(saved.objectId) : await managedApi.ensure(node.data.logicalSessionId!)
        const referenceIds = graphReferenceIds(ownGraph.graph, node.data.logicalSessionId!)
        const identity = await managedApi.resolve(node.data.logicalSessionId!); await parentRequest('open-session', { nativeSessionId: identity.nativeSessionId, referenceIds })
      } catch (cause) { setStartFailureId(node.id); throw new Error(`开始会话尚未完成：${errorText(cause)} 可刷新主干后重试，或返回对话检查现有内容。`) }
    })
  }
  const createSession = (workspaceId: string) => run(async () => {
    if (!picker?.nodeId) return
    const persistedWorkspace = graphRef.current.nodes.find(node => node.id === picker.nodeId)?.data.creationWorkspaceId
    const prior = creations.current.get(picker.operationId) ?? (persistedWorkspace ? { workspaceId: persistedWorkspace } : undefined)
    if (prior && prior.workspaceId !== workspaceId) throw new Error('此空卡片已在先前选择的工作区开始创建，请选择原工作区重试。')
    const operation = prior ?? { workspaceId }
    creations.current.set(picker.operationId, operation)
    if (!persistedWorkspace && graphRef.current.nodes.find(node => node.id === picker.nodeId)?.data.kind === 'placeholder') {
      const intent = { ...graphRef.current, nodes: graphRef.current.nodes.map(node => node.id === picker.nodeId ? { ...node, data: { ...node.data, creationWorkspaceId: workspaceId } } : node) }
      change(intent); await persist(intent)
    }
    const identity = operation.identity ?? await managedApi.createSession(picker.operationId, workspaceId)
    operation.identity = identity
    const bound = bindPlaceholder(graphRef.current, picker.nodeId, identity)
    change(bound)
    const saved = await persist(bound)
    const owner = saved.graph.ownerSessionId ? await managedApi.ensure(identity.logicalSessionId) : await managedApi.bind(saved.objectId, saved.revision, identity.logicalSessionId)
    if (!saved.graph.ownerSessionId) await loadDocument(owner)
    setPicker(null); setNotice(owner.reused ? '已绑定并复用已有主干，原草稿仍保留。' : '真实会话已创建并绑定。待绑定连接仍需确认固定来源。')
    await parentRequest('open-session', { nativeSessionId: identity.nativeSessionId, referenceIds: [] })
  })
  const attachReference = async (identity: SessionIdentity, capture: Capture, operationId: string) => {
    if (dirtyRef.current) await persist()
    const result = await parentRequest<{ referenceId: string }>('add-reference', { targetSessionId: identity.nativeSessionId, capture, operationId })
    setConfirmedDrafts(old => new Set([...old, result.referenceId])); await loadDocument(await managedApi.ensure(identity.logicalSessionId)); setNotice('引用已加入接收会话草稿；主干归属于接收会话。请在真实会话检查后发送。')
  }
  const chooseSession = (item: DirectoryItem) => run(async () => {
    if (!item.logicalSessionId || !picker) throw new Error('会话缺少稳定身份，请刷新目录。')
    const identity = await managedApi.resolve(item.logicalSessionId)
    if (picker.purpose === 'reference' && picker.capture) await attachReference(identity, picker.capture, `${picker.operationId}:${identity.logicalSessionId}`)
    else { const next = addSessionNode(graphRef.current, identity); change(picker.position ? { ...next, nodes: next.nodes.map(node => node.id === `session:${identity.logicalSessionId}` ? { ...node, position: picker.position! } : node) } : next); setNotice('已有会话卡片已添加；未创建引用。') }
    setPicker(null)
  })
  const beginConnect = (sourceId: string, targetId: string) => run(async () => {
    setConnectSource(null); setMenu(null)
    const source = graphRef.current.nodes.find(node => node.id === sourceId), target = graphRef.current.nodes.find(node => node.id === targetId)
    if (!source || !target || source.id === target.id) return
    if (!source.data.logicalSessionId || !target.data.logicalSessionId) { change(connectPending(graphRef.current, sourceId, targetId)); setNotice('已添加待绑定连接，请保存主干；绑定真实会话并确认来源后才可读取。'); return }
    if (source.data.logicalSessionId === target.data.logicalSessionId) throw new Error('同一个会话不能引用自身。')
    const result = await managedApi.preview(source.data.logicalSessionId, undefined, source.data.sourceVersionId, source.data.sourceAnchorId)
    if (!result.capture) throw new Error('来源尚无可确认的已完成回复，请完成来源回复后重试。')
    setConnection({ source: sourceId, target: targetId, operationId: crypto.randomUUID(), preview: result })
  })
  const confirmConnection = () => run(async () => {
    if (!connection?.preview.capture) return
    const target = graphRef.current.nodes.find(node => node.id === connection.target)
    if (!target?.data.logicalSessionId) throw new Error('目标已变化，请重新选择。')
    const oldDoc = docRef.current!, pending = graphRef.current.edges.find(edge => edge.source === connection.source && edge.target === connection.target && edge.data.kind === 'pending')
    await attachReference(await managedApi.resolve(target.data.logicalSessionId), captureFromPreview(connection.preview, connection.preview.capture.selectedText), connection.operationId)
    if (pending) { const old = await managedApi.canvas(oldDoc.objectId); const result = await managedApi.remove({ objectId: old.objectId, expectedRevision: old.revision, edgeIds: [pending.id], operationId: `pending:${connection.operationId}` }); if (docRef.current?.objectId === old.objectId) await loadDocument(result) }
    setConnection(null)
  })
  const loadPreview = async (nodeId: string, cursor?: string, explicit?: Bounds) => {
    const node = graphRef.current.nodes.find(item => item.id === nodeId)
    if (!node?.data.logicalSessionId) return
    let bounds = explicit ?? (node.data.sourceVersionId && node.data.sourceAnchorId ? { sourceVersionId: node.data.sourceVersionId, sourceAnchorId: node.data.sourceAnchorId } : undefined)
    if (!cursor && !bounds) {
      const candidates = graphRef.current.edges.filter(edge => edge.source === nodeId && edge.data.relationId).map(edge => { const relation = relations.find(item => item.referenceId === edge.data.relationId); return { sourceVersionId: relation?.sourceVersionId ?? edge.data.sourceVersionId, sourceAnchorId: relation?.sourceAnchorId ?? edge.data.sourceAnchorId } }).filter((value): value is Bounds => !!value.sourceVersionId && !!value.sourceAnchorId)
      const unique = candidates.filter((value, index) => candidates.findIndex(other => other.sourceVersionId === value.sourceVersionId && other.sourceAnchorId === value.sourceAnchorId) === index)
      if (unique.length > 1) { setSourceChoices({ nodeId, bounds: unique }); return }
      bounds = unique[0]
    }
    setSourceChoices(null)
    const ticket = ++previewTicket.current; setPreviewNodeId(nodeId); setPreviewBusy(true); setPreviewError(''); setSelection(null)
    if (!cursor) setPreview(null)
    try { const value = await managedApi.preview(node.data.logicalSessionId, cursor, bounds?.sourceVersionId, bounds?.sourceAnchorId); if (ticket === previewTicket.current) setPreview(value) }
    catch (cause) { if (ticket === previewTicket.current) setPreviewError(errorText(cause)) }
    finally { if (ticket === previewTicket.current) setPreviewBusy(false) }
  }
  const captureSelection = (element: HTMLElement) => {
    const chosen = window.getSelection(), text = chosen?.toString().trim() ?? ''
    if (!preview?.capture || !chosen?.anchorNode || !chosen.focusNode || !element.contains(chosen.anchorNode) || !element.contains(chosen.focusNode) || !text) { setSelection(null); return }
    if (text.length > 4000) { setPreviewError('一次最多选取 4000 字作为重点材料。'); return }
    setSelection({ text, capture: captureFromPreview(preview, text) })
  }
  const addMaterial = () => {
    if (!selection || !preview) return
    edit(old => ({ ...old, nodes: [...old.nodes, { id: `material:${crypto.randomUUID()}`, position: nextPosition(old), data: { kind: 'material', label: '来源选段', logicalSessionId: preview.logicalSessionId, excerpt: selection.text, sourceVersionId: preview.sourceVersionId, sourceAnchorId: selection.capture.anchorId } }] })); setNotice('选段材料已保存为卡片，可从查看来源继续读取固定版本。')
  }
  const loadObjects = async (type = objectType, after?: string) => { const page = await managedApi.objects(type.namespace, after); setObjects(old => after ? [...old, ...page.items] : page.items); setObjectCursor(page.nextCursor ?? undefined) }
  const addObject = (object: ExtensionObject) => run(async () => {
    const detail = await managedApi.object(objectType.namespace, object.objectId), body = detail.object.content?.body as { logicalSessionId?: string } | undefined
    const logicalSessionId = body?.logicalSessionId ?? detail.object.content?.references?.[0]?.logicalSessionId, id = `${objectType.namespace}:${object.objectId}`
    if (!graphRef.current.nodes.some(node => node.id === id)) change({ ...graphRef.current, nodes: [...graphRef.current.nodes, { id, position: nextPosition(graphRef.current), data: { kind: objectType.kind, label: object.title, namespace: objectType.namespace, objectId: object.objectId, ...(logicalSessionId ? { logicalSessionId } : {}) } }] })
    setShowObjects(false)
  })
  const openMenu = (event: { preventDefault(): void; clientX: number; clientY: number }, target: Partial<Menu> = {}) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, ...target }) }
  const align = () => { try { edit(arrangeBySources); setMenu(null) } catch (cause) { setError(errorText(cause)) } }
  const nodes = useMemo<CanvasNode[]>(() => graph.nodes.map(node => ({ ...node, type: 'managed', selected: selectedNodeIds.includes(node.id) })), [graph.nodes, selectedNodeIds])
  const edges = useMemo<Edge[]>(() => graph.edges.map(edge => { const presentation = relationPresentation(edge, relations, confirmedDrafts); return { ...edge, selected: selectedEdgeIds.includes(edge.id), label: presentation.label, markerEnd: { type: MarkerType.ArrowClosed, color: presentation.muted ? 'var(--mg-edge-muted)' : 'var(--mg-accent)' }, style: { stroke: presentation.muted ? 'var(--mg-edge-muted)' : 'var(--mg-accent)', strokeDasharray: presentation.dashed ? '5 4' : undefined, strokeWidth: 1.8 } } }), [graph.edges, relations, confirmedDrafts, selectedEdgeIds])
  const nodesChanged = (changes: NodeChange<CanvasNode>[]) => {
    const selections = changes.filter(change => change.type === 'select')
    if (selections.length) setSelectedNodeIds(old => { const ids = new Set(old); for (const selection of selections) { if (selection.selected) ids.add(selection.id); else ids.delete(selection.id) }; return [...ids] })
    const edits = changes.filter(change => change.type === 'position')
    if (edits.length) edit(old => ({ ...old, nodes: applyNodeChanges(edits, old.nodes.map(node => ({ ...node, type: 'managed' as const }))).map(({ id, position, data }) => ({ id, position, data })) }))
  }
  const onConnect = (value: Connection) => { if (editable && value.source && value.target) void beginConnect(value.source, value.target) }
  const saveViewport = (_event: unknown, viewport: Viewport) => { if (editable && _event) edit(old => ({ ...old, viewport })) }
  const menuNode = graph.nodes.find(node => node.id === menu?.nodeId), menuEdge = graph.edges.find(edge => edge.id === menu?.edgeId), previewNode = graph.nodes.find(node => node.id === previewNodeId), logEdge = graph.edges.find(edge => edge.id === logEdgeId)
  const activeRelation = relations.find(relation => relation.referenceId === logEdge?.data.relationId), selected = selectedNodeIds.length + selectedEdgeIds.length > 0
  return <div className="mg-app" tabIndex={-1} onPointerDownCapture={event => { if ((event.target as Element).closest('.react-flow__edge')) event.currentTarget.focus() }} onKeyDownCapture={event => {
    if (event.key === 'Escape') { if (!busy) { setMenu(null); setPicker(null); setConnection(null); setConnectSource(null); setShowObjects(false); setRenameId(null); setPreviewNodeId(null); setLogEdgeId(null); setSourceChoices(null); previewTicket.current++ } return }
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true],[role=dialog]')) return
    if ((event.key === 'Delete' || event.key === 'Backspace') && editable && selected) { event.preventDefault(); void remove(selectedNodeIds, selectedEdgeIds) }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); setMenu({ x: window.innerWidth / 2, y: 150, ...(selectedNodeIds[0] ? { nodeId: selectedNodeIds[0] } : selectedEdgeIds[0] ? { edgeId: selectedEdgeIds[0] } : {}) }) }
  }}>
    <aside className="mg-sidebar"><header><h1><GitBranch className="mg-icon" aria-hidden="true" />会话主干图</h1><p>上下文来源 → 接收会话</p></header>
      <button className="mg-current-main" disabled={busy || !currentSession || !status?.capabilities.mainGraph} onClick={() => void run(async () => { await showOwner((await managedApi.resolveNative(currentSession!.id)).logicalSessionId) })}><MessageSquare className="mg-icon" aria-hidden="true" />当前会话的主干</button>
      <button disabled={busy || !status?.capabilities.mainGraph} onClick={() => void createDraft()}><Plus className="mg-icon" aria-hidden="true" />新建未绑定草稿</button>
      <button className="mg-quiet" aria-expanded={library} disabled={busy} onClick={() => { setLibrary(!library); if (!library) void run(() => listCanvases()) }}><Layers className="mg-icon" aria-hidden="true" />已有主干与待归属草稿</button>
      {library && <div className="mg-canvas-list">{canvases.filter(item => !item.deleted).map(item => <button key={item.objectId} className={`mg-canvas-item${document?.objectId === item.objectId ? ' active' : ''}`} aria-current={document?.objectId === item.objectId ? 'page' : undefined} disabled={busy} onClick={() => void run(async () => { await preserveBeforeLeaving(); await loadDocument(await managedApi.canvas(item.objectId)) })}>{item.title}<small>修订 {item.revision}</small></button>)}{canvasCursor && <button disabled={busy} onClick={() => void run(() => listCanvases(canvasCursor))}>加载更多</button>}</div>}
      <p className="mg-sidebar-note">每个接收会话使用自己的主干。图只保存结构、固定来源和读取位置；正文按需读取。</p>
    </aside>
    <main className="mg-main"><header className="mg-toolbar"><div className="mg-title-group"><input aria-label="主干名称" value={title} disabled={!editable} onChange={event => { setTitle(event.target.value); titleRef.current = event.target.value; setDirty(true); dirtyRef.current = true }} /><span className="mg-save-state" data-dirty={dirty}>{archived ? dirty ? '已归档 · 本地布局未保存' : '已归档 · 只读' : dirty ? '未保存' : document ? `已保存 · 修订 ${document.revision}` : '尚未打开主干'}</span></div><button disabled={!editable} className="mg-primary" onClick={() => void run(async () => { await persist(); setNotice('主干已保存。') })}><Save className="mg-icon" aria-hidden="true" />保存</button><button disabled={!document || busy} onClick={() => void run(async () => { await refreshGraph() })}><RefreshCw className="mg-icon" aria-hidden="true" />刷新主干</button></header>
      {error && <div className="mg-banner mg-error" role="alert">{error}{document && <button disabled={busy} onClick={() => void run(async () => { const old = docRef.current!, current = await managedApi.canvas(old.objectId); await managedApi.save({ expectedRevision: 0, title: `${titleRef.current} · 冲突恢复草稿`, graph: layoutDraft(graphRef.current) }); await loadDocument(current); setNotice('本地布局已另存为未绑定草稿；已载入服务器最新主干。') })}>保留布局副本并重新载入</button>}</div>}
      {startFailureId && <div className="mg-banner"><button disabled={busy || archived || !graph.nodes.some(node => node.id === startFailureId)} onClick={() => { const node = graph.nodes.find(item => item.id === startFailureId); if (node) start(node) }}>刷新引用并重试开始</button><button disabled={busy} onClick={() => window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:close' }, window.location.origin)}>返回对话检查</button></div>}
      {archived && <div className="mg-banner mg-warning" role="status">此主干会话已归档，已停止开始会话和编辑。当前布局仍保留；在会话列表恢复后将自动核对状态。{dirty && <button disabled={busy} onClick={() => void run(async () => { await loadDocument(await managedApi.save({ expectedRevision: 0, title: `${titleRef.current} · 布局草稿`, graph: layoutDraft(graphRef.current) })); setNotice('本地布局已另存为未绑定草稿。') })}>另存布局草稿</button>}</div>}
      {syncError && <div className="mg-banner mg-warning" role="status">{syncError}<button disabled={busy} onClick={requestRefresh}>重试同步</button></div>}
      {notice && <div className="mg-banner" role="status">{notice}</div>}
      {cleanup.length > 0 && <div className="mg-banner mg-warning">引用已撤销，仍有 {cleanup.length} 个草稿气泡待清理。<button disabled={busy} onClick={() => void run(() => cleanReferences(cleanup))}>重试清理气泡</button></div>}
      {!!graph.legacyEdges?.length && <div className="mg-banner mg-warning">保留 {graph.legacyEdges.length} 条旧知识线供维护面板核对；未转为上下文权限。</div>}
      {graph.migration?.status === 'needs-review' && <div className="mg-banner mg-warning">旧图待确认归属：{graph.migration.reason || '开始会话时明确绑定目标，原图保留。'}</div>}
      {document ? <><nav className="mg-actions" aria-label="画布操作"><button disabled={!editable} onClick={event => openMenu(event, {})}><MoreHorizontal className="mg-icon" aria-hidden="true" />画布更多操作</button>{selected && <><button disabled={!editable} onClick={event => openMenu(event, selectedNodeIds[0] ? { nodeId: selectedNodeIds[0] } : { edgeId: selectedEdgeIds[0] })}>所选对象更多操作</button><button disabled={!editable} onClick={() => void remove(selectedNodeIds, selectedEdgeIds)}>移除所选对象</button></>}<span>{graph.ownerSessionId ? `主干会话：${graph.nodes.find(node => node.data.logicalSessionId === graph.ownerSessionId)?.data.label ?? graph.ownerSessionId}` : '未绑定 · 首次开始会话时确定主干'} · 拖线确认上下文来源</span></nav>
        <div className="mg-workbench"><div className="mg-flow"><ReactFlow<CanvasNode, Edge> key={document.objectId} onInit={instance => { flow.current = instance }} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={nodesChanged} onEdgesChange={changes => { const selections = changes.filter(change => change.type === 'select'); if (selections.length) setSelectedEdgeIds(old => { const ids = new Set(old); for (const item of selections) { if (item.selected) ids.add(item.id); else ids.delete(item.id) }; return [...ids] }) }} onConnect={onConnect} onNodeClick={(event, node) => { setSelectedNodeIds([node.id]); setSelectedEdgeIds([]); if ((event.target as Element).closest('[data-more]')) openMenu(event, { nodeId: node.id }); else setMenu(null) }} onNodeContextMenu={(event, node) => { setSelectedNodeIds([node.id]); setSelectedEdgeIds([]); openMenu(event, { nodeId: node.id }) }} onEdgeContextMenu={(event, edge) => { setSelectedEdgeIds([edge.id]); setSelectedNodeIds([]); openMenu(event, { edgeId: edge.id }) }} onPaneContextMenu={event => openMenu(event, { position: flow.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) })} onEdgeClick={(_event, edge) => { setSelectedEdgeIds([edge.id]); setSelectedNodeIds([]); setMenu(null) }} onPaneClick={() => { setSelectedNodeIds([]); setSelectedEdgeIds([]); setMenu(null) }} onMoveEnd={saveViewport} defaultViewport={graph.viewport} nodesDraggable={editable} nodesConnectable={editable} deleteKeyCode={null} fitView={!graph.viewport} minZoom={0.15} maxZoom={2} fitViewOptions={{ maxZoom: 1, padding: 0.2 }} ariaLabelConfig={{ 'controls.fitView.ariaLabel': '适合画布', 'controls.zoomIn.ariaLabel': '放大画布', 'controls.zoomOut.ariaLabel': '缩小画布' }}><Background gap={24} size={1} color="var(--mg-line)" /><Controls showInteractive={false} fitViewOptions={{ maxZoom: 1, padding: 0.2 }} /></ReactFlow>
          {!graph.nodes.length && <div className="mg-canvas-empty"><div className="mg-empty-icon"><GitBranch aria-hidden="true" /></div><strong>右键添加空卡片或已有会话</strong><p>空卡片在开始会话时选择工作区；添加卡片不会创建上下文权限。</p></div>}
        </div></div></> : <div className="mg-welcome"><div className="mg-empty-icon"><GitBranch aria-hidden="true" /></div><h2>打开当前会话的主干，或创建一份草稿</h2><p>从来源指向接收会话；会话始终在真实会话页进行。</p><button disabled={busy || !status?.capabilities.mainGraph} onClick={() => void createDraft()}><Plus className="mg-icon" aria-hidden="true" />新建未绑定草稿</button></div>}
    </main>
    {menu && <><div className="mg-menu-dismiss" onPointerDown={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null) }} /><div role="menu" className="mg-context-menu" onKeyDown={event => { if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return; event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const index = items.indexOf(window.document.activeElement as HTMLButtonElement); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus() }} style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 268)), top: Math.max(8, Math.min(menu.y, window.innerHeight - (menuNode ? 290 : 260))), maxHeight: window.innerHeight - 24 }}>
      {menuNode ? <><strong>{menuNode.data.label}</strong><button role="menuitem" disabled={busy || archived || !status?.capabilities.sessions} onClick={() => start(menuNode)}>在此节点开始会话</button>{menuNode.data.logicalSessionId && <button role="menuitem" onClick={() => { setMenu(null); void loadPreview(menuNode.id) }}>查看来源</button>}<button role="menuitem" disabled={!editable} onClick={() => { setConnectSource(menuNode.id); setMenu(null) }}>连接到节点</button><button role="menuitem" disabled={!editable} onClick={() => { setRenameId(menuNode.id); setRename(menuNode.data.label); setMenu(null) }}>重命名</button><button role="menuitem" className="mg-danger" disabled={!editable} onClick={() => void remove([menuNode.id], [])}>移除卡片</button></> : menuEdge ? <><button role="menuitem" onClick={() => { setLogEdgeId(menuEdge.id); setMenu(null) }}>查看固定来源与读取位置</button>{menuEdge.data.kind === 'pending' && <button role="menuitem" disabled={!editable} onClick={() => void beginConnect(menuEdge.source, menuEdge.target)}>确认此连接的来源</button>}<button role="menuitem" className="mg-danger" disabled={!editable} onClick={() => void remove([], [menuEdge.id])}>移除边</button></> : <><button role="menuitem" disabled={!editable} onClick={() => { edit(old => addPlaceholder(old, `placeholder:${crypto.randomUUID()}`, menu.position)); setMenu(null) }}>添加空卡片</button><button role="menuitem" disabled={!editable} onClick={() => { setPicker({ purpose: 'add', position: menu.position, operationId: crypto.randomUUID() }); setMenu(null) }}>添加已有会话</button><button role="menuitem" disabled={!editable} onClick={align}>按来源排列</button><button role="menuitem" onClick={() => { void flow.current?.fitView({ maxZoom: 1, padding: 0.2 }); setMenu(null) }}>适合画布</button><button role="menuitem" disabled={!editable} onClick={() => { setShowObjects(true); setMenu(null); void run(() => loadObjects()) }}>关联已有对象</button><button role="menuitem" disabled={!editable || !graph.ownerSessionId} onClick={() => { setMenu(null); void run(repairRelations) }}>导入当前目标已有引用（不新建权限）</button></>}
    </div></>}
    {picker && <SessionPicker key={picker.operationId} picker={picker} busy={busy} error={error} onClose={() => { if (!busy) setPicker(null) }} onSelect={item => void chooseSession(item)} onCreate={workspace => void createSession(workspace)} />}
    {connectSource && <Dialog title="选择接收会话节点" onClose={() => setConnectSource(null)}><p>箭头从当前来源指向接收方。下一步确认已完成回复的固定上限。</p><div className="mg-picker-list">{graph.nodes.filter(node => node.id !== connectSource).map(node => <button className="mg-picker-item" key={node.id} disabled={busy} onClick={() => void beginConnect(connectSource, node.id)}>{node.data.label} · {NODE_LABELS[node.data.kind]}</button>)}</div></Dialog>}
    {connection && <Dialog title="确认上下文来源" onClose={() => { if (!busy) setConnection(null) }}><p>{graph.nodes.find(node => node.id === connection.source)?.data.label} → {graph.nodes.find(node => node.id === connection.target)?.data.label}</p><p>允许读取截至回复 <code>{connection.preview.capture?.anchorId}</code>；固定版本 <code>{connection.preview.sourceVersionId}</code>。后续新增回复不会扩大这个上限。</p><div className="mg-preview">{connection.preview.items.map(item => <article key={`${item.eventId}:${item.offset}`}><small>{item.role === 'user' ? '来源问题' : '已完成回复的预览片段'}</small><p>{item.text}</p></article>)}</div><p>确认后加入接收会话草稿，由你检查并发送。</p><button className="mg-primary" disabled={!editable || !status?.capabilities.references} onClick={() => void confirmConnection()}>确认固定来源并连接</button></Dialog>}
    {renameId && <Dialog title="重命名卡片" onClose={() => setRenameId(null)}><input aria-label="卡片名称" maxLength={200} value={rename} onChange={event => setRename(event.target.value)} /><button disabled={!editable || !rename.trim()} onClick={() => { edit(old => ({ ...old, nodes: old.nodes.map(node => node.id === renameId ? { ...node, data: { ...node.data, label: rename.trim() } } : node) })); setRenameId(null) }}>保存名称</button></Dialog>}
    {sourceChoices && <Dialog title="选择固定来源范围" onClose={() => setSourceChoices(null)}><p>此会话有多个独立引用，请选择要预览的固定来源。</p>{sourceChoices.bounds.map(bound => <button key={`${bound.sourceVersionId}:${bound.sourceAnchorId}`} onClick={() => void loadPreview(sourceChoices.nodeId, undefined, bound)}>{bound.sourceVersionId} · 截至 {bound.sourceAnchorId}</button>)}</Dialog>}
    {previewNode && <Dialog title={`查看来源 · ${previewNode.data.label}`} onClose={() => { previewTicket.current++; setPreviewNodeId(null) }}><p>只读预览；此处的阅读不记为 AI 已读取。翻页固定本次来源版本。</p><div className="mg-preview">{previewBusy && <p>正在读取…</p>}{previewError && <p role="alert" className="mg-error">{previewError}</p>}{preview?.items.map(item => <article key={`${item.eventId}:${item.offset}`}><small>{item.role === 'user' ? '提问' : '回复'}{!item.complete ? ' · 分页片段' : ''}</small><div className="mg-source-text" onMouseUp={event => { if (item.role === 'assistant') captureSelection(event.currentTarget) }}>{item.text}</div></article>)}{selection && <div className="mg-selection-actions"><span>已选中 {selection.text.length} 字</span><button disabled={!editable} onClick={addMaterial}>制作材料卡</button><button disabled={!editable || !status?.capabilities.references} onClick={() => { setPreviewNodeId(null); setPicker({ purpose: 'reference', capture: selection.capture, operationId: crypto.randomUUID() }) }}>引用到会话</button><button disabled={busy} onClick={() => void run(async () => { await parentRequest('session-sticker', { capture: selection.capture }) })}>建立会话贴纸</button></div>}{preview?.nextCursor && <button disabled={previewBusy} onClick={() => void loadPreview(previewNode.id, preview.nextCursor ?? undefined)}>继续读取这一来源</button>}</div></Dialog>}
    {logEdge && document && <Dialog title="固定来源与读取位置" onClose={() => setLogEdgeId(null)}><p>{relationPresentation(logEdge, relations, confirmedDrafts).label}</p>{activeRelation ? <><p>允许截至回复：<code>{activeRelation.cutoffEventId}</code></p><p>固定版本：<code>{activeRelation.sourceVersionId}</code></p></> : <p>{logEdge.data.kind === 'pending' ? '连接尚未绑定，没有上下文读取权限。' : '引用元数据尚未载入。'}</p>}{relationCursor && <button disabled={busy} onClick={() => void run(() => loadRelations(graph.ownerSessionId, relationCursor))}>继续载入当前主干引用</button>}<DisclosurePanel objectId={document.objectId} referenceId={logEdge.data.relationId} /></Dialog>}
    {showObjects && <Dialog title="关联已有对象" onClose={() => setShowObjects(false)}><select aria-label="对象类型" value={objectType.namespace} onChange={event => { const next = OBJECT_TYPES.find(item => item.namespace === event.target.value)!; setObjectType(next); void run(() => loadObjects(next)) }}>{OBJECT_TYPES.map(type => <option key={type.namespace} value={type.namespace}>{type.label}</option>)}</select><div className="mg-picker-list">{objects.filter(object => !object.deleted).map(object => <button className="mg-picker-item" key={object.objectId} disabled={busy} onClick={() => void addObject(object)}>{object.title}</button>)}{objectCursor && <button disabled={busy} onClick={() => void run(() => loadObjects(objectType, objectCursor))}>加载更多</button>}</div></Dialog>}
  </div>
}
