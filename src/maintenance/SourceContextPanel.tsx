import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeContextDocument, NativeContextRange, NativeContextSource, UserRequestEntry, UserRequestPage, SessionContextPage } from '@linmu/dsh-session-contracts'
import { managedApi, ManagedApiError } from './client'

const operationLabels = { applied: '已生效', 'pending-next-step': '等待下一次原生模型请求', failed: '未生效', unsupported: '当前执行方式不支持' }
const materialLabels = { retained: '实际保留', 'release-pending': '等待释放', released: '已释放', unavailable: '来源不可用' }
const authorityLabels = { pending: '待发送', sent: '已授权', revoked: '已解除', unavailable: '来源不可用' }
const requestLabels = { pending: '待执行', running: '执行中', completed: '执行已结束', failed: '执行失败', cancelled: '已取消', unknown: '执行状态未知' }
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : '上下文状态暂时不可用'
const sameRange = (a: NativeContextRange, b: NativeContextRange) => a.startEventId === b.startEventId && a.endEventId === b.endEventId

/** Directory pages remain local UI state; viewing them does not claim model delivery. */
function RequestDirectory({ nativeSessionId, referenceId, ranges, disabled, onToggle }: {
  nativeSessionId: string; referenceId: string; ranges: NativeContextRange[] | null; disabled: boolean; onToggle(range: NativeContextRange): void
}) {
  const [page, setPage] = useState<UserRequestPage>(), [cursor, setCursor] = useState<string>(), [previous, setPrevious] = useState<Array<string | undefined>>([])
  const [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); setPage(undefined); setError('')
    void managedApi.nativeContext<UserRequestPage>(nativeSessionId, 'requests', { referenceId, limit: 10, ...(cursor ? { cursor } : {}) }, controller.signal).then(
      value => { if (!controller.signal.aborted) setPage(value) }, cause => { if (!controller.signal.aborted) setError(errorText(cause)) })
    return () => controller.abort()
  }, [nativeSessionId, referenceId, cursor, retry])
  return <section className="mg-request-directory" aria-label="来源用户请求索引">
    <p>只列出固定截止以内的真实用户请求。目录预览不表示 AI 已读取对应回答；执行结束不表示需求已经解决。</p>
    {error && <p role="alert" className="mg-error">{error}<button onClick={() => { setCursor(undefined); setPrevious([]); setRetry(value => value + 1) }}>重新读取目录</button></p>}
    {!page && !error && <p role="status">正在读取请求索引…</p>}
    {page?.items.map(item => <RequestRow key={`${page.snapshot}:${item.requestId}:${item.textOffset}`} item={item} nativeSessionId={nativeSessionId} referenceId={referenceId} disabled={disabled} selected={!!item.location && ranges !== null && ranges.some(range => sameRange(range, item.location!))} onToggle={onToggle}/>)}
    {page && !page.items.length && <p>当前范围内没有可读取的真实用户请求。</p>}
    {page?.budgetExhausted && <p className="mg-warning">本次目录读取额度已用完。已显示的内容仍可用于定位。</p>}
    <div className="mg-context-actions">{previous.length > 0 && <button disabled={!page} onClick={() => { setCursor(previous.at(-1)); setPrevious(value => value.slice(0, -1)) }}>上一页请求</button>}{page?.nextCursor && <button onClick={() => { setPrevious(value => [...value, cursor]); setCursor(page.nextCursor!) }}>下一页请求</button>}</div>
  </section>
}

