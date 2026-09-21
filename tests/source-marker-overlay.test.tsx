// @vitest-environment jsdom
// 来源标记的渲染与操作测试。宿主端口改成 DAG 自己的管理 API：标记不再来自任何
// 外部知识接口，而是本图引用记录的投影。
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SourceMarkerOverlay } from '../src/maintenance/host/source-marker-overlay.tsx';
import { SOURCE_MARKERS_CHANGED } from '../src/maintenance/host/source-markers.ts';
import type { SourceMarker } from '../src/maintenance/host/source-markers.ts';

// Ordinary stickers remain independently mounted; these sentinels verify markers never remove their DOM.
function StickerOverlay(props: { sessionId?: string }) { void props; return <><span className="dsh-sticker-board-dot" /><span className="dsh-sticker-board-highlight-pink" /></>; }

const managedApi = vi.hoisted(() => ({ relations: vi.fn(), resolve: vi.fn(), ensure: vi.fn(), remove: vi.fn() }));
vi.mock('../src/maintenance/client', () => ({ managedApi }));

const relation = (referenceId: string, targetSessionId: string, targetTitle: string) => ({
  namespace: 'annotation-upstream' as const, objectId: 'local-' + referenceId, revision: 1, referenceId,
  sourceSessionId: 'source', targetSessionId, sourceVersionId: 'v1', cutoffEventId: 'saved-message-id',
  sourceAnchorId: 'saved-message-id', state: 'pending' as const, targetMessageId: null,
  selectedText: '被引用的段落', sourceOccurrence: 0, targetTitle,
});
const markerFor = (referenceId: string, targetSessionId: string, targetTitle: string): SourceMarker => ({
  objectId: 'local-' + referenceId, referenceId, sourceVersionId: 'v1', sourceAnchorId: 'saved-message-id', messageId: 'saved-message-id',
  selectedText: '被引用的段落', occurrence: 0, targetLogicalSessionId: targetSessionId, targetTitle,
});

