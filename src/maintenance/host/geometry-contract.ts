export type Context = { get(name: string): unknown; sessions: { open(id: string): Promise<unknown>; list: { getSnapshot(): { current?: string }; subscribe(notify: () => void): () => void } }; uiConversation: { binding(id: string): { target(name: string): { getSnapshot(): StickerChatSnapshotLike; subscribe(notify: () => void): () => void } } } };
export type StickerView = { record: { anchorId: string; quote: string; occurrence: number } };
export interface AnnotationCoreClient { resolveReferenceLink(sessionId: string, referenceId: string): Promise<{ referenceId: string; setId: string; state: string } | null>; deleteReferenceLink(sessionId: string, setId: string, referenceId: string): Promise<unknown> }
export interface StickerChatSnapshotLike {
  readonly order: readonly string[];
  readonly nodes: { get(key: string): { readonly id?: string; readonly kind?: string; readonly data?: unknown } | undefined };
}

/** A graph source needs the recorded assistant message ID, not the renderer's step ID. */
export function resolveSessionStickerAnchorId(snapshot: StickerChatSnapshotLike, renderedKey: string): string {
  const key = resolveRenderedAnchorKey(snapshot, renderedKey);
  const node = snapshot.nodes.get(key);
  const data = node?.data as { status?: string; finalNode?: { messageId?: string } } | undefined;
  if (node?.kind !== 'assistant-step' || data?.status !== 'settled' || !data.finalNode?.messageId)
    throw new Error('请等待所选回复完整结束并保存后，再创建会话贴纸');
  return data.finalNode.messageId;
}

/** Convert the current renderer key into the stable Conversation node identity. */
export function resolveDurableAnchorId(
  snapshot: StickerChatSnapshotLike,
  renderedKey: string,
): string {
  return snapshot.nodes.get(renderedKey)?.id ?? renderedKey;
}

/** Resolve a stored Conversation node identity back to this render's DOM key. */
export function resolveRenderedAnchorKey(
  snapshot: StickerChatSnapshotLike,
  anchorId: string,
): string {
  if (snapshot.nodes.get(anchorId)) return anchorId;
  return snapshot.order.find((key) => snapshot.nodes.get(key)?.id === anchorId) ?? anchorId;
}


type OverlayPoint = { x: number; y: number };
export function spreadDotPoint(point: OverlayPoint, placed: readonly OverlayPoint[]): OverlayPoint {
  let y = point.y;
  while (placed.some((candidate) => Math.abs(candidate.x - point.x) < 18 && Math.abs(candidate.y - y) < 20)) {
    y += 24;
  }
  return { x: point.x, y };
}
