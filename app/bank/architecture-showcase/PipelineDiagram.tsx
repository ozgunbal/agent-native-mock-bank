export type PipelineStage = "model" | "input" | "parse" | "guardrail" | "execute";

const STAGES: { key: PipelineStage; label: string; detail: string }[] = [
  { key: "model", label: "On-device LLM", detail: "WebLLM / WebGPU, loaded once, stays in the browser" },
  { key: "input", label: "User message", detail: "Raw text — never reaches the guardrail directly" },
  { key: "parse", label: "Intent parser", detail: "LLM completion → JSON extraction → zod validation" },
  { key: "guardrail", label: "Guardrail", detail: "Deterministic policy rules, no LLM call" },
  { key: "execute", label: "DOM adapter", detail: "Real click/input events on the actual UI" },
];

/**
 * Deliberately simple boxes-and-arrows, not a canvas/SVG diagram library —
 * this needs to be legible at a glance to a developer audience mid-demo, and
 * the "live" part is which stage is lit, not the diagram's visual complexity.
 */
export function PipelineDiagram({ activeStage }: { activeStage: PipelineStage }) {
  return (
    <div className="pipeline-diagram">
      {STAGES.map((stage, i) => (
        <div className="pipeline-stage-wrap" key={stage.key}>
          <div className={`pipeline-stage${stage.key === activeStage ? " active" : ""}`}>
            <div className="pipeline-stage-label">{stage.label}</div>
            <div className="pipeline-stage-detail">{stage.detail}</div>
          </div>
          {i < STAGES.length - 1 ? <div className="pipeline-arrow">→</div> : null}
        </div>
      ))}
    </div>
  );
}
