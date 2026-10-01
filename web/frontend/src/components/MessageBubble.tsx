import { useEffect, useMemo, useState } from 'react';
import type { ChatMessage } from '../lib/store';
import { mediaUrl, mediaPreviewUrl } from '../lib/api';
import { renderMarkdown } from '../lib/sanitize';
import { linkifyOutputs, externalizeMediaLinks, previewLocalImages, groupChatImages } from '../lib/linkifyOutputs';
import { IconCopy, IconCheck, IconRetry } from './icons';

export interface BubbleActions {
  onCopy: () => void;
  onRetry?: () => void;    // 仅最后一轮可用（append-only：不改写历史）
  canModify: boolean;      // 流式中禁用 retry
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  thinking?: string;
  activity?: string;
  stillWorking?: string;   // 防呆心跳提示（未卡住）；仅流式时的独立提示，不替代思考/活动
  actions?: BubbleActions;
}

function ActionBar({ actions }: { actions: BubbleActions }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    actions.onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="msg-actions">
      <button className="msg-action" onClick={copy} title="复制">
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}<span>{copied ? '已复制' : '复制'}</span>
      </button>
      {actions.onRetry && actions.canModify && (
        <button className="msg-action" onClick={actions.onRetry} title="重新生成"><IconRetry size={14} /><span>重试</span></button>
      )}
    </div>
  );
}

export default function MessageBubble({ message, isStreaming, thinking, activity, stillWorking, actions }: MessageBubbleProps) {
  const [stageSeconds, setStageSeconds] = useState(0);
  useEffect(() => {
    setStageSeconds(0);
    if (!isStreaming) return;
    const started = Date.now();
    const timer = setInterval(() => setStageSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isStreaming, activity]);

  const html = useMemo(() => {
    if (message.role === 'user') return '';
    // 助手正文里裸露的产物路径先转成前端可用链接（文件直开、图片内联、目录跳内容库）。
    // 流式中不转换：路径/围栏代码块可能被 SSE token 从中间切开（扩展名没收全会被
    // 误判成目录、未闭合的 ``` 会误伤命令示例里的 outputs/），转换只在流式结束后
    // 对完整正文做一次，避免闪烁成错误链接再跳变。
    const body = isStreaming ? message.content : linkifyOutputs(message.content);
    return groupChatImages(previewLocalImages(externalizeMediaLinks(renderMarkdown(body))));
  }, [message.content, message.role, isStreaming]);

  // ---- 用户消息 ----
  if (message.role === 'user') {
    const attachments = message.attachments || [];
    if (!message.content.trim() && !attachments.length) return null;
    return (
      <div className="message-row user">
        <div className="msg-col user">
          <div className="message-bubble user">
            {attachments.length > 0 && <div className="message-attachments">
              {attachments.map((file) => (
                <a key={file.id || file.path} href={mediaUrl(file.path)} target="_blank" rel="noopener noreferrer" className="message-attachment">
                  {/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name) && <img src={mediaPreviewUrl(file.path)} alt={file.name} loading="lazy" />}
                  <span>{file.name}</span>
                </a>
              ))}
            </div>}
            {message.content}
          </div>
          {actions && <ActionBar actions={actions} />}
        </div>
      </div>
    );
  }

  // ---- 助手消息 ----
  // 思考 / 活动：流式时用实时值；结束后用消息里持久化的值 —— 一直保留，不隐藏
  const effThinking = isStreaming ? (thinking || '') : (message.thinking || '');
  const liveSteps = isStreaming ? (activity || '').split('\n').filter(Boolean) : [];
  const liveActivity = liveSteps.at(-1) || '';
  const liveHint = isStreaming ? (stillWorking || '') : '';   // 防呆「未卡住」提示，附着显示、不顶掉真实状态
  const doneSteps = isStreaming ? liveSteps.join('\n') : (message.activity || '');

  const livePanel = (effThinking || liveActivity || liveHint || doneSteps) ? (
    <div className="live-panel">
      {liveActivity ? (
        <div className="live-activity">
          <span className="live-pulse" />{liveActivity}
          {stageSeconds > 0 && <span className="live-still"> · 当前步骤 {stageSeconds} 秒</span>}
          {liveHint && <span className="live-still"> · {liveHint}</span>}
        </div>
      ) : liveHint ? (
        <div className="live-activity"><span className="live-pulse" />{liveHint}</div>
      ) : null}
      {doneSteps && (
        <details className="thinking-block">
          <summary>执行记录（{doneSteps.split('\n').length} 条）</summary>
          <div className="thinking-text">{doneSteps}</div>
        </details>
      )}
      {effThinking && (
        <details className="thinking-block" open={isStreaming && !message.content}>
          <summary>💭 思考过程</summary>
          <div className="thinking-text">{effThinking}</div>
        </details>
      )}
    </div>
  ) : null;

  // 等待回复中（还没有正文、思考、活动）
  if (isStreaming && !message.content && !effThinking && !liveActivity && !liveHint) {
    return (
      <div className="message-row assistant">
        <div className="message-bubble assistant">
          <div className="typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-row assistant">
      <div className="msg-col assistant">
        <div className="message-bubble assistant">
          {livePanel}
          {message.content && <div dangerouslySetInnerHTML={{ __html: html }} />}
          {isStreaming && <span className="streaming-cursor" />}
        </div>
        {actions && !isStreaming && <ActionBar actions={actions} />}
      </div>
    </div>
  );
}
