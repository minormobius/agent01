defmodule ImpBench.JevTasks do
  @moduledoc """
  The classifier tasks (`trec`, `era`, `route`) answered by Jev instead of an
  LLM — the arms are described in `ImpBench.Jev`. Same held-out items and the
  same splits as the LLM cells, so the numbers sit side by side.

  Two inputs come from earlier runs, read from the published evidence under
  `imp/runs/` (committed, so CI has them):

  - `jev_learned` — the instruction GEPA wrote for an LLM
    (`IMP_BENCH_JEV_LEARNED_FROM`, default `kimi3` for trec, `ds4-flash` for era).
  - `cascade` — escalations go to that LLM's saved GEPA program
    (`IMP_BENCH_JEV_ESCALATE`, default `ds4-flash`), rebound to a live model.

  An arm whose input is missing (no such run imported yet) is skipped and says so.
  """

  alias ImpBench.{Jev, Trec, Era}

  @runs "../../imp/runs"

  def run("trec", out) do
    %{train: train, selection: selection, held_out: held_out} = Trec.rows()
    item = fn r -> %{id: r.id, state: %{question: r.text}, label: r.route} end

    spec = %{
      task: "trec",
      instructions:
        "Route the question to exactly one opaque code. Return only the required structured route.",
      criteria: %{"K11" => "K11", "K47" => "K47"},
      test: Enum.map(held_out, item),
      train: Enum.map(train, item),
      selection: Enum.map(selection, item),
      feedback: fn it, r ->
        m = %{
          "K11" => "question asking for a description, definition, reason, or manner",
          "K47" =>
            "question asking for an entity such as an animal, product, substance, or other thing"
        }

        "Expected #{it.label} for #{m[it.label]}; #{r[:choice]} represents #{m[to_string(r[:choice])] || "nothing"}."
      end,
      learned:
        learned_instruction(
          "imp-04",
          "trec",
          System.get_env("IMP_BENCH_JEV_LEARNED_FROM") || "kimi3"
        ),
      escalate: escalation("imp-04", "trec.gepa", fn it -> %{text: it.state.question} end, :route)
    }

    run_arms(spec, out)
  end

  def run("era", out) do
    %{train: train, selection: selection, test: test} = Era.split()
    item = fn r -> %{id: r.rkey, state: %{post: r.text}, label: r.year} end
    run_id = latest_run_with("era")

    spec = %{
      task: "era",
      instructions: "A post by one Bluesky user. Guess the year they wrote it.",
      criteria: Map.new(Era.years(), &{&1, &1}),
      test: Enum.map(test, item),
      train: Enum.map(train, item),
      selection: Enum.map(selection, item),
      feedback: fn it, r -> "This post was written in #{it.label}; you guessed #{r[:choice]}." end,
      learned:
        run_id &&
          learned_instruction(
            run_id,
            "era",
            System.get_env("IMP_BENCH_JEV_LEARNED_FROM") || "ds4-flash"
          ),
      escalate:
        run_id && escalation(run_id, "era.gepa", fn it -> %{post: it.state.post} end, :year)
    }

    run_arms(spec, out)
  end

  def run("route", _out) do
    data =
      Application.app_dir(:imp, "priv/tutorial/support_tickets.json")
      |> File.read!()
      |> Jason.decode!()

    test =
      Enum.map(Enum.with_index(data["test"]), fn {r, i} ->
        %{id: "t#{i}", state: %{ticket: r["ticket"]}, label: r["team"]}
      end)

    instructions =
      "Route a support ticket to the team that owns it.\n" <> Enum.join(data["conventions"], "\n")

    results = Jev.classify(test, instructions, Map.new(~w(atlas harbor beacon quill), &{&1, &1}))
    %{n_test: length(test), arms: %{"jev_bare" => Jev.score(results)}}
  end

  def run(task, _out), do: %{error: "no Jev variant of #{task}", arms: %{}, n_test: 0}

  # ─── the four arms ──────────────────────────────────────────────────

  defp run_arms(spec, out) do
    arms = %{}
    rows = %{}

    bare = Jev.classify(spec.test, spec.instructions, spec.criteria)
    arms = Map.put(arms, "jev_bare", Jev.score(bare))
    rows = Map.put(rows, "jev_bare", slim(bare))

    {arms, rows} =
      case spec.learned do
        nil ->
          {Map.put(arms, "jev_learned", %{
             skipped: "no GEPA instruction imported for #{spec.task} yet"
           }), rows}

        {from, text} ->
          r = Jev.classify(spec.test, text, spec.criteria)

          {Map.put(arms, "jev_learned", Jev.score(r) |> Map.put(:from, from)),
           Map.put(rows, "jev_learned", slim(r))}
      end

    {optimized, arms, rows} =
      case reflection() do
        nil ->
          {nil, Map.put(arms, "jev_optimized", %{skipped: "no reflection model"}), rows}

        {rkey, rlm, calls} ->
          IO.puts("   Optimize Anything on Jev: reflection #{rkey}, max_metric_calls #{calls}")

          try do
            {best, secs} =
              timed(fn ->
                Jev.optimize(
                  Jev.pack(spec.instructions, spec.criteria),
                  spec.train,
                  spec.selection,
                  spec.feedback,
                  rlm,
                  calls
                )
              end)

            {ins, crit} = Jev.unpack(best)
            r = Jev.classify(spec.test, ins, crit)

            File.write!(
              Path.join(out, "#{spec.task}.jev_optimized.json"),
              Jason.encode!(best, pretty: true)
            )

            {{ins, crit, r},
             Map.put(
               arms,
               "jev_optimized",
               Jev.score(r)
               |> Map.merge(%{optimize_seconds: secs, reflection: rkey, program: best})
             ), Map.put(rows, "jev_optimized", slim(r))}
          rescue
            e ->
              msg = Exception.message(e) |> String.slice(0, 1500)
              IO.puts("   Optimize Anything failed: " <> msg)
              {nil, Map.put(arms, "jev_optimized", %{error: msg}), rows}
          end
      end

    arms =
      case {optimized || bare_as_program(spec, bare), spec.escalate} do
        {_, nil} ->
          Map.put(arms, "cascade", %{skipped: "no saved GEPA program to escalate to"})

        {{_ins, _crit, results}, {ekey, program, to_input, field}} ->
          cascade(results, program, to_input, field)
          |> Map.put(:escalate_to, ekey)
          |> then(&Map.put(arms, "cascade", &1))
      end

    %{n_test: length(spec.test), arms: arms, rows: rows, gate: Jev.gate()}
  end

  defp bare_as_program(spec, bare), do: {spec.instructions, spec.criteria, bare}

  # Accept Jev at confidence >= gate; send the rest to the LLM's GEPA program.
  defp cascade(results, program, to_input, field) do
    {keep, send} =
      Enum.split_with(results, &((&1[:confidence] || 0) >= Jev.gate() and &1[:choice] != nil))

    escalated =
      send
      |> Task.async_stream(
        fn it ->
          case Imp.call(program, to_input.(it)) do
            {:ok, pred} -> Map.put(it, :llm, to_string(Imp.get(pred, field)))
            {:error, _} -> Map.put(it, :llm, nil)
          end
        end,
        max_concurrency: 4,
        timeout: 600_000,
        on_timeout: :kill_task
      )
      |> Enum.zip(send)
      |> Enum.map(fn
        {{:ok, r}, _} -> r
        {{:exit, _}, it} -> Map.put(it, :llm, nil)
      end)

    right =
      Enum.count(keep, &(to_string(&1.choice) == to_string(&1.label))) +
        Enum.count(escalated, &(&1.llm == to_string(&1.label)))

    n = max(length(results), 1)

    %{
      score: right / n,
      kept_by_jev: length(keep),
      kept_accuracy:
        if(keep == [],
          do: nil,
          else: Enum.count(keep, &(to_string(&1.choice) == to_string(&1.label))) / length(keep)
        ),
      escalated: length(escalated),
      escalated_accuracy:
        if(escalated == [],
          do: nil,
          else: Enum.count(escalated, &(&1.llm == to_string(&1.label))) / length(escalated)
        ),
      llm_calls_saved: length(keep)
    }
  end

  # ─── inputs from earlier runs ───────────────────────────────────────

  defp results_of(run_id) do
    case File.read(Path.join([@runs, run_id, "results.json"])) do
      {:ok, b} -> Jason.decode!(b)
      _ -> nil
    end
  end

  defp learned_instruction(run_id, task, model) do
    with %{} = r <- results_of(run_id),
         %{} = cell <- Enum.find(r["cells"], &(&1["model"] == model)),
         changed when is_map(changed) and changed != %{} <-
           get_in(cell, ["tasks", task, "gepa", "changed"]),
         %{"after" => text} <- changed |> Map.values() |> hd() do
      {"#{run_id}/#{model}", text}
    else
      _ -> nil
    end
  end

  defp escalation(run_id, name, to_input, field) do
    ekey = System.get_env("IMP_BENCH_JEV_ESCALATE") || "ds4-flash"
    path = Path.join([@runs, run_id, "#{ekey}.#{name}.program.json"])

    # the program is ekey's; the live model it runs on can be overridden (tests)
    lm_key = System.get_env("IMP_BENCH_JEV_ESCALATE_LM") || ekey

    with true <- File.exists?(path),
         {:ok, lm, _} <- ImpBench.lm_for(lm_key) do
      {"#{run_id}/#{ekey}", path |> Imp.Saving.read!() |> Imp.with_lm(lm), to_input, field}
    else
      _ -> nil
    end
  end

  defp latest_run_with(task) do
    case File.ls(@runs) do
      {:ok, ids} ->
        ids
        |> Enum.filter(&String.starts_with?(&1, "imp-"))
        |> Enum.sort(:desc)
        |> Enum.find(fn id ->
          (results_of(id) || %{"cells" => []})["cells"]
          |> Enum.any?(&get_in(&1, ["tasks", task, "gepa", "changed"]))
        end)

      _ ->
        nil
    end
  end

  defp reflection do
    rkey = System.get_env("IMP_BENCH_REFLECTION")

    if rkey in [nil, ""] do
      nil
    else
      calls =
        case System.get_env("IMP_BENCH_GEPA_CALLS") do
          v when v in [nil, ""] -> 150
          v -> String.to_integer(v)
        end

      case ImpBench.lm_for(rkey) do
        {:ok, lm, _} -> {rkey, lm, calls}
        _ -> nil
      end
    end
  end

  defp slim(results),
    do: Enum.map(results, &Map.take(&1, [:id, :label, :choice, :confidence, :error]))

  defp timed(fun) do
    t = System.monotonic_time(:millisecond)
    r = fun.()
    {r, div(System.monotonic_time(:millisecond) - t, 1000)}
  end
end
