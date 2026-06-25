import { useEffect, useState } from "react";
import { DataExplorer } from "../ui/screens/DataExplorer";
import { ModelBench } from "../ui/screens/ModelBench";
import { RunScreen } from "../ui/screens/RunScreen";
import { Results } from "../ui/screens/Results";
import { Compare } from "../ui/screens/Compare";
import { useStore } from "./store";

const TABS = [
  { id: "data", label: "Data explorer" },
  { id: "model", label: "Model bench" },
  { id: "run", label: "Run" },
  { id: "results", label: "Results" },
  { id: "compare", label: "Experiment log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function useHashTab(): [TabId, (t: TabId) => void] {
  const read = (): TabId => {
    const h = window.location.hash.replace(/^#/, "");
    return (TABS.find((t) => t.id === h)?.id ?? "data") as TabId;
  };
  const [tab, setTab] = useState<TabId>(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (t: TabId) => {
    window.location.hash = t;
    setTab(t);
  };
  return [tab, go];
}

export function App() {
  const [tab, go] = useHashTab();
  const { run, runs } = useStore();

  return (
    <div className="app">
      <header className="top">
        <h1>fin · speculative-feedback playground</h1>
        <span className="sub">prediction-market ↔ asset feedback · contract-first research sandbox</span>
        <span className="spacer" />
        <a href="/pm" className="small">/pm finance tools →</a>
      </header>

      <div className="paper-banner">
        Paper / research only. No live trading, no order routing, no financial advice. Everything
        here runs on synthetic data with a known, planted ground truth.
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => go(t.id)}
          >
            {t.label}
            {t.id === "compare" && runs.length > 0 ? ` (${runs.length})` : ""}
          </button>
        ))}
      </nav>

      {tab === "data" && <DataExplorer onRun={() => go("run")} />}
      {tab === "model" && <ModelBench onRun={() => go("run")} />}
      {tab === "run" && <RunScreen onDone={() => go("results")} />}
      {tab === "results" && <Results run={run} onGoRun={() => go("run")} />}
      {tab === "compare" && <Compare onOpen={() => go("results")} />}
    </div>
  );
}
