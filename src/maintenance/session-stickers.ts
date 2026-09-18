/** Instance-scoped knowledge operations; no second storage or transcript copy. */
export async function knowledgeRequest<T>(operation: string, input: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try { response = await fetch('/maintenance-knowledge/api/' + operation, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) }); }
  catch { throw Object.assign(new Error('维护服务暂不可用，内容尚未确认保存；输入已保留，请连接恢复后重试。'), { code: 'MAINTENANCE_UNAVAILABLE' }); }
  const result = await response.json().catch(() => { throw Object.assign(new Error('此实例未提供有效的维护知识接口，无法确认保存；已有数据保留。'), { code: 'MAINTENANCE_UNAVAILABLE' }); });
  if (!response.ok) throw new Error(result.error?.message ?? '会话贴纸操作未完成');
  return result;
}