let host: HTMLDivElement, article: HTMLElement, root: ReturnType<typeof createRoot>;
let rows: { referenceId: string; targetSessionId: string; targetTitle: string }[];
const open = vi.fn();
const resolveReferenceLink = vi.fn(), deleteReferenceLink = vi.fn();
const core = { resolveReferenceLink, deleteReferenceLink };
const marker = markerFor('ref-a', 'logical-y', '目标Y');
const snapshot = { order: ['current-render'], nodes: new Map([['current-render', { id: 'step-4', kind: 'assistant-step', data: { status: 'settled', finalNode: { messageId: 'saved-message-id' } } }]]) };
const rect = { left: 30, top: 40, right: 130, bottom: 60, width: 100, height: 20, x: 30, y: 40, toJSON: () => ({}) };
const ordinarySticker = { record: { stickerId: 'ordinary', sessionId: 'native-x', anchorId: 'step-4', role: 'assistant', quote: marker.selectedText, quoteHash: 'sha256:ordinary', occurrence: 0, markdown: '普通贴纸', tags: [], color: 'pink' }, displayNumber: 1 };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [rect] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => rect });
  article = document.createElement('article'); article.dataset.chatAnchorKey = 'current-render'; article.dataset.chatFlowKind = 'assistant-step'; article.textContent = '这里是被引用的段落。'; document.body.append(article);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); rows = [{ referenceId: 'ref-a', targetSessionId: 'logical-y', targetTitle: '目标Y' }];
  resolveReferenceLink.mockImplementation(async (_sessionId: string, referenceId: string) => ({ setId: 'set-' + referenceId, referenceId, state: 'sent' }));
  deleteReferenceLink.mockResolvedValue({ deleted: true, scope: 'sent' });
  managedApi.relations.mockImplementation(async () => ({ items: rows.map(row => relation(row.referenceId, row.targetSessionId, row.targetTitle)), nextCursor: null }));
  managedApi.resolve.mockImplementation(async (logicalSessionId: string) => ({
    logicalSessionId, nativeSessionId: logicalSessionId === 'logical-z' ? 'native-z' : 'native-y',
    title: rows.find(row => row.targetSessionId === logicalSessionId)?.targetTitle ?? '目标',
  }));
  managedApi.ensure.mockImplementation(async (logicalSessionId: string) => ({ objectId: 'graph-' + logicalSessionId, revision: 2, title: '目标',
    graph: { managedSchema: 2, ownerSessionId: logicalSessionId, nodes: [], edges: rows.map(row => ({ id: 'relation:' + row.referenceId, source: 'session:source', target: 'session:' + row.targetSessionId, data: { kind: 'upstream', relationId: row.referenceId } })) } }));
  // 解除引用就是移除承载它的那条边：替身必须跟着改自己的关系表，否则重读会把它复活。
  managedApi.remove.mockImplementation(async (input: { edgeIds?: string[] }) => {
    const removed = new Set((input.edgeIds ?? []).map(id => id.replace(/^relation:/, '')));
    rows = rows.filter(row => !removed.has(row.referenceId));
    return { objectId: 'graph', revision: 3, title: '目标', graph: { managedSchema: 2, ownerSessionId: 'logical-y', nodes: [], edges: [] } };
  });
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); article.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function render(ordinary = false) {
  await act(async () => root.render(<>
    {ordinary && <StickerOverlay />}
    <SourceMarkerOverlay ctx={{ sessions: { open }, get: () => core } as never} sessionId="source" snapshot={snapshot} ordinaryStickers={ordinary ? [ordinarySticker] as never : []} />
  </>));
}
async function click(selector: string) { await act(async () => { const button = host.querySelector<HTMLButtonElement>(selector); expect(button).toBeTruthy(); button!.click(); }); }
async function refresh() { await act(async () => { window.dispatchEvent(new Event(SOURCE_MARKERS_CHANGED)); }); }
async function contextMenu() { await act(async () => { const dot = host.querySelector('.dsh-source-reference-dot'); expect(dot).toBeTruthy(); expect(dot!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 80 }))).toBe(false); }); }
async function menuItem(label: string) { await act(async () => { const item = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent === label); expect(item).toBeTruthy(); item!.click(); }); }
const operations = () => managedApi.relations.mock.calls.length;

it('restores a numbered marker at the highlight upper-right and opens the real target without sending', async () => {
  await render(); expect(host.querySelectorAll('.dsh-source-reference-highlight')).toHaveLength(1);
  expect(host.querySelector('.dsh-source-reference-dot')?.getAttribute('data-dsh-source-message-id')).toBe('saved-message-id');
  const badge = host.querySelector<HTMLElement>('.dsh-source-reference-dot')!;
  expect(badge.textContent).toBe('1');
  expect(badge.style.left).toBe('132px');
  expect(badge.style.top).toBe('40px');
  await click('.dsh-source-reference-dot'); expect(open).toHaveBeenCalledWith('native-y');
  expect(managedApi.resolve).toHaveBeenCalledWith('logical-y');
  expect(managedApi.remove).not.toHaveBeenCalled();
  await act(() => root.unmount()); root = createRoot(host); await render();
  expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(1);
});

it('presents target choices at a shared location, then revalidates the selected target', async () => {
  rows = [{ referenceId: 'ref-a', targetSessionId: 'logical-y', targetTitle: '目标Y' }, { referenceId: 'ref-b', targetSessionId: 'logical-z', targetTitle: '目标Z' }];
  await render(); expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(1);
  await click('.dsh-source-reference-dot'); expect(open).not.toHaveBeenCalled();
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('目标Y'); expect(host.textContent).toContain('目标Z');
  await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('.dsh-source-reference-menu button')].find(button => button.textContent === '目标Z')!.click(); });
  expect(open).toHaveBeenCalledWith('native-z');
});

