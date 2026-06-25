import type { ParamSpec, ModelConfig } from "../models/types";

export function Stat({
  k,
  v,
  sub,
  tone,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v ${tone ?? ""}`}>{v}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function ParamForm({
  schema,
  config,
  onChange,
}: {
  schema: ParamSpec[];
  config: ModelConfig;
  onChange: (c: ModelConfig) => void;
}) {
  const set = (key: string, value: number | boolean | string) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="grid cols-2">
      {schema.map((p) => (
        <label className="field" key={p.key}>
          <span>{p.label}</span>
          {p.type === "number" && (
            <input
              type="number"
              value={Number(config[p.key])}
              min={p.min}
              max={p.max}
              step={p.step}
              onChange={(e) => set(p.key, Number(e.target.value))}
            />
          )}
          {p.type === "boolean" && (
            <input
              type="checkbox"
              checked={Boolean(config[p.key])}
              onChange={(e) => set(p.key, e.target.checked)}
            />
          )}
          {p.type === "select" && (
            <select value={String(config[p.key])} onChange={(e) => set(p.key, e.target.value)}>
              {p.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {p.help && <span className="help">{p.help}</span>}
        </label>
      ))}
    </div>
  );
}
