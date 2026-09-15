import { useCallback, useEffect, useRef, useState } from 'react'
import { managedApi } from './client'
import type { DisclosurePage } from './client'
const operations = { initial: '首轮材料', read: '工具读取', search: '搜索命中片段', preview: '用户预览' }
const deliveries = { prepared: '已准备 · 交付未确认', returned: '已返回', failed: '未交付' }
const states = { ok: '正常', empty: '空结果', 'budget-exhausted': '预算耗尽', unavailable: '来源不可用', revoked: '引用已解除' }
function displayTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
export function DisclosurePanel({ objectId, referenceId }: { objectId: string; referenceId?: string }) {
  const [page, setPage] = useState<DisclosurePage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const ticket = useRef(0)
  const load = useCallback(async (after?: string) => {
    const current = ++ticket.current; setBusy(true); setError('')
    try { const result = await managedApi.disclosures(objectId, after); if (current === ticket.current) setPage(old => after && old ? { ...result, items: [...old.items, ...result.items] } : result) }
    catch (cause) { if (current === ticket.current) setError(cause instanceof Error ? cause.message : '日志暂不可用') }
    finally { if (current === ticket.current) setBusy(false) }
  }, [objectId])
  useEffect(() => { const counter = ticket; void load(); return () => { counter.current++ } }, [load])
  const items = page?.items.filter(item => item.referenceId === referenceId) ?? []
  return <section className="mg-disclosures" aria-busy={busy}>
    <p className="mg-disclosure-note">位置记录结果范围，是否交付以状态为准。搜索命中不代表读完全文，预览不代表 AI 已读。</p>
    {error && <p className="mg-error" role="alert">{error}</p>}
    {page?.trimmed && <p className="mg-warning">早期记录已裁剪（{page.trimmedCount} 条）。当前固定上限不变。</p>}
    {page && <small className="mg-disclosure-limit">日志硬上限：{page.maxEntries} 条 / {page.maxBytes} 字节</small>}
    {items.map(item => <article className="mg-disclosure-entry" key={item.receiptId}>
      <header className="mg-disclosure-heading"><h3>{operations[item.operation]}</h3><span className="mg-disclosure-state" data-delivery={item.delivery}>{deliveries[item.delivery]}</span></header>
      <div className="mg-disclosure-summary"><span>{states[item.status]}</span><span>{item.truncated ? '部分返回' : '本次返回完成'}</span><span>{item.hasMore ? '还有未读内容' : '无后续页'}</span><span>{item.returnedBytes} 字节</span></div>
      <dl className="mg-disclosure-fields">
        <dt>允许截至</dt><dd><code>{item.cutoffEventId}</code></dd>
        <dt>固定版本</dt><dd><code>{item.sourceVersionId}</code></dd>
        {item.next && <><dt>继续位置</dt><dd><code>{item.next.eventId}</code> / {item.next.offset}</dd></>}
      </dl>
      {item.ranges.length > 0 && <div className="mg-disclosure-ranges">{item.ranges.map((range, index) => <p key={`${range.eventId}:${index}`}>{item.delivery === 'returned' ? '实际返回' : item.delivery === 'prepared' ? '已准备范围' : '未交付范围'}：<code>{range.eventId}</code> [{range.start}, {range.end}){range.complete ? ' · 该片段完整' : ''}</p>)}</div>}
      {item.selectedTurnComplete === false && <p className="mg-warning">所选问答尚未完整返回</p>}
      <footer className="mg-disclosure-meta"><time dateTime={item.recordedAt}>{displayTime(item.recordedAt)}</time><span>执行 {item.executionId}</span></footer>
    </article>)}
    {!busy && !items.length && <p>当前页没有这条引用的读取记录；这不代表无权读取。</p>}
    {busy && <p role="status">正在读取位置记录…</p>}
    <div className="mg-disclosure-actions"><button disabled={busy} onClick={() => void load()}>刷新读取位置</button>{page?.nextCursor && <button disabled={busy} onClick={() => void load(page.nextCursor!)}>更多位置记录</button>}</div>
  </section>
}
