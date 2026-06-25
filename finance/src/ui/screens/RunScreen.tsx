import { useState } from "react";
import { useStore } from "../../app/store";
import { getModel } from "../../models/registry";
import { runBacktest, type SplitConfig } from "../../harness/walkforward";

export function RunScreen({ onDone }: { onDone: () => void }) {
  const { dataset, modelName, modelConfig, split, setSplit, addRun, setRun } = useStore();
  const model = getModel(modelName)!;
  const [running, setRunning] = useState(false);

  const patch = (p: Partial<SplitConfig>) => setSplit({ ...split, ...p });

  function go() {
    setRunning(true);
    // defer so "running" paints before the (fast, synchronous) backtest runs
    setTimeout(() => {
      const rec = runBacktest({ dataset, model, config: modelConfig, split });
      setRun(rec);
      addRun(rec);
      setRunning(false);
      onDone();
    }, 30);
  }

  return (
    <>
      <div className="card">
        <h2>Walk-forward run</h2>
        <p className="desc">
          Expanding (or rolling) walk-forward with purged + embargoed splits, so training label
          windows can never overlap the test point. The look-ahead guarantee is re-asserted at every
          step. No metric below is ever optimized in-sample.
        </p>
        <div className="grid cols-3">
          <div className="stat">
            <div className="k">model</div>
            <div className="v" style={{ fontSize: 15 }}>{model.info.title}</div>
          </div>
          <div className="stat">
            <div className="k">dataset</div>
            <div className="v" style={{ fontSize: 15 }}>{dataset.steps} steps</div>
            <div className="sub">{dataset.label}</div>
          </div>
          <div className="stat">
            <div className="k">linked event</div>
            <div className="v" style={{ fontSize: 15 }}>cum&gt;{dataset.strike}</div>
            <div className="sub">horizon {dataset.horizon}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Split</h2>
        <div className="grid cols-3">
          <label className="field">
            <span>warmup</span>
            <input type="number" min={5} max={200} value={split.warmup} onChange={(e) => patch({ warmup: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>embargo</span>
            <input type="number" min={0} max={50} value={split.embargo} onChange={(e) => patch({ embargo: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>refit every</span>
            <input type="number" min={1} max={200} value={split.refitEvery} onChange={(e) => patch({ refitEvery: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>scheme</span>
            <select value={split.scheme} onChange={(e) => patch({ scheme: e.target.value as SplitConfig["scheme"] })}>
              <option value="expanding">expanding</option>
              <option value="rolling">rolling</option>
            </select>
          </label>
          <label className="field">
            <span>train window (rolling)</span>
            <input type="number" min={20} max={800} value={split.trainWindow} onChange={(e) => patch({ trainWindow: Number(e.target.value) })} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={go} disabled={running}>
            {running ? "running…" : "Launch backtest"}
          </button>
        </div>
      </div>
    </>
  );
}