function RequestRow({ item, nativeSessionId, referenceId, disabled, selected, onToggle }: { item: UserRequestEntry; nativeSessionId: string; referenceId: string; disabled: boolean; selected: boolean; onToggle(range: NativeContextRange): void }) {
  const [detail, setDetail] = useState(item), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const nextText = async () => {
    if (!detail.nextTextCursor) return
    controller.current?.abort(); const current = new AbortController(); controller.current = current; setLoading(true); setError('')
    try {
      const page = await managedApi.nativeContext<UserRequestPage>(nativeSessionId, 'requests', { referenceId, requestId: item.requestId, cursor: detail.nextTextCursor }, current.signal)
      if (!current.signal.aborted && page.items[0]) setDetail(page.items[0])
    } catch (cause) { if (!current.signal.aborted) setError(errorText(cause)) }
    finally { if (!current.signal.aborted) setLoading(false) }
  }
  return <article className="mg-request-row"><header><strong>请求 {item.ordinal}</strong><small>{requestLabels[item.state]}{item.sourceTrust !== 'verified' ? ' · 来源待核验' : ''}{item.relation === 'supplement' ? ' · 执行中补充' : ''}</small></header>
    <p className="mg-request-text">{item.sourceTrust !== 'verified' ? '提交来源待核验' : detail.text || (item.attachmentRefs.length ? '仅附件请求' : '无文本')}</p>
    {item.attachmentRefs.length > 0 && <small>附件：{item.attachmentRefs.map(attachment => attachment.name || attachment.type).join('、')}{item.attachmentsOmitted > 0 ? ` · 另有 ${item.attachmentsOmitted} 项` : ''}</small>}
    {detail.nextTextCursor && <button disabled={loading} onClick={() => void nextText()}>继续读取这条长请求</button>}
    {detail.textOffset > 0 && <small>当前从第 {detail.textOffset + 1} 字开始，共 {detail.totalChars} 字</small>}
    {error && <p role="alert" className="mg-error">{error}</p>}
    <div className="mg-context-actions"><button disabled={disabled || !item.location || item.sourceTrust !== 'verified'} aria-pressed={selected} onClick={() => { if (item.location) onToggle({ startEventId: item.location.startEventId, endEventId: item.location.endEventId }) }}>{selected ? '移出计划窗口' : '加入计划窗口'}</button><button disabled={disabled || !item.location || item.sourceTrust !== 'verified'} aria-expanded={previewOpen} onClick={() => setPreviewOpen(value => !value)}>{previewOpen ? '收起问答预览' : '查看这一问答'}</button>{!item.location && <small>当前无法核验问答位置</small>}</div>
    {previewOpen && <RequestAnswerPreview nativeSessionId={nativeSessionId} referenceId={referenceId} userRequestId={item.requestId}/>}
    <details><summary>稳定位置</summary><code>{item.eventId}</code><p>{item.replyRefs.length} 条关联回复 · {item.associationState === 'verified' ? '关联已核验' : '关联尚不完整'}</p></details>
  </article>
}

function RequestAnswerPreview({ nativeSessionId, referenceId, userRequestId }: { nativeSessionId: string; referenceId: string; userRequestId: string }) {
  const [page, setPage] = useState<SessionContextPage>(), [cursor, setCursor] = useState<string>(), [previous, setPrevious] = useState<Array<string | undefined>>([]), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); setPage(undefined); setError('')
    void managedApi.nativeContext<SessionContextPage>(nativeSessionId, 'user-read', { referenceId, userRequestId, ...(cursor ? { cursor } : {}) }, controller.signal).then(value => { if (!controller.signal.aborted) setPage(value) }, cause => { if (!controller.signal.aborted) setError(errorText(cause)) })
    return () => controller.abort()
  }, [nativeSessionId, referenceId, userRequestId, cursor, retry])
  return <section className="mg-request-answer" aria-label="固定问答预览"><p>用户只读预览，不会加入 AI 输入，也不记为模型已读。</p>{error && <p role="alert" className="mg-error">{error}<button onClick={() => { setCursor(undefined); setPrevious([]); setRetry(value => value + 1) }}>重新定位问答</button></p>}{!page && !error && <p role="status">正在读取这条请求对应的问答…</p>}{page?.items.map(item => <article key={`${item.eventId}:${item.offset}`}><small>{item.role === 'user' ? '来源问题' : item.role === 'assistant' ? '来源回复' : '关联过程'}{item.complete ? '' : ' · 分页片段'}</small><p className="mg-request-text">{item.text}</p></article>)}<div className="mg-context-actions">{previous.length > 0 && <button disabled={!page} onClick={() => { setCursor(previous.at(-1)); setPrevious(value => value.slice(0, -1)) }}>上一页问答</button>}{page?.nextCursor && <button onClick={() => { setPrevious(value => [...value, cursor]); setCursor(page.nextCursor!) }}>下一页问答</button>}</div></section>
}

