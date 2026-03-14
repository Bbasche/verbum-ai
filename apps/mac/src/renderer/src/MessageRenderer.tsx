import type { AppMessage, MessageBlock } from "./message-schema";

function renderBlock(block: MessageBlock, index: number) {
  if (block.type === "markdown") {
    return (
      <p className="message-copy" key={`markdown-${index}`}>
        {block.text}
      </p>
    );
  }

  if (block.type === "code") {
    return (
      <div className="message-code" key={`code-${index}`}>
        <div className="message-code-head">
          <span>{block.language}</span>
          {block.filename ? <span>{block.filename}</span> : null}
        </div>
        <pre>{block.code}</pre>
      </div>
    );
  }

  if (block.type === "command") {
    return (
      <div className="message-command" key={`command-${index}`}>
        <strong>$ {block.command}</strong>
        <pre>{block.output}</pre>
      </div>
    );
  }

  if (block.type === "tool") {
    return (
      <div className="message-tool" key={`tool-${index}`}>
        <div className="message-tool-head">
          <strong>{block.name}</strong>
          <span>{block.status}</span>
        </div>
        <p>{block.input}</p>
        <pre>{block.output}</pre>
      </div>
    );
  }

  if (block.type === "attachment-list") {
    return (
      <div className="message-attachments" key={`attachments-${index}`}>
        {block.items.map((item) => (
          <div className="message-attachment-item" key={item.path}>
            <strong>{item.name}</strong>
            <span>
              {item.kind} · {item.mimeType}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="message-status-list" key={`status-${index}`}>
      {block.items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function MessageRenderer({ message }: { message: AppMessage }) {
  return (
    <article className={`message-card message-card-${message.role}`}>
      <header className="message-card-head">
        <div>
          <strong>{message.title}</strong>
          <span>
            {message.sourceLabel} · {message.conversationTitle} · {message.timestamp}
          </span>
        </div>
        <b>{message.sourceKind}</b>
      </header>
      <div className="message-card-body">{message.blocks.map(renderBlock)}</div>
    </article>
  );
}
