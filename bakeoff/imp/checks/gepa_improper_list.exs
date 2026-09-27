# Regression check for patch_imp.exs: GEPA must survive an improper list in a
# trajectory. Before the patch this raises FunctionClauseError in
# Enum.find_value_list/3 (the crash that killed imp-02's and imp-03's GEPA
# cells); after it, optimization completes. Scripted model, no key, ~1 s.
alias ImpBench.DeskHard
{train, val, _} = DeskHard.split()
base = DeskHard.metric()
metric = fn ex, pred -> base.(ex, pred) |> Map.put(:metadata, %{iodata: ["a" | "b"]}) end

agent =
  "question -> answer: string, work: string"
  |> Imp.signature(DeskHard.instructions())
  |> Imp.react(DeskHard.tools(), lm: ImpBench.Scripted.lm(), max_iters: 4)

gepa = Imp.Optimizer.GEPA.new(metric, reflection_lm: ImpBench.Scripted.lm(), max_metric_calls: 30)
Imp.optimize!(agent, gepa, DeskHard.examples(train), DeskHard.examples(val))
IO.puts("ok: GEPA survives an improper list in a trajectory")
