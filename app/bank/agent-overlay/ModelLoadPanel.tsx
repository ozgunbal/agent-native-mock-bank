import type { EngineLoadProgress } from "@web-ai/core/web";
import type { ModelStatus } from "./useAgentSession";

export function ModelLoadPanel({
  status,
  progress,
  onRetry,
}: {
  status: ModelStatus;
  progress: EngineLoadProgress | null;
  onRetry: () => void;
}) {
  const percent = Math.round((progress?.progress ?? 0) * 100);

  return (
    <div className="model-load-panel" data-testid="model-load-panel">
      {status === "error" ? (
        <>
          <div className="model-load-title">Model failed to load</div>
          <div className="model-load-text">
            {progress?.text || "Something went wrong loading the on-device model."}
          </div>
          <button className="retry-btn" onClick={onRetry}>
            ↻ Clear cache &amp; retry
          </button>
        </>
      ) : (
        <>
          <div className="model-load-title">
            {status === "idle" ? "Preparing on-device model…" : "Downloading on-device model…"}
          </div>
          <div className="model-load-bar-track">
            <div className="model-load-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="model-load-meta">
            <span>{percent}%</span>
            {progress?.timeElapsedSeconds ? <span>{progress.timeElapsedSeconds.toFixed(1)}s elapsed</span> : null}
          </div>
          {progress?.text ? <div className="model-load-text">{progress.text}</div> : null}
          <div className="model-load-note">Chat is disabled until the model finishes loading — this only happens once per browser (cached afterward).</div>
        </>
      )}
    </div>
  );
}