it('removes only revoked blue relationships while preserving other targets and ordinary red stickers', async () => {
  rows = [{ referenceId: 'ref-a', targetSessionId: 'logical-y', targetTitle: '目标Y' }, { referenceId: 'ref-b', targetSessionId: 'logical-z', targetTitle: '目标Z' }];
  await render(true);
  expect(host.querySelectorAll('.dsh-sticker-board-dot:not(.dsh-source-reference-dot)')).toHaveLength(1);
  expect(host.querySelectorAll('.dsh-sticker-board-highlight-pink')).toHaveLength(1);
  rows = [{ referenceId: 'ref-b', targetSessionId: 'logical-z', targetTitle: '目标Z' }]; await refresh();
  expect(host.querySelectorAll('.dsh-source-reference-highlight')).toHaveLength(0);
  expect(host.querySelector('.dsh-source-reference-dot')?.getAttribute('aria-label')).toContain('目标Z');
  rows = []; await refresh(); expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(0);
  expect(host.querySelectorAll('.dsh-source-reference-highlight')).toHaveLength(0);
  expect(host.querySelectorAll('.dsh-sticker-board-dot:not(.dsh-source-reference-dot)')).toHaveLength(1);
  expect(host.querySelectorAll('.dsh-sticker-board-highlight-pink')).toHaveLength(1);
});

it('does not follow a stale symbol after its relation is removed', async () => {
  await render(); rows = []; await click('.dsh-source-reference-dot');
  expect(open).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')?.textContent).toContain('已解除');
  expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(0);
});

it('fails closed while the authority cannot verify source markers', async () => {
  await render(); managedApi.relations.mockRejectedValueOnce(new Error('temporarily unavailable'));
  await click('.dsh-source-reference-dot'); expect(open).not.toHaveBeenCalled();
  expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('temporarily unavailable');
});

it('does not navigate after the source is closed while target resolution is pending', async () => {
  await render(); let resolveTarget!: (value: unknown) => void;
  const implementation = managedApi.resolve.getMockImplementation()!;
  managedApi.resolve.mockImplementationOnce(() => new Promise(resolve => { resolveTarget = resolve; }));
  await click('.dsh-source-reference-dot'); await act(() => root.unmount()); root = createRoot(host);
  await act(async () => { resolveTarget({ nativeSessionId: 'native-y', logicalSessionId: 'logical-y', title: '目标Y' }); });
  expect(open).not.toHaveBeenCalled();
  managedApi.resolve.mockImplementation(implementation);
});

