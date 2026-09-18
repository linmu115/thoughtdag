/** Instance-scoped knowledge operations; no second storage or transcript copy. */
export async function knowledgeRequest<T>(operation: string, input: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/maintenance-knowledge/api/' + operation, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? '会话贴纸操作未完成');
  return result;
}
