// @vitest-environment jsdom
// 贴纸面板的单元级合同：它在当前会话自己的工作区直接开一个新会话，不放工作区选择器，
// 也绝不接触任何 maintenance 入口。真正的交互与绑定落盘由
// `src/maintenance/session-sticker-flow.test.mjs` 用浏览器端到端覆盖。
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionStickerPanel } from '../src/maintenance/SessionStickerPanel.tsx';
import { managedApi, parentRequest } from '../src/maintenance/client';

vi.mock('../src/maintenance/client', () => ({ managedApi: { createSticker: vi.fn() }, parentRequest: vi.fn() }));

let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
const onClose = vi.fn();
const capture = { sourceSessionId: 'source-native', anchorId: 'completed-reply', messageId: 'completed-reply', selectedText: '引用选区', role: 'assistant' as const, occurrence: 1 };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(managedApi.createSticker).mockResolvedValue({ logicalSessionId: 'new-logical', nativeSessionId: 'new-native', title: '新会话', boundSourceSessionId: 'source-native', graphObjectId: 'graph-new', sourceVersionId: 'v3' });
  vi.mocked(parentRequest).mockResolvedValue({ referenceId: 'ref' } as never);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

async function render(overrides: Partial<Parameters<typeof SessionStickerPanel>[0]> = {}) {
  const props = { capture, sourceSessionId: 'source-native', currentSessionId: 'current-native', workspaceId: 'workspace', onClose, ...overrides };
  await act(async () => root.render(<SessionStickerPanel {...props} />));
}
async function click(label: string) {
  await act(async () => { const button = [...host.querySelectorAll('button')].find(candidate => (candidate.getAttribute('aria-label') ?? candidate.textContent) === label); expect(button).toBeTruthy(); button!.click(); });
}

it('offers no workspace picker and creates in the given workspace only when asked', async () => {
  await render();
  expect(host.textContent).toContain('会话贴纸');
  expect(host.textContent).not.toContain('选择新会话所在工作区');
  expect(managedApi.createSticker).not.toHaveBeenCalled();
  await click('在当前工作区新建会话');
  expect(managedApi.createSticker).toHaveBeenCalledWith({ sourceSessionId: 'source-native', currentSessionId: 'current-native', workspaceId: 'workspace', operationId: expect.any(String) });
});

it('stages the fixed upstream into the new session and then enters it, never sending', async () => {
  await render(); await click('在当前工作区新建会话');
  expect(vi.mocked(parentRequest).mock.calls).toEqual([
    ['stage-reference', { targetSessionId: 'new-native', capture: { ...capture, expectedSourceVersionId: 'v3' }, operationId: expect.any(String) }],
    ['open-session', { nativeSessionId: 'new-native' }],
  ]);
  const operations = vi.mocked(parentRequest).mock.calls.map(([operation]) => operation);
  expect(operations).not.toContain('add-reference');
  expect(onClose).toHaveBeenCalled();
});

it('reuses the same session and reference identity when the first attempt fails', async () => {
  vi.mocked(parentRequest).mockRejectedValueOnce(new Error('引用暂不可用'));
  await render(); await click('在当前工作区新建会话');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('引用暂不可用');
  expect(onClose).not.toHaveBeenCalled();
  await click('在当前工作区新建会话');
  expect(managedApi.createSticker).toHaveBeenCalledTimes(1);
  const staged = vi.mocked(parentRequest).mock.calls.filter(([operation]) => operation === 'stage-reference');
  expect(new Set(staged.map(([, input]) => (input as { operationId: string }).operationId)).size).toBe(1);
  expect(onClose).toHaveBeenCalled();
});

it('never creates a session without a workspace or a resolved current session', async () => {
  await render({ workspaceId: undefined }); await click('在当前工作区新建会话');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('没有可用工作区');
  expect(managedApi.createSticker).not.toHaveBeenCalled();
  await render({ currentSessionId: undefined }); await click('在当前工作区新建会话');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('当前会话身份');
  expect(managedApi.createSticker).not.toHaveBeenCalled();
});

it('rejects an invalid selection before touching the host', async () => {
  await render({ capture: { ...capture, role: 'user' as never } }); await click('在当前工作区新建会话');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('重新选择');
  expect(managedApi.createSticker).not.toHaveBeenCalled();
  await render({ capture: { ...capture, selectedText: '' } }); await click('在当前工作区新建会话');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('重新选择');
  await render({ capture: { ...capture, selectedText: 'x'.repeat(4001) } }); await click('在当前工作区新建会话');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('重新选择');
  expect(managedApi.createSticker).not.toHaveBeenCalled();
});
