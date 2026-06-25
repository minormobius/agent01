import { useStore } from "../../app/store";
import { getModel } from "../../models/registry";
import { ParamForm } from "../components";

export function ModelBench({ onRun }: { onRun: () => void }) {
  const { models, modelName, setModelName, modelConfig, setModelConfig, dataset } = useStore();
  const model = getModel(modelName)!;

  return (
    <>
      <div className="card">
        <h2>Model</h2>
        <p className="desc">
          Pick a model from the registry and edit its config. Every model maps an InputBundle to an
          OutputBundle and may not reach outside the bundle for data — no globals, no peeking.
        </p>
        <div className="row">
          {models.map((m) => (
            <button
              key={m.info.name}
              className={`btn small ${m.info.name === modelName ? "" : "ghost"}`}
              onClick={() => setModelName(m.info.name)}
              title={m.info.blurb}
            >
              {m.info.title}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          {model.info.blurb}
        </p>
      </div>

      <div className="card">
        <h2>Config · {model.info.title}</h2>
        {model.info.configSchema.length === 0 ? (
          <p className="muted">This model has no tunable parameters.</p>
        ) : (
          <ParamForm schema={model.info.configSchema} config={modelConfig} onChange={setModelConfig} />
        )}
      </div>

      <div className="card">
        <h2>Attached dataset</h2>
        <p className="desc">{dataset.label}</p>
        <div className="row">
          <span className="chip mono">{dataset.steps} steps</span>
          <span className="chip mono">horizon {dataset.horizon}</span>
          <span className="chip mono">strike {dataset.strike}</span>
          <span className="chip mono">{dataset.regimeNames.length} regimes</span>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onRun}>
            Run walk-forward →
          </button>
        </div>
      </div>
    </>
  );
}
