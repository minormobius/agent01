defmodule ImpBench do
  @moduledoc """
  One Imp cell: one model, the tasks named in the run config, one JSON result.

      IMP_BENCH_MODEL=ds4-flash IMP_BENCH_TASKS=route,desk mix run -e 'ImpBench.main()'

  The model comes from `bakeoff/cells.json` (its `openaiBase` and `model`), so
  an Imp cell and an agent-harness cell on the same model hit the same
  endpoint with the same id. `IMP_BENCH_MODEL=static` runs every task against a
  scripted model instead: no key, no network, no spend — the rig's own test.

  Output goes to `$BAKEOFF_OUT` (default `out/<model>`):

      cell.json    scores, per-question rows, usage, timings
      traces.md    every desk question's tool calls, arguments and results
      route.program.json  the compiled few-shot router, as Imp saves it
  """

  alias ImpBench.Desk

  @tasks ~w(route desk desk_hard)

  def main do
    model_key = System.get_env("IMP_BENCH_MODEL") || raise "IMP_BENCH_MODEL is required"
    tasks = "IMP_BENCH_TASKS" |> System.get_env("route,desk") |> String.split(",", trim: true)

    Enum.each(tasks, fn t ->
      t in @tasks || raise "unknown task #{t}; known: #{Enum.join(@tasks, ", ")}"
    end)

    out = System.get_env("BAKEOFF_OUT") || Path.join("out", model_key)
    File.mkdir_p!(out)

    case lm_for(model_key) do
      {:skip, reason} ->
        IO.puts("skipping #{model_key}: #{reason}")

        write_json(Path.join(out, "cell.json"), %{
          model: model_key,
          status: "skipped",
          reason: reason
        })

      {:ok, lm, meta} ->
        started = System.monotonic_time(:millisecond)
        probe = probe(lm)
        IO.puts("probe: " <> probe)

        results =
          for task <- tasks, into: %{} do
            IO.puts("== #{model_key} · #{task}")
            {task, run(task, lm, out)}
          end

        cell = %{
          model: model_key,
          model_id: meta.model,
          endpoint: meta.base_url,
          status: "ran",
          imp_version: to_string(Application.spec(:imp, :vsn)),
          seconds: div(System.monotonic_time(:millisecond) - started, 1000),
          probe: probe,
          tasks: results
        }

        write_json(Path.join(out, "cell.json"), cell)
        IO.puts(summary(cell))
    end
  end

  # ─── models ─────────────────────────────────────────────────────────

  def lm_for("static"), do: {:ok, ImpBench.Scripted.lm(), %{model: "scripted", base_url: nil}}

  def lm_for(key) do
    cells = Path.expand("../cells.json", File.cwd!()) |> File.read!() |> Jason.decode!()
    m = cells["models"][key] || raise "no model #{key} in bakeoff/cells.json"
    api_key = System.get_env(m["keyEnv"])

    if api_key in [nil, ""] do
      {:skip, "#{m["keyEnv"]} is not set"}
    else
      spec = %{provider: :openai, id: m["model"], model: m["model"], base_url: m["openaiBase"]}

      # bakeoff/imp/models.json may override the defaults per model; a null
      # value drops the option (a thinking model may reject `temperature`).
      overrides =
        case File.read("models.json") do
          {:ok, body} -> body |> Jason.decode!() |> Map.get(key, %{})
          _ -> %{}
        end

      opts =
        [temperature: 0.0, max_tokens: 2048]
        |> Keyword.merge(
          for {k, v} <- overrides, k != "$comment", do: {String.to_existing_atom(k), v}
        )
        |> Enum.reject(fn {_, v} -> is_nil(v) end)

      lm = Imp.req_llm(spec, [api_key: api_key, cache: false, receive_timeout: 180_000] ++ opts)

      {:ok, lm, %{model: m["model"], base_url: m["openaiBase"]}}
    end
  end

  # One plain typed call, so a model that cannot answer at all says why in the
  # log before twenty identical failures hide the reason.
  defp probe(lm) do
    program = "question -> answer" |> Imp.signature("Answer in one word.") |> Imp.predict(lm: lm)

    case Imp.call(program, %{question: "What colour is a clear daytime sky?"}) do
      {:ok, pred} -> "ok: " <> inspect(Imp.get(pred, :answer))
      {:error, reason} -> "error: " <> inspect(reason, limit: 20, printable_limit: 1200)
    end
  rescue
    e -> "raised: " <> Exception.message(e)
  end

  defp error_samples(%Imp.Evaluate.Result{errors: errors}) do
    errors |> Enum.take(3) |> Enum.map(&inspect(&1, limit: 12, printable_limit: 600))
  end

  # ─── task: route ────────────────────────────────────────────────────

  # Imp's own tutorial set (priv/tutorial, 20 train / 20 dev / 20 test tickets,
  # four teams). Zero-shot, then LabeledFewShot(k: 8) from the train split —
  # the configuration behind rows R1/R2 of Imp's research/RESULTS.md, so these
  # numbers sit next to a published gpt-5.4-mini result.
  defp run("route", lm, out) do
    data =
      Application.app_dir(:imp, "priv/tutorial/support_tickets.json")
      |> File.read!()
      |> Jason.decode!()

    to_ex = fn rows ->
      Enum.map(
        rows,
        &(Imp.example(%{ticket: &1["ticket"], team: &1["team"]}) |> Imp.with_inputs([:ticket]))
      )
    end

    {train, test} = {to_ex.(data["train"]), to_ex.(data["test"])}

    router =
      "ticket -> team: enum[atlas,harbor,beacon,quill]"
      |> Imp.signature(
        "Route a support ticket to the team that owns it.\n" <>
          Enum.join(data["conventions"], "\n")
      )
      |> Imp.predict(lm: lm)

    metric = Imp.exact_match(:team)

    {zero, t0} =
      timed(fn -> Imp.evaluate(router, test, metric, num_threads: 4, timeout: 180_000) end)

    compiled = Imp.optimize!(router, Imp.Optimizer.LabeledFewShot.new(k: 8, sample: false), train)

    {few, t1} =
      timed(fn -> Imp.evaluate(compiled, test, metric, num_threads: 4, timeout: 180_000) end)

    save_program(compiled, Path.join(out, "route.program.json"))

    %{
      n_test: length(test),
      arms: %{
        "zero_shot" => %{
          score: zero.score,
          errors: length(zero.errors),
          seconds: t0,
          error_samples: error_samples(zero)
        },
        "few_shot_k8" => %{
          score: few.score,
          errors: length(few.errors),
          seconds: t1,
          error_samples: error_samples(few)
        }
      },
      misses: misses(zero, :team),
      misses_few_shot: misses(few, :team)
    }
  end

  # ─── task: desk ─────────────────────────────────────────────────────

  # A ReAct agent over the refund desk's six tools. Scored on the 16 held-out
  # questions; the 8 train questions are reserved for an optimizer arm.
  defp run("desk", lm, out) do
    {_train, test} = Desk.split()

    agent =
      "question -> answer: string, work: string"
      |> Imp.signature(
        Desk.instructions() <> "\nIn `work`, say in one line which looked-up values you used."
      )
      |> Imp.react(Desk.tools(), lm: lm, max_iters: 12)

    {arm, rows} = run_agent(agent, test)
    File.write!(Path.join(out, "traces.md"), traces_md(rows))
    agent_result(test, %{"react" => arm}, rows)
  end

  # desk_hard: a ReAct baseline on the 18 test questions, and — when this model
  # is named in IMP_BENCH_GEPA — GEPA on the 9 train / 9 validation questions,
  # with IMP_BENCH_REFLECTION's model reading the failed runs and rewriting the
  # agent's instructions, then the optimized agent on the same 18.
  defp run("desk_hard", lm, out) do
    alias ImpBench.DeskHard
    {train, val, test} = DeskHard.split()

    agent =
      "question -> answer: string, work: string"
      |> Imp.signature(
        DeskHard.instructions() <> "\nIn `work`, say in one line which looked-up values you used."
      )
      |> Imp.react(DeskHard.tools(), lm: lm, max_iters: 16)

    {base_arm, base_rows} = run_agent(agent, test)
    File.write!(Path.join(out, "hard.traces.md"), traces_md(base_rows))
    result = agent_result(test, %{"react" => base_arm}, base_rows)

    case gepa_for(lm) do
      nil ->
        result

      {reflection_lm, reflection_key, max_calls} ->
        IO.puts("   GEPA: reflection #{reflection_key}, max_metric_calls #{max_calls}")

        # Imp's defaults give each row and each reflection 30 s. A whole
        # desk_hard agent run, or a reflection by a thinking model, can take
        # longer; imp-02's first attempt died of exactly that.
        gepa =
          Imp.Optimizer.GEPA.new(DeskHard.metric(),
            reflection_lm: reflection_lm,
            max_metric_calls: max_calls,
            num_threads: 4,
            seed: 20_260_927,
            timeout: 300_000,
            proposal_timeout: 300_000
          )

        try do
          {optimized, gepa_secs} =
            timed(fn ->
              Imp.optimize!(agent, gepa, DeskHard.examples(train), DeskHard.examples(val))
            end)

          {opt_arm, opt_rows} = run_agent(optimized, test)
          File.write!(Path.join(out, "hard.gepa.traces.md"), traces_md(opt_rows))
          save_program(optimized, Path.join(out, "hard.gepa.program.json"))

          before = Imp.ProgramParameters.values(agent)
          after_ = Imp.ProgramParameters.values(optimized)

          changed =
            for {id, v} <- after_, before[id] != v, into: %{} do
              {inspect(id), %{before: text(before[id]), after: text(v)}}
            end

          result
          |> put_in([:arms, "react_gepa"], Map.put(opt_arm, :optimize_seconds, gepa_secs))
          |> Map.put(:gepa, %{
            reflection: reflection_key,
            max_metric_calls: max_calls,
            changed: changed
          })
          |> Map.put(:rows_gepa, Enum.map(opt_rows, &Map.drop(&1, [:steps])))
        rescue
          # A failed optimization is a finding, not a reason to lose the baseline.
          e ->
            msg = Exception.message(e) |> String.slice(0, 2000)
            IO.puts("   GEPA failed: " <> msg)

            Map.put(result, :gepa, %{
              reflection: reflection_key,
              max_metric_calls: max_calls,
              error: msg
            })
        end
    end
  end

  defp gepa_for(_lm) do
    targets = "IMP_BENCH_GEPA" |> System.get_env("") |> String.split(",", trim: true)
    me = System.get_env("IMP_BENCH_MODEL")

    if me in targets do
      rkey =
        if System.get_env("IMP_BENCH_REFLECTION") in [nil, ""],
          do: me,
          else: System.get_env("IMP_BENCH_REFLECTION")

      calls =
        case System.get_env("IMP_BENCH_GEPA_CALLS") do
          v when v in [nil, ""] -> 150
          v -> String.to_integer(v)
        end

      reflection_lm =
        case lm_for(rkey) do
          {:ok, rlm, _} -> rlm
          {:skip, why} -> raise "reflection model #{rkey} unavailable: #{why}"
        end

      {reflection_lm, rkey, calls}
    end
  end

  defp text(v) when is_binary(v), do: v
  defp text(v), do: inspect(v, limit: 50, printable_limit: 4000)

  defp run_agent(agent, questions) do
    {rows, secs} =
      timed(fn ->
        questions
        |> Task.async_stream(&ask(agent, &1),
          max_concurrency: 4,
          timeout: 400_000,
          on_timeout: :kill_task
        )
        |> Enum.zip(questions)
        |> Enum.map(fn
          {{:ok, row}, _q} ->
            row

          {{:exit, reason}, q} ->
            %{
              id: q.id,
              question: q.question,
              expected: q.answer,
              got: nil,
              score: 0.0,
              error: "timeout: #{inspect(reason)}",
              steps: []
            }
        end)
      end)

    calls = rows |> Enum.flat_map(& &1.steps) |> Enum.flat_map(& &1.calls)

    arm = %{
      score: mean(Enum.map(rows, & &1.score)),
      errors: Enum.count(rows, & &1[:error]),
      seconds: secs,
      tool_calls: length(calls),
      usage: rows |> Enum.map(&(&1[:usage] || %{})) |> Enum.reduce(%{}, &sum_usage/2)
    }

    {arm, rows}
  end

  defp agent_result(test, arms, rows) do
    calls = rows |> Enum.flat_map(& &1.steps) |> Enum.flat_map(& &1.calls)

    %{
      n_test: length(test),
      arms: arms,
      tool_calls: length(calls),
      tool_calls_by_name: calls |> Enum.frequencies_by(& &1.name),
      terminations: rows |> Enum.frequencies_by(&to_string(&1[:termination] || "error")),
      usage: rows |> Enum.map(&(&1[:usage] || %{})) |> Enum.reduce(%{}, &sum_usage/2),
      rows: Enum.map(rows, &Map.drop(&1, [:steps]))
    }
  end

  defp ask(agent, q) do
    {result, usage} = Imp.Usage.track(fn -> Imp.call(agent, %{question: q.question}) end)

    case result do
      {:ok, pred} ->
        got = Imp.get(pred, :answer)

        %{
          id: q.id,
          question: q.question,
          expected: q.answer,
          got: got,
          work: Imp.get(pred, :work),
          score: Desk.score(q.answer, to_string(got || "")),
          termination: pred.metadata[:termination_reason],
          termination_cause:
            pred.metadata[:termination_cause] &&
              inspect(pred.metadata[:termination_cause], limit: 12, printable_limit: 400),
          usage: flatten_usage(usage),
          steps: steps(pred)
        }

      {:error, reason} ->
        %{
          id: q.id,
          question: q.question,
          expected: q.answer,
          got: nil,
          score: 0.0,
          error: inspect(reason, limit: 20),
          steps: []
        }
    end
  end

  # Each step of the agent's history: its thought, and each tool call with the
  # arguments the model chose and what the tool returned.
  defp steps(pred) do
    history = pred.metadata[:history]
    messages = if history, do: history.messages, else: []

    for msg <- messages do
      calls = get_in_any(msg, [:tool_calls, :tool_calls]) || []
      results = get_in_any(msg, [:tool_call_results]) |> results_by_id()

      %{
        thought: get_in_any(msg, [:next_thought]),
        calls:
          for c <- calls do
            %{
              name: to_string(field(c, :name)),
              args: field(c, :arguments),
              result: Map.get(results, field(c, :id))
            }
          end
      }
    end
  end

  defp results_by_id(nil), do: %{}

  defp results_by_id(results) do
    list =
      if is_map(results) and Map.has_key?(results, :results),
        do: results.results,
        else: List.wrap(results)

    for r <- list,
        into: %{},
        do: {field(r, :id) || field(r, :call_id), field(r, :result) || field(r, :content) || r}
  rescue
    _ -> %{}
  end

  # ─── reporting helpers ──────────────────────────────────────────────

  defp traces_md(rows) do
    body =
      for r <- Enum.sort_by(rows, & &1.id) do
        mark = if r.score == 1.0, do: "✓", else: "✗"

        steps =
          for {s, i} <- Enum.with_index(r.steps, 1), c <- s.calls do
            "    #{i}. #{c.name}(#{short(c.args)}) → #{short(c.result)}"
          end

        """
        ### #{mark} #{r.id} — #{r.question}
        expected `#{r.expected}` · got `#{r[:got]}`#{if r[:error], do: " · error: " <> r.error, else: ""}#{if r[:termination], do: " · ended: #{r.termination}", else: ""}

        #{if steps == [], do: "    (no tool calls)", else: Enum.join(steps, "\n")}
        """
      end

    "# desk traces\n\n" <> Enum.join(body, "\n")
  end

  defp summary(%{model: m, tasks: tasks}) do
    lines =
      for {task, r} <- tasks, {arm, a} <- r.arms do
        "  #{task}/#{arm}: #{fmt(a.score)} on #{r.n_test} held out (#{a.errors} errors, #{a.seconds}s)"
      end

    "#{m}\n" <> Enum.join(lines, "\n")
  end

  defp misses(%Imp.Evaluate.Result{rows: rows}, field) do
    for row <- rows, !passed?(row), into: %{} do
      ex = row[:example] || row["example"]
      pred = row[:prediction] || row["prediction"]
      {ex && Imp.Example.get(ex, :ticket), pred && safe_get(pred, field)}
    end
  rescue
    _ -> %{}
  end

  defp passed?(row), do: row[:passed?] == true

  defp safe_get(pred, field) do
    Imp.get(pred, field)
  rescue
    _ -> nil
  end

  defp save_program(program, path) do
    Imp.Saving.save!(program, path)
  rescue
    e ->
      File.write!(
        path,
        Jason.encode!(%{error: "could not save program: " <> Exception.message(e)})
      )
  end

  defp timed(fun) do
    t = System.monotonic_time(:millisecond)
    r = fun.()
    {r, div(System.monotonic_time(:millisecond) - t, 1000)}
  end

  defp mean([]), do: nil
  defp mean(xs), do: Enum.sum(xs) / length(xs)

  defp fmt(nil), do: "n/a"
  defp fmt(x) when x > 1, do: "#{Float.round(x / 100, 3)}"
  defp fmt(x), do: "#{Float.round(x * 1.0, 3)}"

  defp flatten_usage(usage) when is_map(usage) do
    usage |> Map.values() |> Enum.reduce(%{}, &sum_usage/2)
  end

  defp sum_usage(a, b) do
    keys = ~w(prompt_tokens completion_tokens total_tokens input_tokens output_tokens)a

    for k <- keys, into: %{} do
      {k, num(field(a, k)) + num(field(b, k))}
    end
    |> Map.reject(fn {_, v} -> v == 0 end)
  end

  defp num(n) when is_number(n), do: n
  defp num(_), do: 0

  defp field(m, k) when is_map(m), do: Map.get(m, k) || Map.get(m, to_string(k))
  defp field(_, _), do: nil

  defp get_in_any(m, [k]), do: field(m, k)
  defp get_in_any(m, [k | rest]), do: m |> field(k) |> get_in_any(rest)

  defp short(nil), do: "∅"
  defp short(v) when is_binary(v), do: String.slice(v, 0, 160)

  defp short(v) do
    v |> Jason.encode!() |> String.slice(0, 160)
  rescue
    _ -> inspect(v, limit: 8) |> String.slice(0, 160)
  end

  defp write_json(path, data), do: File.write!(path, Jason.encode!(data, pretty: true))
end
