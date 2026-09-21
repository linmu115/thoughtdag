import type { StickerChatSnapshotLike } from './geometry-contract';
import type { GraphSourceMarker, GraphSourceMarkerPage } from '../contracts';
import type { AnnotationCoreClient } from './geometry-contract';
import type { UpstreamRelation } from '../model';
import { managedApi } from '../client';

export const SOURCE_MARKERS_CHANGED = 'dsh-session-references-changed';

/** Server-projected active references, never a second store of source transcripts. */
export type SourceMarker = GraphSourceMarker;
export type SourceMarkerPage = GraphSourceMarkerPage;
export interface SourceMarkerGroup {
  key: string;
  messageId: string;
  selectedText: string;
  occurrence: number;
  /** Navigation deduplicates targets; deletion must retain every independent relation. */
  references: SourceMarker[];
  targets: SourceMarker[];
}

export type SourceMarkerLocalReferences = Pick<AnnotationCoreClient, 'resolveReferenceLink' | 'deleteReferenceLink'>;

/**
 * 解除一条来源引用在本图里的登记。
 *
 * DAG 只有本地数据，没有第二套权威存储：解除就是**从目标会话的图里移除那条
 * 承载该引用的连接**。Core 的引用正文由 Core 自己管理，DAG 从不删除它。
 */
export async function revokeSourceMarker(nativeSessionId: string, referenceId: string): Promise<void> {
  const relations = await loadLocalRelations(nativeSessionId);
  const relation = relations.find(row => row.referenceId === referenceId);
  if (!relation) throw new Error('这条来源引用不在当前图中，无法解除');
  const graph = await managedApi.ensure(relation.targetSessionId);
  const edge = graph.graph.edges.find(item => item.data.relationId === referenceId);
  if (!edge) throw new Error('目标会话的图里还没有这条引用连接，请先打开该会话的图');
  await managedApi.remove({ objectId: graph.objectId, expectedRevision: graph.revision, edgeIds: [edge.id], operationId: `revoke-source:${referenceId}` });
}

/** Local bubbles may be absent after import. Their cleanup never reverses an authoritative revoke. */
export async function cleanSourceMarkerBubble(marker: SourceMarker, core: SourceMarkerLocalReferences | undefined): Promise<boolean> {
  if (!core?.resolveReferenceLink || !core.deleteReferenceLink) return false;
  try {
    const target = await managedApi.resolve(marker.targetLogicalSessionId);
    if (target.logicalSessionId !== marker.targetLogicalSessionId || !target.nativeSessionId) return false;
    const link = await core.resolveReferenceLink(target.nativeSessionId, marker.referenceId);
    if (!link || link.state === 'deleted') return true;
    if (link.referenceId !== marker.referenceId || !link.setId) return false;
    await core.deleteReferenceLink(target.nativeSessionId, link.setId, marker.referenceId);
    return true;
  } catch { return false; }
}

/**
 * 本图自己的上游引用记录：`annotation-upstream` 对象里 source 或 target 命中该会话的活跃行。
 * 这是 DAG 唯一的引用视图，不再向任何外部知识接口要投影。
 */
async function loadLocalRelations(sessionId: string): Promise<UpstreamRelation[]> {
  const items: UpstreamRelation[] = [];
  let after: string | undefined;
  do {
    const page = await managedApi.relations(sessionId, after);
    items.push(...page.items);
    after = page.nextCursor ?? undefined;
  } while (after);
  return items;
}

/**
 * 来源标记 = 「这个会话的某段选文，已经作为上游引用送进了哪个目标会话」。
 * 直接从本图的引用记录投影出来；没有第二份记录，也没有外部服务。
 */
export async function loadSourceMarkers(nativeSessionId: string): Promise<SourceMarker[]> {
  const relations = await loadLocalRelations(nativeSessionId);
  const outgoing = relations.filter(row => row.sourceSessionId === nativeSessionId && row.state !== 'revoked');
  const titles = new Map<string, string>();
  const markers = new Map<string, SourceMarker>();
  for (const relation of outgoing) {
    const referenceId = relation.referenceId;
    if (!referenceId || !relation.sourceAnchorId || !relation.targetSessionId) continue;
    if (!titles.has(relation.targetSessionId)) {
      const target = await managedApi.resolve(relation.targetSessionId).catch(() => undefined);
      titles.set(relation.targetSessionId, target?.title ?? relation.targetSessionId);
    }
    markers.set(referenceId, {
      objectId: relation.objectId,
      referenceId,
      sourceVersionId: relation.sourceVersionId,
      sourceAnchorId: relation.sourceAnchorId,
      messageId: relation.sourceAnchorId,
      selectedText: relation.selectedText ?? '',
      occurrence: relation.sourceOccurrence ?? 0,
      targetLogicalSessionId: relation.targetSessionId,
      targetTitle: titles.get(relation.targetSessionId) ?? relation.targetSessionId,
    });
  }
  return [...markers.values()];
}

export function groupSourceMarkers(markers: readonly SourceMarker[]): SourceMarkerGroup[] {
  const groups = new Map<string, SourceMarkerGroup>();
  for (const marker of markers) {
    const key = JSON.stringify([marker.messageId, marker.selectedText, marker.occurrence]);
    let group = groups.get(key);
    if (!group) {
      group = { key, messageId: marker.messageId, selectedText: marker.selectedText, occurrence: marker.occurrence, references: [], targets: [] };
      groups.set(key, group);
    }
    if (!group.references.some(reference => reference.referenceId === marker.referenceId)) group.references.push(marker);
    // Two independent references to one target need only one navigation choice.
    if (!group.targets.some(target => target.targetLogicalSessionId === marker.targetLogicalSessionId)) group.targets.push(marker);
  }
  return [...groups.values()];
}

/** Saved message IDs are resolved against the current render, never used as step IDs. */
export function resolveSourceMarkerAnchorKey(snapshot: StickerChatSnapshotLike | undefined, messageId: string): string | undefined {
  return snapshot?.order.find(key => {
    const node = snapshot.nodes.get(key);
    const data = node?.data as { status?: string; finalNode?: { messageId?: string } } | undefined;
    return node?.kind === 'assistant-step' && data?.status === 'settled' && data.finalNode?.messageId === messageId;
  });
}
