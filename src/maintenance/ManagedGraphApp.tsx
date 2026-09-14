import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import type { Connection, Edge, EdgeChange, Node, NodeChange, NodeProps, Viewport } from '@xyflow/react'
import { captureFromPreview, managedApi, parentRequest } from './client'
import type { Capture, DirectoryItem, ExtensionObject, Preview, SessionIdentity, Status } from './client'
import { acceptCanvasBody, addSessionNode, arrangeBySources, connectKnowledge, createActionGuard, EDGE_LABELS, EMPTY_GRAPH, importRelations, nextPosition, nodePrimaryAction, NODE_LABELS, relationPresentation, removePresentation } from './model'
import type { GraphNodeData, ManagedGraph, UpstreamRelation } from './model'
import '@xyflow/react/dist/style.css'
import './managed.css'

type CanvasNode = Node<GraphNodeData, 'managed'>
type Picker = { purpose: 'add' | 'reference'; capture?: Capture; sourceNodeId?: string; operationId: string }
type Selection = { text: string; capture: Capture; preview: Preview }
const OBJECT_TYPES = [{ namespace: 'annotation', label: '注释与贴纸引用', kind: 'sticker' as const }, { namespace: 'obsidian-links', label: '笔记引用', kind: 'note' as const }]
const EDGE_COLORS = { branch: '#d99143', upstream: '#8b7de6', knowledge: '#54929b' }
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。'

