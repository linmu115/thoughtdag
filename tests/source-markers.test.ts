import { expect, it, vi, beforeEach } from 'vitest';
import { cleanSourceMarkerBubble, groupSourceMarkers, loadSourceMarkers, resolveSourceMarkerAnchorKey, revokeSourceMarker } from '../src/maintenance/host/source-markers.ts';
import type { SourceMarker } from '../src/maintenance/host/source-markers.ts';
import type { UpstreamRelation } from '../src/maintenance/model.ts';

// 来源标记现在完全从本图的引用记录投影出来，所以这里替身的是 DAG 自己的管理 API，
// 不是任何外部知识服务。relation 形状与宿主 `session-graph.js` 的投影保持一致。
const managedApi = vi.hoisted(() => ({ relations: vi.fn(), resolve: vi.fn(), ensure: vi.fn(), remove: vi.fn() }));
vi.mock('../src/maintenance/client', () => ({ managedApi }));

const relation = (overrides: Partial<UpstreamRelation> = {}): UpstreamRelation => ({
  namespace: 'annotation-upstream', objectId: 'local-ref-a', revision: 1, referenceId: 'ref-a',
  sourceSessionId: 'source', targetSessionId: 'logical-y', sourceVersionId: 'v1', cutoffEventId: 'reply-id',
  sourceAnchorId: 'reply-id', state: 'pending', targetMessageId: null,
  selectedText: '引用段落', sourceOccurrence: 0, ...overrides,
});

const marker: SourceMarker = { objectId: 'local-ref-a', referenceId: 'ref-a', sourceVersionId: 'v1', sourceAnchorId: 'reply-id', messageId: 'reply-id', selectedText: '引用段落', occurrence: 0, targetLogicalSessionId: 'logical-y', targetTitle: '目标Y' };

beforeEach(() => {
  vi.clearAllMocks();
  managedApi.relations.mockResolvedValue({ items: [], nextCursor: null });
  managedApi.resolve.mockImplementation(async id => ({ logicalSessionId: id, nativeSessionId: 'native-' + id, title: '目标' }));
});

it('resolves the recorded message ID after the renderer assigns new keys', () => {
  const snapshot = { order: ['new-render-key'], nodes: new Map([['new-render-key', { id: 'step-42', kind: 'assistant-step', data: { status: 'settled', finalNode: { messageId: 'reply-id' } } }]]) };
  expect(resolveSourceMarkerAnchorKey(snapshot, 'reply-id')).toBe('new-render-key');
  expect(resolveSourceMarkerAnchorKey(snapshot, 'step-42')).toBeUndefined();
  expect(resolveSourceMarkerAnchorKey(snapshot, 'old-render-key')).toBeUndefined();
  expect(resolveSourceMarkerAnchorKey(undefined, 'reply-id')).toBeUndefined();
});

it('groups shared highlights, deduplicates target choices and preserves independent references after revocation', () => {
  const second = { ...marker, objectId: 'sticker-b', referenceId: 'ref-b', targetLogicalSessionId: 'logical-z', targetTitle: '目标Z' };
  const duplicate = { ...marker, objectId: 'sticker-c', referenceId: 'ref-c' };
  const groups = groupSourceMarkers([marker, second, duplicate]);
  expect(groups).toHaveLength(1); expect(groups[0]!.targets).toHaveLength(2);
  expect(groups[0]!.references.map(item => item.referenceId)).toEqual(['ref-a', 'ref-b', 'ref-c']);
  const remaining = groupSourceMarkers([second, duplicate]);
  expect(remaining[0]!.key).toBe(groups[0]!.key); expect(remaining[0]!.targets).toHaveLength(2);
  expect(groupSourceMarkers([second])[0]!.targets.map(target => target.targetLogicalSessionId)).toEqual(['logical-z']);
  expect(groupSourceMarkers([marker, { ...second, occurrence: 1 }])).toHaveLength(2);
});

it('projects outgoing references of this session, ignoring revoked rows and other sessions', async () => {
  managedApi.relations.mockResolvedValueOnce({ items: [
    relation(),
    relation({ referenceId: 'ref-revoked', objectId: 'local-ref-r', state: 'revoked' }),
    relation({ referenceId: 'ref-inbound', objectId: 'local-ref-i', sourceSessionId: 'other', targetSessionId: 'source' }),
    relation({ referenceId: 'ref-z', objectId: 'local-ref-z', targetSessionId: 'logical-z' }),
  ], nextCursor: null });
  expect(await loadSourceMarkers('source')).toEqual([
    { ...marker, targetTitle: '目标' },
    expect.objectContaining({ referenceId: 'ref-z', targetLogicalSessionId: 'logical-z', targetTitle: '目标' }),
  ]);
  expect(managedApi.relations).toHaveBeenCalledWith('source', undefined);
});

