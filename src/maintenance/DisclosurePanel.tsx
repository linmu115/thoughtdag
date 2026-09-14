import { useCallback, useEffect, useRef, useState } from 'react'
import { managedApi } from './client'
import type { DisclosurePage } from './client'
const operations = { initial: '首轮材料', read: '工具读取', search: '搜索命中片段', preview: '用户预览' }
const deliveries = { prepared: '已准备 · 交付未确认', returned: '已返回', failed: '未交付' }
const states = { ok: '正常', empty: '空结果', 'budget-exhausted': '预算耗尽', unavailable: '来源不可用', revoked: '引用已解除' }
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
  return <section className="mg-disclosures"><p>位置记录结果范围，是否交付以状态为准。搜索命中不代表读完全文，预览不代表 AI 已读。</p>{error && <p className="mg-error" role="alert">{error}</p>}{page?.trimmed && <p className="mg-warning">早期记录已裁剪（{page.trimmedCount} 条）。当前固定上限不变。</p>}{page && <small>日志硬上限：{page.maxEntries} 条 / {page.maxBytes} 字节</small>}{items.map(item => <article key={item.receiptId}><strong>{operations[item.operation]} · {deliveries[item.delivery]}</strong><p>{states[item.status]} · {item.truncated ? '部分返回' : '本次返回完成'} · {item.hasMore ? '还有未读内容' : '无后续页'} · {item.returnedBytes} 字节</p><p>允许截至 <code>{item.cutoffEventId}</code> · 固定版本 <code>{item.sourceVersionId}</code></p>{item.ranges.map((range, index) => <p key={`${range.eventId}:${index}`}>{item.delivery === 'returned' ? '实际返回' : item.delivery === 'prepared' ? '已准备范围' : '未交付范围'}：<code>{range.eventId}</code> [{range.start}, {range.end}){range.complete ? ' · 该片段完整' : ''}</p>)}{item.next && <p>继续位置：<code>{item.next.eventId}</code> / {item.next.offset}</p>}{item.selectedTurnComplete === false && <p>所选问答尚未完整返回</p>}<small>{item.recordedAt} · 执行 {item.executionId}</small></article>)}{!busy && !items.length && <p>当前页没有这条引用的读取记录；这不代表无权读取。</p>}{busy && <p>正在读取位置记录…</p>}<button disabled={busy} onClick={() => void load()}>刷新读取位置</button>{page?.nextCursor && <button disabled={busy} onClick={() => void load(page.nextCursor!)}>更多位置记录</button>}</section>
}