function ManagedNode({ data, selected }: NodeProps<CanvasNode>) {
  return <div className={`mg-node mg-node-${data.kind}${selected ? ' mg-selected' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <span className="mg-node-kind">{NODE_LABELS[data.kind]}</span>
    <button className="mg-node-title nodrag" data-open-primary="true" disabled={!nodePrimaryAction(data)}>{data.label || '未命名'}</button>
    {data.excerpt && <p>{data.excerpt}</p>}
    <span className="mg-node-hint">{nodePrimaryAction(data)?.operation === 'open-session' ? '点击标题进入完整会话 · 点击卡片查看详情' : '点击标题打开来源对象 · 点击卡片查看详情'}</span>
    <Handle type="source" position={Position.Bottom} />
  </div>
}
const nodeTypes = { managed: ManagedNode }

function SessionPicker({ purpose, canCreate, actionBusy, actionError, onClose, onSelect, onCreate }: { purpose: string; canCreate: boolean; actionBusy: boolean; actionError: string; onClose: () => void; onSelect: (session: DirectoryItem) => void; onCreate: () => void }) {
  const [workspace, setWorkspace] = useState<DirectoryItem | null>(null)
  const [items, setItems] = useState<DirectoryItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const busyRef = useRef(false)
  const load = useCallback(async (workspaceId?: string, after?: string) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    const ticket = ++generation.current
    try {
      const page = await managedApi.directory(workspaceId, after)
      if (ticket !== generation.current) return
      setItems((old) => after ? [...old, ...page.items.filter((item) => !old.some((entry) => entry.id === item.id))] : page.items)
      setCursor(page.nextCursor ?? undefined)
    } catch (cause) { if (ticket === generation.current) setError(errorText(cause)) }
    finally { if (ticket === generation.current) { busyRef.current = false; setBusy(false) } }
  }, [])
  useEffect(() => {
    const counter = generation
    const loading = busyRef
    void load(workspace?.id)
    return () => { counter.current++; loading.current = false }
  }, [workspace, load])
  return <div className="mg-dialog-backdrop" onClick={onClose}>
    <section className="mg-dialog" role="dialog" aria-modal="true" aria-label={purpose} onClick={(event) => event.stopPropagation()}>
      <header><div><h2>{purpose}</h2><p>{workspace ? workspace.title : '先选择工作区，再选择会话'}</p></div><button onClick={onClose} aria-label="关闭">×</button></header>
      {workspace && <button className="mg-back" disabled={actionBusy} onClick={() => setWorkspace(null)}>← 返回工作区</button>}
      <div className="mg-picker-list" onScroll={(event) => { const element = event.currentTarget; if (cursor && element.scrollHeight - element.scrollTop - element.clientHeight < 80) void load(workspace?.id, cursor) }}>
        {items.map((item) => <button disabled={actionBusy} key={item.id} className="mg-picker-item" onClick={() => workspace ? onSelect(item) : setWorkspace(item)}><span>{item.title || '未命名会话'}</span><span>{workspace ? '选择' : '›'}</span></button>)}
        {!busy && !error && items.length === 0 && <p className="mg-empty">{workspace ? '这个工作区暂时没有可用会话。' : '当前实例没有可用工作区。'}</p>}
        {error && <p role="alert" className="mg-error">{error}</p>}
        {actionError && <p role="alert" className="mg-error">{actionError}</p>}
        {actionBusy && <p className="mg-empty">正在准备目标会话…</p>}
        {busy && <p className="mg-empty">正在加载…</p>}
        {cursor && <button disabled={busy} onClick={() => void load(workspace?.id, cursor)}>加载更多</button>}
        {error && <button disabled={busy} onClick={() => void load(workspace?.id, cursor)}>重试</button>}
      </div>
      {canCreate && <footer><button onClick={onCreate}>{purpose === '引用到会话' ? '新建会话并以此处为分支' : '新建独立会话'}</button></footer>}
    </section>
  </div>
}

export default function ManagedGraphApp() {
  const [status, setStatus] = useState<Status | null>(null)
  const [canvases, setCanvases] = useState<ExtensionObject[]>([])
  const [canvasCursor, setCanvasCursor] = useState<string | undefined>()
  const [canvas, setCanvas] = useState<ExtensionObject | null>(null)
  const [graph, setGraph] = useState<ManagedGraph>(EMPTY_GRAPH)
  const [title, setTitle] = useState('未命名画布')
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [picker, setPicker] = useState<Picker | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [relations, setRelations] = useState<UpstreamRelation[]>([])
  const [confirmedDrafts, setConfirmedDrafts] = useState<Set<string>>(() => new Set())
  const [confirmedRevoked, setConfirmedRevoked] = useState<Set<string>>(() => new Set())
  const [relationCursor, setRelationCursor] = useState<string | undefined>()
  const [objectType, setObjectType] = useState(OBJECT_TYPES[0])
  const [objects, setObjects] = useState<ExtensionObject[]>([])
  const [objectCursor, setObjectCursor] = useState<string | undefined>()
  const [objectError, setObjectError] = useState('')
  const [showObjects, setShowObjects] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const editVersion = useRef(0)
  const previewTicket = useRef(0)
  const actionGuard = useRef(createActionGuard())
  const objectTicket = useRef(0)
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId)
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId)
  const activeRelation = selectedEdge?.data.relationId ? relations.find((relation) => relation.referenceId === selectedEdge.data.relationId) : undefined
  const selectedRelationPresentation = selectedEdge ? relationPresentation(selectedEdge, status?.capabilities.references ? relations : [], status?.capabilities.references ? confirmedDrafts : new Set(), confirmedRevoked) : undefined
  const editable = !!canvas && !canvas.deleted && !busy && status?.capabilities.storage === true

  const changeGraph = useCallback((next: ManagedGraph | ((old: ManagedGraph) => ManagedGraph)) => {
    setGraph((old) => typeof next === 'function' ? next(old) : next); editVersion.current++; setDirty(true)
  }, [])
  const editGraph = useCallback((next: ManagedGraph | ((old: ManagedGraph) => ManagedGraph)) => {
    actionGuard.current.edit(() => changeGraph(next))
  }, [changeGraph])
  const run = useCallback(async (action: () => Promise<void>) => {
    if (!actionGuard.current.begin()) return
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (cause) { setError(errorText(cause)) } finally { actionGuard.current.end(); setBusy(false) }
  }, [])
  const listCanvases = useCallback(async (after?: string) => {
    const page = await managedApi.canvases(after)
    setCanvases((old) => after ? [...old, ...page.items.filter((item) => !old.some((entry) => entry.objectId === item.objectId))] : page.items)
    setCanvasCursor(page.nextCursor ?? undefined)
  }, [])
  const loadCanvas = useCallback(async (id: string) => {
    const detail = await managedApi.canvas(id)
    const body = acceptCanvasBody(detail.object.content?.body)
    setCanvas(detail.object); setTitle(detail.object.title); setGraph(body); setDirty(false); setConflict(false); editVersion.current++
    setSelectedNodeId(null); setSelectedEdgeId(null); setPreview(null); setSelection(null); setExpanded(false)
  }, [])
  const refreshStatus = useCallback(() => run(async () => {
    const result = await managedApi.status()
    if (result.protocolVersion !== 1 || result.mode !== 'maintenance') throw new Error('图谱接口版本不兼容。')
    setStatus(result)
    if (result.capabilities.storage) await listCanvases()
  }), [listCanvases, run])
  useEffect(() => { void refreshStatus() }, [refreshStatus])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  useEffect(() => { previewTicket.current++; setPreview(null); setPreviewError(''); setSelection(null); setExpanded(false); setPreviewBusy(false) }, [selectedNodeId])

  const saveCanvas = (deleted = canvas?.deleted ?? false) => run(async () => {
    if (!canvas) return
    const version = editVersion.current
    const result = await managedApi.save({ objectId: canvas.objectId, expectedRevision: canvas.revision, title: title.trim() || '未命名画布', body: graph, deleted })
    if (result.status === 'conflict') { setConflict(true); setError('这份画布已在其他窗口更新。本地编辑仍保留，请重新载入后再编辑；不会自动覆盖。'); return }
    setCanvas(result.object)
    if (version === editVersion.current) setDirty(false)
    setConflict(false); setNotice(deleted ? '画布已移到回收列表，会话和引用关系仍保留。' : '画布已保存。'); await listCanvases()
  })
  const createCanvas = () => run(async () => {
    const result = await managedApi.save({ objectId: `canvas-${crypto.randomUUID()}`, expectedRevision: 0, title: '未命名画布', body: { ...EMPTY_GRAPH } })
    if (result.status === 'conflict') throw new Error('创建画布发生冲突，请重试。')
    setCanvas(result.object); setGraph({ ...EMPTY_GRAPH }); setTitle(result.object.title); setDirty(false); setConflict(false); setSelectedNodeId(null); setSelectedEdgeId(null); await listCanvases()
  })
  const openSession = async (logicalSessionId: string) => {
    const resolved = await managedApi.resolve(logicalSessionId)
    await parentRequest('open-session', { nativeSessionId: resolved.nativeSessionId })
  }
  const openNode = async (data: GraphNodeData) => {
    const action = nodePrimaryAction(data)
    if (action?.operation === 'open-object') await parentRequest('open-object', action.input)
    else if (action?.operation === 'open-session') await openSession(action.logicalSessionId)
  }
  const addIdentity = (identity: SessionIdentity) => { changeGraph((old) => addSessionNode(old, identity)); setSelectedNodeId(`session:${identity.logicalSessionId}`) }
  const chooseSession = (item: DirectoryItem) => run(async () => {
    if (!item.logicalSessionId) throw new Error('会话缺少可解析的稳定身份，请刷新目录。')
    const identity = await managedApi.resolve(item.logicalSessionId)
    if (picker?.purpose === 'reference' && picker.capture) {
      const result = await parentRequest<{ referenceId: string }>('add-reference', { targetSessionId: identity.nativeSessionId, capture: picker.capture, operationId: `${picker.operationId}:${identity.logicalSessionId}` })
      setConfirmedDrafts((old) => new Set([...old, result.referenceId]))
      changeGraph((old) => {
        const next = addSessionNode(old, identity)
        return picker.sourceNodeId && !next.edges.some((edge) => edge.data.relationId === result.referenceId) ? { ...next, edges: [...next.edges, { id: `relation:${result.referenceId}`, source: picker.sourceNodeId, target: `session:${identity.logicalSessionId}`, data: { kind: 'upstream', namespace: 'annotation-upstream', relationId: result.referenceId } }] } : next
      })
      setNotice('引用已加入目标会话草稿，尚未发送。')
    } else addIdentity(identity)
    setPicker(null)
  })
  const createSession = () => run(async () => {
    if (!picker) return
    const identity = await managedApi.createSession(picker.operationId)
    addIdentity(identity)
    if (picker?.purpose === 'reference' && picker.capture) {
      const result = await parentRequest<{ referenceId: string }>('add-reference', { targetSessionId: identity.nativeSessionId, capture: picker.capture, operationId: `${picker.operationId}:${identity.logicalSessionId}` })
      setConfirmedDrafts((old) => new Set([...old, result.referenceId]))
      if (picker.sourceNodeId) changeGraph((old) => old.edges.some((edge) => edge.data.relationId === result.referenceId) ? old : ({ ...old, edges: [...old.edges, { id: `relation:${result.referenceId}`, source: picker.sourceNodeId!, target: `session:${identity.logicalSessionId}`, data: { kind: 'branch', namespace: 'annotation-upstream', relationId: result.referenceId } }] }))
      setNotice('新会话已建立，分支引用已加入草稿，尚未发送。')
    } else setNotice('真实会话已建立，可以从卡片打开。')
    setPicker(null)
  })
  const loadPreview = async (cursor?: string) => {
    if (!selectedNode?.data.logicalSessionId) return
    const ticket = ++previewTicket.current
    setExpanded(true); setPreviewBusy(true); setPreviewError(''); setSelection(null)
    try {
      const result = await managedApi.preview(selectedNode.data.logicalSessionId, cursor, selectedNode.data.sourceVersionId, selectedNode.data.sourceAnchorId)
      if (ticket === previewTicket.current) setPreview(result)
    } catch (cause) { if (ticket === previewTicket.current) setPreviewError(errorText(cause)) }
    finally { if (ticket === previewTicket.current) setPreviewBusy(false) }
  }
  const captureSelection = (element: HTMLElement) => {
    const chosen = window.getSelection()
    const text = chosen?.toString().trim() ?? ''
    if (!preview?.capture || !chosen?.anchorNode || !chosen.focusNode || !element.contains(chosen.anchorNode) || !element.contains(chosen.focusNode) || !text) { setSelection(null); return }
    if (text.length > 4000) { setPreviewError('一次最多选取 4000 个字符作为重点材料。'); setSelection(null); return }
    setPreviewError(''); setSelection({ text, capture: captureFromPreview(preview, text), preview })
  }
  const addMaterial = () => {
    if (!selection || !selectedNode) return
    const id = `material:${crypto.randomUUID()}`
    editGraph((old) => connectKnowledge({ ...old, nodes: [...old.nodes, { id, position: nextPosition(old), data: { kind: 'material', label: `${selectedNode.data.label} · 选段`, logicalSessionId: selection.preview.logicalSessionId, excerpt: selection.text, sourceVersionId: selection.preview.sourceVersionId, sourceAnchorId: selection.capture.anchorId } }] }, selectedNode.id, id))
    setNotice('选段材料已加入画布；只保存你选中的文字和来源定位。')
  }
  const loadRelations = (after?: string) => run(async () => {
    if (!after) { setRelations([]); setRelationCursor(undefined) }
    const page = await managedApi.relations(after)
    setRelations((old) => after ? [...old, ...page.items.filter((item) => !old.some((entry) => entry.referenceId === item.referenceId))] : page.items)
    setRelationCursor(page.nextCursor ?? undefined)
    changeGraph((old) => importRelations(old, page.items))
    setNotice('已载入权威引用关系；只有画布中已添加的两端会话显示连线。')
  })
  const unlinkReference = () => run(async () => {
    if (!selectedEdge?.data.relationId) return
    const target = graph.nodes.find((node) => node.id === selectedEdge.target)
    if (!target?.data.logicalSessionId) throw new Error('目标会话缺失，无法安全解除引用。')
    const identity = await managedApi.resolve(target.data.logicalSessionId)
    await parentRequest('delete-reference', { nativeSessionId: identity.nativeSessionId, referenceId: selectedEdge.data.relationId })
    setConfirmedRevoked((old) => new Set([...old, selectedEdge.data.relationId!]))
    setRelations((old) => old.map((relation) => relation.referenceId === selectedEdge.data.relationId ? { ...relation, state: 'revoked' } : relation))
    setNotice('引用关系已解除，后续读取将遵守解除状态。画布呈现仍保留，可另行移除。')
  })
  const loadObjects = async (type = objectType, after?: string) => {
    const ticket = ++objectTicket.current
    setObjectError('')
    if (!after) { setObjects([]); setObjectCursor(undefined) }
    try {
      const page = await managedApi.objects(type.namespace, after)
      if (ticket !== objectTicket.current) return
      setObjects((old) => after ? [...old, ...page.items.filter((item) => !old.some((entry) => entry.objectId === item.objectId))] : page.items)
      setObjectCursor(page.nextCursor ?? undefined)
    } catch (cause) { if (ticket === objectTicket.current) { setObjectError(errorText(cause)); if (!after) setObjects([]) } }
  }
  const addObject = (object: ExtensionObject) => run(async () => {
    const detail = await managedApi.object(objectType.namespace, object.objectId)
    const logicalSessionId = detail.object.content?.references?.[0]?.logicalSessionId
    const id = `object:${objectType.namespace}:${object.objectId}`
    if (graph.nodes.some((node) => node.id === id)) { setSelectedNodeId(id); return }
    changeGraph((old) => ({ ...old, nodes: [...old.nodes, { id, position: nextPosition(old), data: { kind: objectType.kind, label: object.title, namespace: objectType.namespace, objectId: object.objectId, ...(logicalSessionId ? { logicalSessionId } : {}) } }] }))
  })

  const nodes = useMemo<CanvasNode[]>(() => graph.nodes.map((node) => ({ ...node, type: 'managed', selected: node.id === selectedNodeId })), [graph.nodes, selectedNodeId])
  const edges = useMemo<Edge[]>(() => graph.edges.map((edge) => {
    const presentation = relationPresentation(edge, status?.capabilities.references ? relations : [], status?.capabilities.references ? confirmedDrafts : new Set(), confirmedRevoked)
    const color = presentation.muted ? 'var(--mg-muted)' : EDGE_COLORS[edge.data.kind]
    return { ...edge, label: presentation.label, selected: edge.id === selectedEdgeId, markerEnd: { type: MarkerType.ArrowClosed, color }, style: { stroke: color, opacity: presentation.muted ? 0.6 : 1, strokeWidth: edge.id === selectedEdgeId ? 3 : 1.8, strokeDasharray: presentation.dashed ? '5 4' : undefined } }
  }), [graph.edges, selectedEdgeId, relations, confirmedDrafts, confirmedRevoked, status?.capabilities.references])
  const nodesChanged = (changes: NodeChange<CanvasNode>[]) => {
    if (!editable) return
    const edits = changes.filter((change) => change.type !== 'select' && change.type !== 'dimensions')
    if (!edits.length) return
    editGraph((old) => {
      const updated = applyNodeChanges(edits, old.nodes.map((node) => ({ ...node, type: 'managed' as const })))
      const ids = new Set(updated.map((node) => node.id))
      return { ...old, nodes: updated.map(({ id, position, data }) => ({ id, position, data })), edges: old.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) }
    })
  }
  const edgesChanged = (changes: EdgeChange[]) => {
    if (!editable) return
    const removed = applyEdgeChanges(changes.filter((change) => change.type === 'remove'), edges)
    if (removed.length !== graph.edges.length) editGraph((old) => ({ ...old, edges: old.edges.filter((edge) => removed.some((entry) => entry.id === edge.id)) }))
  }
  const onConnect = (connection: Connection) => {
    if (editable && connection.source && connection.target) { editGraph((old) => connectKnowledge(old, connection.source, connection.target)); setNotice('已添加知识关联。需要上下文引用时，请展开来源回复并选择“引用到会话”。') }
  }
  const saveViewport = (_event: unknown, viewport: Viewport) => { if (editable) editGraph((old) => ({ ...old, viewport })) }
  const alignGraph = () => {
    try { editGraph(arrangeBySources(graph)); setError('') } catch (cause) { setError(errorText(cause)) }
  }

  return <div className="mg-app">
    <aside className="mg-sidebar">
      <header className="mg-sidebar-title"><h1>会话图谱</h1><button disabled={busy || dirty || !status?.capabilities.storage} onClick={() => void createCanvas()} title={dirty ? '请先保存当前编辑' : '新建画布'}>＋</button></header>
      <p className="mg-subtitle">会话、材料与引用关系</p>
      <div className="mg-canvas-list">
        {canvases.filter((item) => item.deleted === showDeleted).map((item) => <button disabled={busy || (dirty && canvas?.objectId !== item.objectId)} key={item.objectId} className={`mg-canvas-item${canvas?.objectId === item.objectId ? ' active' : ''}`} onClick={() => { if (canvas?.objectId !== item.objectId) void run(() => loadCanvas(item.objectId)) }}><span>{item.title || '未命名画布'}</span><small>修订 {item.revision}{item.deleted ? ' · 已移除' : ''}</small></button>)}
        {canvasCursor && <button disabled={busy} onClick={() => void run(() => listCanvases(canvasCursor))}>加载更多画布</button>}
      </div>
      <button className="mg-quiet" onClick={() => setShowDeleted(!showDeleted)}>{showDeleted ? '← 返回画布' : '已移除的画布'}</button>
      <button className="mg-quiet" disabled={busy} onClick={() => void refreshStatus()}>检查扩展连接</button>
      <p className="mg-sidebar-note">图谱保存布局与稳定引用。实际对话始终在完整会话页进行。</p>
    </aside>
    <main className="mg-main">
      <header className="mg-toolbar">
        <input aria-label="画布名称" value={title} disabled={!editable} maxLength={120} onChange={(event) => { const value = event.target.value; actionGuard.current.edit(() => { setTitle(value); setDirty(true); editVersion.current++ }) }} />
        <span className="mg-save-state">{canvas?.deleted ? '已移除' : dirty ? '未保存' : canvas ? `已保存 · 修订 ${canvas.revision}` : '请选择画布'}</span>
        <button className="mg-primary" disabled={busy || !editable || conflict} onClick={() => void saveCanvas(false)}>保存</button>
        {canvas?.deleted ? <button disabled={busy || !status?.capabilities.storage} onClick={() => void saveCanvas(false)}>恢复画布</button> : <button disabled={busy || !canvas || dirty} onClick={() => void saveCanvas(true)}>移除画布</button>}
      </header>
      {error && <div role="alert" className="mg-banner mg-error">{error}</div>}
      {notice && <div role="status" className="mg-banner">{notice}</div>}
      {conflict && <div className="mg-banner mg-conflict"><strong>本地编辑仍在当前窗口中。</strong><button disabled={busy} onClick={() => { if (canvas) void run(() => loadCanvas(canvas.objectId)) }}>放弃本地编辑，重新载入</button></div>}
      {status && (!status.capabilities.storage || !status.capabilities.sessions || !status.capabilities.references) && <div className="mg-banner mg-warning">{status.reason || '部分扩展能力暂不可用。'} {!status.capabilities.storage && '画布存储不可用。'} {!status.capabilities.sessions && '会话目录不可用。'} {!status.capabilities.references && '引用能力未启用；仍可浏览画布，不能新增或解除上下文引用。'}</div>}
      {canvas ? <>
        <nav className="mg-actions" aria-label="画布操作">
          <button disabled={!editable || busy || !status?.capabilities.sessions} onClick={() => { setError(''); setPicker({ purpose: 'add', operationId: crypto.randomUUID() }) }}>＋ 会话</button>
          <button disabled={!editable || busy} onClick={() => { setShowObjects(!showObjects); if (!showObjects) void loadObjects() }}>关联对象</button>
          <button disabled={!editable || busy || !status?.capabilities.references} onClick={() => void loadRelations()}>载入已有引用</button>
          {relationCursor && <button disabled={busy} onClick={() => void loadRelations(relationCursor)}>更多引用</button>}
          <button disabled={!editable || graph.nodes.length === 0} onClick={alignGraph}>按来源排列</button>
          <span>拖动节点连接点建立知识关联</span>
        </nav>
        <div className="mg-workbench">
          <div className="mg-flow">
            <ReactFlow key={canvas.objectId} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={nodesChanged} onEdgesChange={edgesChanged} onConnect={onConnect} onNodeClick={(event, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); if ((event.target as Element).closest('[data-open-primary]')) void run(() => openNode(node.data)) }} onNodeDoubleClick={(_event, node) => { void run(() => openNode(node.data)) }} onEdgeClick={(_event, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null) }} onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null) }} onMoveEnd={saveViewport} defaultViewport={graph.viewport} nodesDraggable={editable} nodesConnectable={editable} deleteKeyCode={editable ? ['Backspace', 'Delete'] : null} fitView={!graph.viewport} fitViewOptions={{ maxZoom: 1, padding: 0.2 }} ariaLabelConfig={{ 'controls.fitView.ariaLabel': '适合画布', 'controls.zoomIn.ariaLabel': '放大画布', 'controls.zoomOut.ariaLabel': '缩小画布' }} minZoom={0.15} maxZoom={2}>
              <Background gap={22} size={1} /><Controls fitViewOptions={{ maxZoom: 1, padding: 0.2 }} />
            </ReactFlow>
            {graph.nodes.length === 0 && <div className="mg-canvas-empty"><strong>从一个真实会话开始</strong><p>添加会话后，展开局部问答、制作材料卡，或载入已经建立的引用关系。</p></div>}
            <div className="mg-legend">{Object.entries(EDGE_LABELS).map(([kind, label]) => <span key={kind}><i style={{ background: EDGE_COLORS[kind as keyof typeof EDGE_COLORS] }} />{label}</span>)}</div>
          </div>
          {(selectedNode || selectedEdge || showObjects) && <aside className="mg-details">
            {showObjects && <section className="mg-object-browser"><h2>关联已有对象</h2><select aria-label="对象类型" value={objectType.namespace} onChange={(event) => { const value = OBJECT_TYPES.find((type) => type.namespace === event.target.value)!; setObjectType(value); void loadObjects(value) }}>{OBJECT_TYPES.map((type) => <option value={type.namespace} key={type.namespace}>{type.label}</option>)}</select><p>只加载标题和关联身份；正文仍由来源管理。</p>{objectError && <p className="mg-error" role="alert">{objectError}</p>}{objects.filter((object) => !object.deleted).map((object) => <button className="mg-picker-item" disabled={busy || !editable} key={object.objectId} onClick={() => void addObject(object)}>{object.title || '未命名对象'} ＋</button>)}{objectCursor && <button onClick={() => void loadObjects(objectType, objectCursor)}>加载更多</button>}<button className="mg-quiet" onClick={() => setShowObjects(false)}>收起对象列表</button></section>}
            {selectedNode && <section>
              <span className="mg-node-kind">{NODE_LABELS[selectedNode.data.kind]}</span><h2>{selectedNode.data.label}</h2>
              {selectedNode.data.excerpt && <blockquote>{selectedNode.data.excerpt}</blockquote>}
              <div className="mg-detail-actions">
                {selectedNode.data.logicalSessionId && <button className="mg-primary" disabled={busy || !status?.capabilities.sessions} onClick={() => void run(() => openSession(selectedNode.data.logicalSessionId!))}>打开完整会话</button>}
                {selectedNode.data.objectId && selectedNode.data.namespace && <button disabled={busy} onClick={() => void run(async () => { await parentRequest('open-object', { namespace: selectedNode.data.namespace, objectId: selectedNode.data.objectId }) })}>打开来源对象</button>}
                {selectedNode.data.logicalSessionId && <button disabled={previewBusy || !status?.capabilities.sessions} onClick={() => expanded ? setExpanded(false) : void loadPreview()}>{expanded ? '收起局部问答' : '展开局部问答'}</button>}
                <button disabled={!editable} onClick={() => { editGraph((old) => removePresentation(old, [selectedNode.id])); setSelectedNodeId(null); setNotice('只移除了画布卡片；会话、对象和引用关系仍保留。') }}>移除卡片呈现</button>
              </div>
              {!selectedNode.data.logicalSessionId && !selectedNode.data.objectId && <p className="mg-warning">此卡片缺少来源身份，无法展开或跳转。</p>}
              {expanded && <div className="mg-preview">
                <p className="mg-hint">按需读取已完成的局部问答。选中回复中的文字可制作材料卡或加入目标会话引用；不会自动发送。</p>
                {previewBusy && <p>正在读取…</p>}{previewError && <p role="alert" className="mg-error">{previewError}</p>}
                {preview?.items.map((item) => <article key={`${item.eventId}:${item.offset}`}><small>{item.role === 'user' ? '提问' : '回复'}{!item.complete ? ' · 分页片段' : ''}</small><div className="mg-source-text" onMouseUp={(event) => { if (item.role === 'assistant') captureSelection(event.currentTarget) }}>{item.text}</div></article>)}
                {selection && <div className="mg-selection-actions"><span>已选中 {selection.text.length} 字</span><button disabled={!editable} onClick={addMaterial}>制作材料卡</button><button disabled={!editable || !status?.capabilities.references || busy} onClick={() => { setError(''); setPicker({ purpose: 'reference', capture: selection.capture, sourceNodeId: selectedNode.id, operationId: crypto.randomUUID() }) }}>引用到会话</button></div>}
                {preview?.nextCursor && <button disabled={previewBusy} onClick={() => void loadPreview(preview.nextCursor ?? undefined)}>继续读取这一来源</button>}
                {!previewBusy && !previewError && preview && preview.items.length === 0 && <p>暂时没有可读取的已完成回复。</p>}
              </div>}
            </section>}
            {selectedEdge && <section><span className="mg-node-kind">{EDGE_LABELS[selectedEdge.data.kind]}</span><h2>连线与引用</h2><p>{selectedEdge.data.kind === 'knowledge' ? '这条线只表达知识关联，不会向模型加入上下文。' : '这条线指向由引用扩展维护的关系。它不代表模型已经读完来源。'}</p>{selectedEdge.data.relationId && <p className="mg-hint">{selectedRelationPresentation?.label}</p>}<div className="mg-detail-actions"><button disabled={!editable} onClick={() => { editGraph((old) => removePresentation(old, [], [selectedEdge.id])); setSelectedEdgeId(null); setNotice('只移除了线条呈现，未解除实际引用。') }}>仅移除线条呈现</button>{selectedEdge.data.relationId && <button className="mg-danger" disabled={busy || !status?.capabilities.references || activeRelation?.state === 'revoked' || selectedRelationPresentation?.state === 'revoked'} onClick={() => void unlinkReference()}>解除上下文引用</button>}</div><p className="mg-hint">解除引用影响后续读取，既有会话历史保持原有语义。</p></section>}
          </aside>}
        </div>
      </> : <div className="mg-welcome"><h2>让会话与材料在画布上相连</h2><p>创建或打开一份画布。会话按需展开，引用通过统一工具读取上游。</p><button className="mg-primary" disabled={busy || !status?.capabilities.storage} onClick={() => void createCanvas()}>新建画布</button>{!status && !busy && <button onClick={() => void refreshStatus()}>重新连接</button>}</div>}
    </main>
    {picker && <SessionPicker purpose={picker.purpose === 'reference' ? '引用到会话' : '添加真实会话'} canCreate={!busy} actionBusy={busy} actionError={error} onClose={() => { if (!busy) setPicker(null) }} onSelect={(item) => void chooseSession(item)} onCreate={() => void createSession()} />}
  </div>
}