it('reads every relation page before projecting, and never fabricates a page it did not read', async () => {
  managedApi.relations.mockResolvedValueOnce({ items: [relation()], nextCursor: 'next' })
    .mockResolvedValueOnce({ items: [relation({ referenceId: 'ref-b', objectId: 'local-ref-b' })], nextCursor: null });
  expect((await loadSourceMarkers('source')).map(row => row.referenceId)).toEqual(['ref-a', 'ref-b']);
  expect(managedApi.relations.mock.calls).toEqual([['source', undefined], ['source', 'next']]);
});

it('revokes by removing exactly the edge carrying that reference from the target graph', async () => {
  managedApi.relations.mockResolvedValue({ items: [relation()], nextCursor: null });
  managedApi.ensure.mockResolvedValue({ objectId: 'graph-y', revision: 4, title: '目标Y', graph: { managedSchema: 2, ownerSessionId: 'logical-y', nodes: [], edges: [{ id: 'relation:ref-a', source: 'session:source', target: 'session:logical-y', data: { kind: 'upstream', relationId: 'ref-a' } }] } });
  await revokeSourceMarker('source', 'ref-a');
  expect(managedApi.ensure).toHaveBeenCalledWith('logical-y');
  expect(managedApi.remove).toHaveBeenCalledWith({ objectId: 'graph-y', expectedRevision: 4, edgeIds: ['relation:ref-a'], operationId: 'revoke-source:ref-a' });
});

it('refuses to revoke a reference this graph does not carry', async () => {
  managedApi.relations.mockResolvedValue({ items: [], nextCursor: null });
  await expect(revokeSourceMarker('source', 'ref-missing')).rejects.toThrow('不在当前图中');
  expect(managedApi.remove).not.toHaveBeenCalled();
  managedApi.relations.mockResolvedValue({ items: [relation()], nextCursor: null });
  managedApi.ensure.mockResolvedValue({ objectId: 'graph-y', revision: 1, title: 'Y', graph: { managedSchema: 2, ownerSessionId: 'logical-y', nodes: [], edges: [] } });
  await expect(revokeSourceMarker('source', 'ref-a')).rejects.toThrow('还没有这条引用连接');
  expect(managedApi.remove).not.toHaveBeenCalled();
});

it('cleans only the exact native target/set/reference, never issuing another graph mutation', async () => {
  const core = { resolveReferenceLink: vi.fn().mockResolvedValue({ setId: 'set-c', referenceId: 'ref-c', state: 'sent' }), deleteReferenceLink: vi.fn().mockResolvedValue({ deleted: true, scope: 'sent' }) };
  expect(await cleanSourceMarkerBubble({ ...marker, referenceId: 'ref-c' }, core)).toBe(true);
  expect(managedApi.resolve).toHaveBeenCalledWith('logical-y');
  expect(core.resolveReferenceLink).toHaveBeenCalledWith('native-logical-y', 'ref-c');
  expect(core.deleteReferenceLink).toHaveBeenCalledWith('native-logical-y', 'set-c', 'ref-c');
  expect(managedApi.remove).not.toHaveBeenCalled();
});

it('accepts absent or already deleted local bubbles without creating or removing another reference', async () => {
  const core = { resolveReferenceLink: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ setId: 'set-a', referenceId: 'ref-a', state: 'deleted' }), deleteReferenceLink: vi.fn() };
  expect(await cleanSourceMarkerBubble(marker, core)).toBe(true);
  expect(await cleanSourceMarkerBubble(marker, core)).toBe(true);
  expect(core.deleteReferenceLink).not.toHaveBeenCalled();
});

it('reports local cleanup failure without issuing another graph mutation', async () => {
  const core = { resolveReferenceLink: vi.fn().mockResolvedValue({ setId: 'set-a', referenceId: 'ref-a', state: 'sent' }), deleteReferenceLink: vi.fn().mockRejectedValue(new Error('offline')) };
  expect(await cleanSourceMarkerBubble(marker, core)).toBe(false);
  expect(await cleanSourceMarkerBubble(marker, undefined)).toBe(false);
  expect(managedApi.resolve).toHaveBeenCalledTimes(1);
  core.resolveReferenceLink.mockResolvedValueOnce({ setId: 'wrong-set', referenceId: 'another-ref', state: 'sent' });
  expect(await cleanSourceMarkerBubble(marker, core)).toBe(false);
  expect(core.deleteReferenceLink).toHaveBeenCalledTimes(1);
  expect(managedApi.remove).not.toHaveBeenCalled();
});