export function SourceContextPanel({ nativeSessionId, referenceId, available, unavailableReason, onChanged }: {
  nativeSessionId: string | null; referenceId: string; available: boolean; unavailableReason?: string; onChanged(): void
}) {
  const [doc, setDoc] = useState<NativeContextDocument>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const [ranges, setRanges] = useState<NativeContextRange[] | null>(null), [dirty, setDirty] = useState(false), [requestsOpen, setRequestsOpen] = useState(false), [releaseOnPause, setReleaseOnPause] = useState(false)
  const [uncertain, setUncertain] = useState<{ operation: string; input: Record<string, unknown> } | null>(null)
  const active = useRef(true), request = useRef<AbortController | null>(null), dirtyRef = useRef(false), busyRef = useRef(false)
  dirtyRef.current = dirty; busyRef.current = busy
  const accept = useCallback((value: NativeContextDocument, reset = false) => {
    setDoc(value)
    if (reset || !dirtyRef.current) { setRanges(value.sources.find(source => source.referenceId === referenceId)?.window ?? null); setDirty(false) }
  }, [referenceId])
  const refresh = useCallback(async () => {
    if (!available || !nativeSessionId || busyRef.current) return
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    try { const value = await managedApi.nativeContext<NativeContextDocument>(nativeSessionId, 'status', {}, controller.signal); if (!controller.signal.aborted) { accept(value); setError('') } }
    catch (cause) { if (!controller.signal.aborted) setError(errorText(cause)) }
  }, [available, nativeSessionId, accept])
  useEffect(() => {
    active.current = true; void refresh()
    const update = () => { if (document.visibilityState !== 'hidden') void refresh() }
    const timer = window.setInterval(update, 10_000); window.addEventListener('focus', update)
    return () => { active.current = false; request.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus', update) }
  }, [refresh])
  const mutate = async (operation: string, input: Record<string, unknown>, repeated = false) => {
    if (!doc || !nativeSessionId || busyRef.current) return
    const payload = repeated ? input : { ...input, operationId: crypto.randomUUID(), expectedRevision: doc.revision, reason: '用户在会话图中管理上下文' }
    busyRef.current = true; setBusy(true); setError(''); setNotice(''); request.current?.abort()
    try {
      const value = await managedApi.nativeContext<NativeContextDocument>(nativeSessionId, operation, payload)
      if (!active.current) return
      accept(value, operation === 'window-set'); setUncertain(null)
      const receipt = value.operations.find(item => item.operationId === payload.operationId)
      setNotice(receipt ? `${operationLabels[receipt.state]}${receipt.reason ? `：${receipt.reason}` : ''}` : '状态已保存；材料是否释放以实际回执为准。')
      onChanged()
    } catch (cause) {
      if (!active.current) return
      setError(errorText(cause))
      if (!(cause instanceof ManagedApiError) || cause.status === 0 || cause.status >= 500 || (cause.status >= 200 && cause.status < 300)) setUncertain({ operation, input: payload })
      else setUncertain(null)
    } finally { busyRef.current = false; if (active.current) setBusy(false) }
  }
  if (!available || !nativeSessionId) return <section className="mg-source-context"><p>{unavailableReason || '当前实例尚未接入原生上下文管理。安装匹配插件后可管理窗口和保留状态。'}</p><button disabled>管理原生上下文</button></section>
  const source = doc?.sources.find(item => item.referenceId === referenceId)
  const materials = doc?.materials.filter(item => item.referenceIds.includes(referenceId)) ?? []
  const usable = source?.authorityState === 'sent' || source?.authorityState === 'pending'
  const disabled = busy || !!uncertain || !doc || !source || !usable
  const toggleRange = (range: NativeContextRange) => { setRanges(old => old?.some(item => sameRange(item, range)) ? old.filter(item => !sameRange(item, range)) : [...(old ?? []), range]); setDirty(true) }
  return <section className="mg-source-context" aria-label="来源上下文管理" aria-busy={busy}>
    <header><h3>来源上下文</h3><button disabled={busy} onClick={() => void refresh()}>刷新状态</button></header>
    {error && <p role="alert" className="mg-error">{error}{!uncertain && <span> 刷新状态后可重新提交；计划窗口仍保留。</span>}</p>}
    {notice && <p role="status">{notice}</p>}
    {uncertain && <div className="mg-context-actions"><p>尚未确认执行结果，重复检查会复用同一个操作身份。</p><button disabled={busy} onClick={() => void mutate(uncertain.operation, uncertain.input, true)}>核对并重试原操作</button></div>}
    {!doc && !error && <p role="status">正在读取原生上下文状态…</p>}
    {doc && !source && <p>这条连接尚无可管理的权威引用。它不会授予新的读取范围。</p>}
    {source && <>
      <SourceAuthority source={source}/>
      <div className="mg-context-actions"><button disabled={disabled} onClick={() => void mutate('source-set', { referenceId, enabled: !source.enabled, release: source.enabled && releaseOnPause })}>{source.enabled ? '暂停来源' : '恢复来源'}</button>
        {source.enabled && <label className="mg-context-check"><input type="checkbox" checked={releaseOnPause} disabled={disabled} onChange={event => setReleaseOnPause(event.target.checked)}/>暂停时同时释放已保留材料</label>}</div>
      <section className="mg-context-layer"><h3>当前披露窗口{dirty ? ' · 有未保存计划' : ''}</h3><p>扩大窗口只允许随后读取；缩小窗口会安排释放范围外材料。固定授权上限保持不变。</p>
        <RangeList ranges={ranges}/>
        <div className="mg-context-actions"><button disabled={disabled || !source.enabled} onClick={() => { setRanges(null); setDirty(true) }}>使用整个授权范围</button><button disabled={disabled || !source.enabled} onClick={() => { setRanges([]); setDirty(true) }}>清空计划窗口</button><button disabled={disabled || !source.enabled || !dirty} className="mg-primary" onClick={() => void mutate('window-set', { referenceId, ranges })}>保存窗口</button></div>
        <details open={requestsOpen} onToggle={event => setRequestsOpen(event.currentTarget.open)}><summary>按用户请求选择问答范围</summary>{requestsOpen && source.enabled && usable ? <RequestDirectory key={`${referenceId}:${source.enabled}:${source.authorityState}:${source.generation}`} nativeSessionId={nativeSessionId} referenceId={referenceId} ranges={ranges} disabled={disabled} onToggle={toggleRange}/> : requestsOpen ? <p>来源已暂停或不可用，恢复有效来源后才能读取目录。</p> : null}</details>
      </section>
      <section className="mg-context-layer"><h3>实际保留材料</h3><p>以原生输入回执为准。释放保留图边、来源定位和下方历史读取记录；需要时可重新读取。</p>
        <div className="mg-context-actions"><button disabled={disabled || !materials.some(item => item.state === 'retained' && !item.releasedReferenceIds?.includes(referenceId))} onClick={() => void mutate('release', { referenceId })}>释放此来源材料</button><small>只放弃此引用的持有；其它独立引用仍需要的材料会保留。</small></div>
        {!materials.length && <p>当前没有已登记的模型输入材料。</p>}
        {materials.map(material => <article className="mg-context-material" key={material.materialId} data-state={material.state}><header><strong>{materialLabels[material.state]}</strong><small>{material.bytes} 字节 · {material.kind === 'requests' ? '请求目录' : material.kind === 'initial' ? '初始问答' : material.kind === 'search' ? '搜索结果' : '读取材料'}</small></header>
          <p>{material.pinnedByUser ? '用户固定保留' : '用户未固定'}{material.pinnedByModel ? ' · 模型保留' : ''}{material.referenceIds.length > 1 ? ' · 多条引用共同持有' : ''}</p>
          {material.releasedReferenceIds?.includes(referenceId) && material.state === 'retained' && <p>此引用已放弃持有，材料仍由其它引用保留在输入中。</p>}
          <details><summary>片段位置</summary>{material.ranges.filter(range => range.referenceId === referenceId).map((range, index) => <p key={index}><code>{range.eventId}</code> [{range.start}, {range.end})</p>)}</details>
          <div className="mg-context-actions"><button disabled={disabled || material.state !== 'retained' || material.releasedReferenceIds?.includes(referenceId)} onClick={() => void mutate('pin', { materialIds: [material.materialId], pinned: !material.pinnedByUser })}>{material.pinnedByUser ? '取消用户固定' : '用户固定保留'}</button><button disabled={disabled || material.state !== 'retained' || material.pinnedByUser || material.releasedReferenceIds?.includes(referenceId)} onClick={() => void mutate('release', { materialIds: [material.materialId] })}>{material.referenceIds.length > 1 ? `释放整份共享材料（${material.referenceIds.length} 条引用）` : '释放材料'}</button></div>
          {material.referenceIds.length > 1 && <small>释放整份共享材料会同时影响上面标出的全部持有引用；只清理本来源请用“释放此来源材料”。</small>}
        </article>)}
        <p><small>当前实际保留 {materials.filter(item => item.state === 'retained' || item.state === 'release-pending').reduce((total, item) => total + item.bytes, 0)} 字节；这是字节记录，不是精确 token 数。释放不返还累计读取额度。</small></p>
      </section>
      <details><summary>操作及生效记录</summary>{doc?.operations.slice(-20).reverse().map(operation => <article className="mg-context-operation" key={operation.operationId}><strong>{operationLabels[operation.state]}</strong><p>{operation.actor === 'user' ? '用户' : operation.actor === 'model' ? '模型' : '运行环境'} · {operation.action} · {operation.reason}</p><small>{operation.createdAt}</small></article>)}{doc && (doc.trimmedOperations > 0 || doc.trimmedMaterials > 0) && <p>早期轻量记录已按容量上限裁剪；此处不保存材料全文。</p>}</details>
    </>}
  </section>
}

function SourceAuthority({ source }: { source: NativeContextSource }) {
  return <section className="mg-context-layer"><h3>固定授权上限 · {authorityLabels[source.authorityState]} · {source.enabled ? '启用' : '暂停'}</h3><dl><dt>来源</dt><dd>{source.title || source.sourceSessionId}</dd><dt>固定版本</dt><dd><code>{source.sourceVersionId}</code></dd><dt>截至完整回复</dt><dd><code>{source.cutoffEventId}</code></dd></dl></section>
}
function RangeList({ ranges }: { ranges: NativeContextRange[] | null }) {
  return ranges === null ? <p>整个已授权范围（仍按需读取）</p> : ranges.length === 0 ? <p>空窗口：不新增来源正文。</p> : <ol className="mg-context-ranges">{ranges.map((range, index) => <li key={`${range.startEventId}:${range.endEventId}:${index}`}><code>{range.startEventId}</code><span>至</span><code>{range.endEventId}</code></li>)}</ol>
}
