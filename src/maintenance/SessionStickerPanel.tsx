import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CircleAlert, Loader2, Plus, StickyNote, X } from 'lucide-react';
import { managedApi, parentRequest, type Capture, type StickerIdentity } from './client';
import './session-stickers.css';

/**
 * 会话贴纸 == 一个新会话 + 一条单向拓扑绑定边。没有贴纸对象，也没有命名空间。
 *
 * 面板只负责一件事：把当前选段作为固定来源，在当前工作区新开一个真实会话，
 * 并在新会话的图里记下「被选段会话 → 新会话」的上游绑定。引用由 Core 放进
 * 新会话输入框的待发送栏，**不自动提交** —— 绑定只表达拓扑，不代表内容授权。
 */
type Props = {
  capture?: Capture;
  /** 被选段所在会话（本次绑定的来源）。 */
  sourceSessionId: string;
  /** 当前会话（新会话图的主干归属在这里落一次）。 */
  currentSessionId?: string;
  /** 新会话所在工作区；与当前会话同一个，不需要用户再选。 */
  workspaceId?: string;
  onClose(): void;
};

export function SessionStickerPanel(props: Props) {
  const setOpen = (value: boolean) => { if (!value) props.onClose(); };
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef(crypto.randomUUID());
  const active = useRef(false);
  const alive = useRef(true);
  /** 本次操作已建立的新会话与已放入的引用：重试只能沿用，不能再开一个会话。 */
  const created = useRef<{ operationId: string; identity: StickerIdentity; referenceId: string | null } | null>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  const run = async (work: () => Promise<void>) => {
    if (active.current) return;
    active.current = true; setBusy(true); setError('');
    try { await work(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { active.current = false; if (alive.current) setBusy(false); }
  };

  const create = async () => {
    const source = props.capture;
    if (!source) throw new Error('请先在来源会话里选择一段已完成的 AI 回复');
    if (
      typeof source.selectedText !== 'string' || source.selectedText.length === 0 || source.selectedText.length > 4000 ||
      typeof source.sourceSessionId !== 'string' || !source.sourceSessionId ||
      source.role !== 'assistant' ||
      !Number.isSafeInteger(source.occurrence) || source.occurrence < 0
    ) throw new Error('选文或来源身份无效，请重新选择');
    if (!props.currentSessionId) throw new Error('当前会话身份尚未就绪，请回到主会话重试');
    if (!props.workspaceId) throw new Error('当前实例没有可用工作区，无法确定新会话归属');

    // 重试必须复用同一个新会话身份：创建走宿主的确定性 sessionId，引用走同一个
    // operationId，这样任何一次失败的重新点击都不会多开一个会话、也不会多放一条引用。
    let state = created.current;
    let identity = state?.identity;
    if (!identity) {
      identity = await managedApi.createSticker({
        sourceSessionId: source.sourceSessionId,
        currentSessionId: props.currentSessionId,
        workspaceId: props.workspaceId,
        operationId: operation.current,
      });
      state = { operationId: operation.current, identity, referenceId: null };
      created.current = state;
    }

    if (!state?.referenceId) {
      const capture: Capture = { ...source, ...(identity.sourceVersionId ? { expectedSourceVersionId: identity.sourceVersionId } : {}) };
      const staged = await parentRequest('stage-reference', { targetSessionId: identity.nativeSessionId, capture, operationId: operation.current }) as { referenceId?: string };
      if (state) state.referenceId = typeof staged?.referenceId === 'string' ? staged.referenceId : 'staged';
    }

    await parentRequest('open-session', { nativeSessionId: identity.nativeSessionId });
    setOpen(false);
  };

  return (
    <div className="dsh-knowledge-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section
        ref={panel}
        tabIndex={-1}
        className="dsh-knowledge-panel"
        role="dialog"
        aria-modal="true"
        aria-label="会话贴纸"
        aria-busy={busy}
        onKeyDown={event => {
          if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
          if (event.key !== 'Tab') return;
          const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), summary, [tabindex="0"]')].filter(element => element.checkVisibility());
          const first = targets[0], last = targets.at(-1);
          if (!first) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}
      >
        <header className="dsh-knowledge-heading">
          <div className="dsh-knowledge-heading-copy">
            <span className="dsh-knowledge-mark"><StickyNote size={20} aria-hidden="true" /></span>
            <div><h2>会话贴纸</h2><p>在当前工作区开一个新会话，把这段来源放在手边。</p></div>
          </div>
          <button className="dsh-knowledge-icon" disabled={busy} aria-label="关闭" onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="dsh-knowledge-body">
          {error && <div className="dsh-knowledge-feedback is-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>{error}</span></div>}
          <div className="dsh-knowledge-section-title"><h3>新会话的上游来源</h3></div>
          {props.capture && <blockquote className="dsh-knowledge-source">{props.capture.selectedText.slice(0, 200)}</blockquote>}
          <button className="dsh-knowledge-create" disabled={busy} aria-label="在当前工作区新建会话" onClick={() => void run(create)}>
            <span className="dsh-knowledge-create-icon"><Plus size={20} aria-hidden="true" /></span>
            <span><strong>在当前工作区新建会话</strong><small>新会话图中记为上游绑定；来源引用留在输入框中，不会自动发送</small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
          {busy && <div className="dsh-knowledge-loading" role="status"><Loader2 className="dsh-knowledge-spinner" size={16} aria-hidden="true" />正在处理…</div>}
        </div>
        <footer className="dsh-knowledge-footnote"><ArrowUpRight size={14} aria-hidden="true" /><span>绑定只表达拓扑，不代表内容授权；来源引用在发送后生效。</span></footer>
      </section>
    </div>
  );
}
