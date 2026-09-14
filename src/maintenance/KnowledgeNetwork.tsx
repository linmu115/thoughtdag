import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, MarkerType } from '@xyflow/react'
import type { NetworkItem, NetworkPage, NetworkImpact } from '@linmu/dsh-session-contracts'
import { knowledgeRequest, managedApi, parentRequest } from './client'

const labels = { session: '会话', canvas: '画布', sticker: '贴纸', note: '笔记链接', reference: '上下文引用' }
type Direction = 'all' | 'incoming' | 'outgoing'
type Filters = { query: string; kind: string; includeDeleted: boolean; logicalSessionId?: string; direction: Direction }

export function KnowledgeNetwork({ onClose, onCanvas }: { onClose(): void; onCanvas(objectId: string): Promise<void> }) {
  const [page, setPage] = useState<NetworkPage>({ items: [], nextCursor: null }), [query, setQuery] = useState(''), [kind, setKind] = useState('all')
  const [deleted, setDeleted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [scope, setScope] = useState<{ logicalSessionId: string; title: string } | null>(null), [direction, setDirection] = useState<Direction>('all')
  const [impact, setImpact] = useState<NetworkImpact | null>(null), [selected, setSelected] = useState<Set<string>>(new Set())
  const guard = useRef(false), operations = useRef(new Map<string, string>()), mounted = useRef(true), applied = useRef<Filters | null>(null)
  const run = async (work: () => Promise<void>) => {
    if (guard.current) return; guard.current = true; setBusy(true); setError('')
    try { await work() } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { guard.current = false; if (mounted.current) setBusy(false) }
  }
  const load = async (after?: string, override?: Partial<Filters>) => {
    const filters = after && applied.current ? applied.current : { query, kind, includeDeleted: deleted, ...(scope ? { logicalSessionId: scope.logicalSessionId } : {}), direction: scope ? direction : 'all', ...override } satisfies Filters
    const result = await knowledgeRequest<NetworkPage>('network', { ...filters, ...(after ? { after } : {}) })
    if (mounted.current) { applied.current = filters; setPage(old => after ? { ...result, items: [...old.items, ...result.items] } : result) }
  }
  useEffect(() => { mounted.current = true; void run(() => load()); return () => { mounted.current = false } }, [])
  const showImpact = async (logicalSessionId: string) => {
    const result = await knowledgeRequest<NetworkImpact>('impact', { logicalSessionId })
    if (mounted.current) { setImpact(result); setSelected(new Set()); operations.current.clear() }
  }
  const openSession = async (logicalSessionId: string) => {
    const target = await managedApi.resolve(logicalSessionId)
    await parentRequest('open-session', { nativeSessionId: target.nativeSessionId })
  }
  const showRelations = async (logicalSessionId: string, title: string, nextDirection: Direction) => {
    setScope({ logicalSessionId, title }); setDirection(nextDirection); setKind('reference'); setQuery('')
    await load(undefined, { query: '', kind: 'reference', logicalSessionId, direction: nextDirection })
  }
  const openItem = async (item: NetworkItem) => {
    if (item.deleted || !item.available) throw new Error('此对象已删除或扩展已停用；可在 Maintenance 扩展数据面板恢复或启用')
    if (item.kind === 'canvas') return onCanvas(item.objectId!)
    if (item.kind === 'session') return openSession(item.logicalSessionIds[0])
    if (item.kind === 'reference' && item.reference) return openSession(item.reference.targetSessionId)
    if (!item.namespace || !item.objectId) throw new Error('此对象缺少来源身份，请重新查询')
    await parentRequest('open-object', { namespace: item.namespace, objectId: item.objectId })
  }
  const graph = useMemo(() => {
    const rows = page.items.slice(0, 100), display = new Map(rows.filter(item => item.kind !== 'reference').map(item => [item.key, item]))
    for (const item of rows) if (item.reference) {
      const relation = item.reference
      for (const [id, title] of [[relation.sourceSessionId, relation.sourceTitle], [relation.targetSessionId, relation.targetTitle]]) {
        const key = 'session:' + id
        if (!display.has(key)) display.set(key, { key, kind: 'session', title, logicalSessionIds: [id], available: item.available, deleted: false, conflicts: 0 })
      }
    }
    const nodes = [...display.values()].map((item, index) => ({ id: item.key, position: { x: (index % 4) * 240, y: Math.floor(index / 4) * 95 }, data: { label: labels[item.kind] + ' · ' + item.title }, style: { borderColor: item.deleted ? '#aaa' : '#7c83b7', opacity: item.deleted ? .5 : 1 } }))
    const ids = new Set(nodes.map(n => n.id))
    const edges = rows.flatMap(item => item.kind === 'session' || item.kind === 'reference' || !ids.has(item.key) ? [] : item.logicalSessionIds.filter(id => ids.has('session:' + id)).map(id => ({ id: item.key + '>' + id, source: item.key, target: 'session:' + id, label: '关联', style: { stroke: '#54929b' }, markerEnd: { type: MarkerType.ArrowClosed } })))
    const references = new Set<string>()
    for (const item of rows) if (item.reference) {
      const relation = item.reference
      references.add(relation.referenceId)
      edges.push({ id: item.key, source: 'session:' + relation.sourceSessionId, target: 'session:' + relation.targetSessionId, label: relation.state === 'revoked' ? '已解除引用' : '固定上游', style: { stroke: relation.state === 'revoked' ? '#9ca3af' : '#8b7de6' }, markerEnd: { type: MarkerType.ArrowClosed } })
    }
    for (const relation of impact?.items ?? []) if (!references.has(relation.referenceId) && ids.has('session:' + relation.sourceSessionId) && ids.has('session:' + relation.targetSessionId)) edges.push({ id: relation.referenceId, source: 'session:' + relation.sourceSessionId, target: 'session:' + relation.targetSessionId, label: relation.status === 'new-content' ? '来源有新内容' : '固定上游', style: { stroke: relation.status === 'new-content' ? '#cc8338' : '#8b7de6' }, markerEnd: { type: MarkerType.ArrowClosed } })
    return { nodes, edges, display }
  }, [page, impact])
  const prepareNext = async () => {
    const row = impact?.items.find(item => selected.has(item.referenceId))
    if (!row) return
    const key = row.referenceId
    const operationId = operations.current.get(key) ?? crypto.randomUUID(); operations.current.set(key, operationId)
    await parentRequest('review-source', { targetSessionId: row.targetSessionId, sourceSessionId: row.sourceSessionId, operationId })
    setSelected(old => new Set([...old].filter(id => id !== key)))
    setNotice('已打开所选会话并放入最新来源引用与重审说明。检查后点击会话中的发送；其余选择保留。')
  }
  return <div className="mg-dialog-backdrop"><section className="mg-dialog mg-network" role="dialog" aria-modal="true" aria-label="全局维护网络">
    <header><div><h2>全局维护网络</h2><p>当前实例全部画布、会话、贴纸、笔记与已发送引用。按页读取目录，展开时才读取来源内容。</p></div><button disabled={busy} onClick={onClose}>关闭</button></header>
    <form onSubmit={event => { event.preventDefault(); void run(() => load()) }} className="mg-network-filters">
      <input aria-label="搜索网络" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、引用或选中文本" maxLength={200} />
      <select aria-label="网络类型" value={kind} onChange={event => setKind(event.target.value)}><option value="all">全部类型</option>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <select aria-label="引用方向" value={direction} disabled={!scope} onChange={event => setDirection(event.target.value as Direction)}><option value="all">全部方向</option><option value="incoming">引用了哪些来源</option><option value="outgoing">被哪些会话引用</option></select>
      <label><input type="checkbox" checked={deleted} onChange={event => setDeleted(event.target.checked)} />含已删除对象</label><button disabled={busy}>查询</button>
    </form>
    {scope && <p className="mg-network-scope">正在查看：{scope.title}<button disabled={busy} onClick={() => { setScope(null); setDirection('all'); void run(() => load(undefined, { logicalSessionId: undefined, direction: 'all' })) }}>查看全部会话</button></p>}
    {error && <p role="alert" className="mg-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div style={{ height: 270 }}><ReactFlow key={page.items[0]?.key ?? 'empty'} nodes={graph.nodes} edges={graph.edges} fitView nodesDraggable={false} onNodeDoubleClick={(_event, node) => { const item = graph.display.get(node.id); if (item) void run(() => openItem(item)) }}><Background /><Controls /></ReactFlow></div>
    {page.items.length > 100 && <p>图中显示前 100 个对象及其引用端点；列表保留已加载对象。</p>}
    <div className="mg-network-list">
      {!busy && page.items.length === 0 && <p>没有符合条件的对象或引用。可以调整搜索内容和方向。</p>}
      {page.items.map(item => <article key={item.key} className={item.reference ? 'mg-network-reference' : undefined}>
        <small>{labels[item.kind]}</small><button disabled={busy} onClick={() => void run(() => openItem(item))}>{item.title || '未命名'}</button>
        <span>{item.deleted ? '已删除' : !item.available ? '扩展停用' : ''}{item.conflicts ? ' · ' + item.conflicts + ' 个冲突' : ''}</span>
        {item.reference ? <div className="mg-network-reference-details">
          <span>{item.reference.state === 'revoked' ? '已解除引用' : '已发送 · 固定上游'}</span>
          <button disabled={busy} onClick={() => void run(() => openSession(item.reference!.sourceSessionId))}>来源：{item.reference.sourceTitle}</button><span aria-hidden="true">→</span>
          <button disabled={busy} onClick={() => void run(() => openSession(item.reference!.targetSessionId))}>目标：{item.reference.targetTitle}</button>
          <button disabled={busy} onClick={() => void run(() => showRelations(item.reference!.targetSessionId, item.reference!.targetTitle, 'incoming'))}>目标引用了哪些来源</button>
          <button disabled={busy} onClick={() => void run(() => showRelations(item.reference!.sourceSessionId, item.reference!.sourceTitle, 'outgoing'))}>来源被哪些会话引用</button>
        </div> : <>
          {item.kind === 'session' && <><button disabled={busy} onClick={() => void run(() => showRelations(item.logicalSessionIds[0], item.title, 'incoming'))}>引用了哪些来源</button><button disabled={busy} onClick={() => void run(() => showRelations(item.logicalSessionIds[0], item.title, 'outgoing'))}>被哪些会话引用</button></>}
          {item.logicalSessionIds.slice(0, 3).map(id => <button disabled={busy} key={id} onClick={() => void run(() => showImpact(id))}>查看影响{item.logicalSessionIds.length > 1 ? ' · ' + id.slice(-5) : ''}</button>)}
        </>}
      </article>)}
      {page.nextCursor && <button disabled={busy} onClick={() => void run(() => load(page.nextCursor!))}>加载更多</button>}
    </div>
    {impact && <section><h3>来源更新与关联会话</h3><p>追加新内容不会改变旧引用的截止位置。选择会话后，以来源最新完成回复准备重新回答，由你检查并发送。</p>{impact.items.length === 0 && <p>当前没有已提交的下游引用。</p>}{impact.items.map((row, index) => <label className="mg-impact-row" key={row.referenceId + index}><input type="checkbox" checked={selected.has(row.referenceId)} disabled={busy || row.status === 'source-unavailable'} onChange={event => setSelected(old => { const next = new Set(old); if (event.target.checked) next.add(row.referenceId); else next.delete(row.referenceId); return next })} /><span>{row.title}</span><small>{row.depth > 1 ? '间接关联 · ' : ''}{row.status === 'fixed' ? '固定引用有效' : row.status === 'new-content' ? '来源有新内容，待你判断' : '来源不可用'}</small></label>)}{impact.truncated && <p className="mg-warning">本次达到深度或数量额度；可从具体关联会话继续查看。</p>}<button disabled={busy || !selected.size} onClick={() => void run(prepareNext)}>准备下一条重新回答（已选 {selected.size}）</button></section>}
  </section></div>
}
