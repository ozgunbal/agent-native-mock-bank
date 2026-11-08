import type { AgentMessage } from "./useAgentSession";

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: AgentMessage;
  onConfirm: (m: AgentMessage) => void;
  onCancel: (m: AgentMessage) => void;
}) {
  if (!message.pendingConfirm) return null;
  return (
    <div className="confirm-card" role="alertdialog" data-testid={`confirm-dialog-${message.id}`}>
      <div style={{ fontSize: 12.5 }}>{message.text}</div>
      <div className="confirm-actions">
        <button className="confirm-btn confirm" onClick={() => onConfirm(message)} data-agent-confirm="true">
          Confirm
        </button>
        <button className="confirm-btn cancel" onClick={() => onCancel(message)} data-agent-cancel="true">
          Cancel
        </button>
      </div>
    </div>
  );
}