it('opens the DSH-style context menu and revokes one exact relation while preserving shared highlights and red stickers', async () => {
  rows = [{ referenceId: 'ref-a', targetSessionId: 'logical-y', targetTitle: '目标Y' }, { referenceId: 'ref-b', targetSessionId: 'logical-z', targetTitle: '目标Z' }];
  await render(true); await contextMenu();
  expect(host.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('会话引用操作');
  expect(open).not.toHaveBeenCalled();
  const changed = vi.fn(); window.addEventListener(SOURCE_MARKERS_CHANGED, changed);
  try {
    await menuItem('删除引用：目标Y');
    expect(managedApi.remove).toHaveBeenCalledWith(expect.objectContaining({ edgeIds: ['relation:ref-a'] }));
    expect(deleteReferenceLink).toHaveBeenCalledWith('native-y', 'set-ref-a', 'ref-a');
    expect(changed).toHaveBeenCalled();
    expect(host.querySelector('.dsh-source-reference-dot')?.getAttribute('aria-label')).toContain('目标Z');
    expect(host.querySelectorAll('.dsh-sticker-board-dot:not(.dsh-source-reference-dot)')).toHaveLength(1);
    expect(host.querySelectorAll('.dsh-sticker-board-highlight-pink')).toHaveLength(1);
    expect(open).not.toHaveBeenCalled();
  } finally { window.removeEventListener(SOURCE_MARKERS_CHANGED, changed); }
});

it('keeps separately deletable references to the same target while navigation remains deduplicated', async () => {
  rows = [{ referenceId: 'ref-a', targetSessionId: 'logical-y', targetTitle: '目标Y' }, { referenceId: 'ref-c', targetSessionId: 'logical-y', targetTitle: '目标Y' }, { referenceId: 'ref-b', targetSessionId: 'logical-z', targetTitle: '目标Z' }];
  await render(); await contextMenu();
  await menuItem('删除引用：目标Y（引用 2）');
  expect(managedApi.remove).toHaveBeenCalledWith(expect.objectContaining({ edgeIds: ['relation:ref-c'] }));
  expect(deleteReferenceLink).toHaveBeenCalledWith('native-y', 'set-ref-c', 'ref-c');
  expect(rows.map(row => row.referenceId)).toEqual(['ref-a', 'ref-b']);
  expect(host.querySelectorAll('.dsh-source-reference-highlight')).toHaveLength(1);
  await click('.dsh-source-reference-dot');
  expect([...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].map(button => button.textContent)).toEqual(['目标Y', '目标Z', '关闭']);
});

it('keeps the marker, highlight and menu when the graph revoke fails, then allows retry', async () => {
  await render(); await contextMenu();
  managedApi.remove.mockRejectedValueOnce(new Error('撤销事务暂不可用'));
  const changed = vi.fn(); window.addEventListener(SOURCE_MARKERS_CHANGED, changed);
  try {
    await menuItem('删除引用');
    expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(1);
    expect(host.querySelectorAll('.dsh-source-reference-highlight')).toHaveLength(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('撤销事务暂不可用');
    expect(host.querySelector('[role="menu"]')).toBeTruthy();
    expect(deleteReferenceLink).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    await menuItem('删除引用');
    expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(0);
    expect(host.querySelectorAll('.dsh-source-reference-highlight')).toHaveLength(0);
  } finally { window.removeEventListener(SOURCE_MARKERS_CHANGED, changed); }
});

it('does not hide a pending revoke or dispatch a success event before the graph acknowledges it', async () => {
  await render(); await contextMenu(); let acknowledge!: (value: unknown) => void;
  managedApi.remove.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
  const changed = vi.fn(); window.addEventListener(SOURCE_MARKERS_CHANGED, changed);
  try {
    await menuItem('删除引用'); await menuItem('删除引用');
    expect(managedApi.remove).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(1); expect(changed).not.toHaveBeenCalled();
    await act(async () => { rows = []; acknowledge({ objectId: 'graph', revision: 3, title: '目标', graph: { managedSchema: 2, ownerSessionId: 'logical-y', nodes: [], edges: [] } }); });
    expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(0); expect(changed).toHaveBeenCalled();
  } finally { window.removeEventListener(SOURCE_MARKERS_CHANGED, changed); }
});

it('finishes graph deletion when local annotation metadata is absent', async () => {
  resolveReferenceLink.mockResolvedValue(null); await render(); await contextMenu(); await menuItem('删除引用');
  expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(deleteReferenceLink).not.toHaveBeenCalled();
});

it('reports pending bubble synchronization without reviving an authoritatively revoked marker', async () => {
  deleteReferenceLink.mockRejectedValue(new Error('local offline')); await render(); await contextMenu(); await menuItem('删除引用');
  expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('引用已解除');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('气泡暂未同步');
  await refresh(); expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(0);
});

it('supports keyboard context menus and preserves loaded markers on an idle connection failure', async () => {
  await render();
  await act(async () => host.querySelector('.dsh-source-reference-dot')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="menu"]')).toBeTruthy();
  await act(async () => host.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })));
  expect(document.activeElement?.textContent).toBe('删除引用');
  await act(async () => host.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="menu"]')).toBeNull();
  managedApi.relations.mockRejectedValueOnce(new Error('temporarily offline'));
  await refresh(); expect(host.querySelectorAll('.dsh-source-reference-dot')).toHaveLength(1);
  expect(operations()).toBeGreaterThan(0);
});

