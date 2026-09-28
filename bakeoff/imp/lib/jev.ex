defmodule ImpBench.Jev do
  @moduledoc """
  Jev (TypeSafe AI's "System One" decision model) as a classifier, set against
  the same held-out questions the LLM cells answer.

  Jev generates no text: it takes a JSON **state** and typed **questions** and
  returns typed answers. For a classifier that is one `choice` question per
  item: `instructions` (the task) and `criteria` (a map option → description).
  Those two strings are the whole program — so they are what the arms vary:

  | arm | instructions | criteria |
  |---|---|---|
  | `jev_bare` | the task as the LLM baseline got it | the bare labels |
  | `jev_learned` | the instruction GEPA wrote **for an LLM** in an earlier run, transplanted | the bare labels |
  | `jev_optimized` | rewritten by Imp's Optimize Anything, scored **by Jev** | rewritten too |
  | `cascade` | `jev_optimized`, accepted at confidence ≥ 0.9; otherwise the question goes to an LLM running its saved GEPA program | — |

  What `mega/jev` measured and this relies on: deterministic, phrasing-stable,
  ~200 ms a call, $0.042 per million input tokens, and calibrated only at the
  top (66/66 correct at ≥ 0.9, ~62% below). One call per item, the item alone
  in the state; two in flight; 429/529/5xx retried with backoff.

  The key is `TYPESAFE_API_KEY` (CI maps the repo secret `jev_key` onto it).
  `IMP_BENCH_JEV_URL` points the client elsewhere (the fake endpoint in tests).
  """

  @gate 0.9

  def gate, do: @gate
  def base_url, do: System.get_env("IMP_BENCH_JEV_URL") || "https://api.typesafe.ai"
  def key, do: System.get_env("TYPESAFE_API_KEY")

  @doc "One `choice` over one item. Returns `%{choice, confidence, ms}` or `%{error}`."
  def choose(state, instructions, criteria, attempt \\ 0) do
    body = %{
      model: "jev-latest",
      state: state,
      questions: %{pick: %{type: "choice", instructions: instructions, criteria: criteria}}
    }

    t0 = System.monotonic_time(:millisecond)

    resp =
      Req.post("#{base_url()}/v1/systemone",
        json: body,
        headers: [authorization: "Bearer #{key()}"],
        receive_timeout: 60_000,
        retry: false
      )

    ms = System.monotonic_time(:millisecond) - t0

    case resp do
      {:ok, %{status: 200, body: b}} ->
        b = if is_binary(b), do: Jason.decode!(b), else: b
        a = get_in(b, ["answers", "pick"]) || %{}
        %{choice: a["choice"], confidence: a["confidence"], ms: ms, usage: b["usage"]}

      {:ok, %{status: s}} when s in [429, 500, 502, 503, 529] and attempt < 5 ->
        Process.sleep(round(:math.pow(2, attempt) * 1000) + :rand.uniform(500))
        choose(state, instructions, criteria, attempt + 1)

      {:ok, %{status: s, body: b}} ->
        %{error: "HTTP #{s}: #{b |> inspect(limit: 5) |> String.slice(0, 200)}", ms: ms}

      {:error, e} when attempt < 3 ->
        Process.sleep(1000 * (attempt + 1))
        _ = e
        choose(state, instructions, criteria, attempt + 1)

      {:error, e} ->
        %{error: Exception.message(e), ms: ms}
    end
  end

  @doc "Classify every item; `items` are `%{id, state, label}`."
  def classify(items, instructions, criteria) do
    items
    |> Task.async_stream(fn it -> Map.merge(it, choose(it.state, instructions, criteria)) end,
      max_concurrency: 2,
      timeout: 400_000,
      ordered: true
    )
    |> Enum.map(fn {:ok, r} -> r end)
  end

  @doc "Accuracy, errors, the confidence gate's split, and latency, for classified items."
  def score(results) do
    n = max(length(results), 1)
    right = fn r -> r[:choice] != nil and to_string(r.choice) == to_string(r.label) end
    confident = Enum.filter(results, &((&1[:confidence] || 0) >= @gate))
    ms = results |> Enum.map(&(&1[:ms] || 0)) |> Enum.sort()

    %{
      score: Enum.count(results, right) / n,
      errors: Enum.count(results, & &1[:error]),
      error_samples: results |> Enum.filter(& &1[:error]) |> Enum.take(3) |> Enum.map(& &1.error),
      confident: length(confident),
      confident_accuracy:
        if(confident == [], do: nil, else: Enum.count(confident, right) / length(confident)),
      median_ms: Enum.at(ms, div(length(ms), 2)),
      input_tokens:
        results |> Enum.map(&(get_in(&1, [:usage, "input_tokens"]) || 0)) |> Enum.sum()
    }
  end

  @doc """
  Optimize Jev's program — its instructions and every option's description —
  with Imp's Optimize Anything. The candidate is a map of named texts; each
  evaluation is one Jev call on one train/selection item; feedback (on train
  items only, as the LLM tasks give it) names the right label.
  """
  def optimize(seed, train, selection, feedback_fn, reflection_lm, max_calls) do
    evaluator = fn candidate, item ->
      {instructions, criteria} = unpack(candidate)
      r = choose(item.state, instructions, criteria)
      ok = r[:choice] != nil and to_string(r.choice) == to_string(item.label)

      cond do
        ok -> 1.0
        item[:feedback] -> {0.0, %{feedback: feedback_fn.(item, r)}}
        true -> 0.0
      end
    end

    result =
      Imp.Optimize.Anything.run(seed, evaluator,
        dataset: Enum.map(train, &Map.put(&1, :feedback, true)),
        valset: selection,
        config: [
          engine: [max_metric_calls: max_calls, seed: 20_260_928],
          reflection: [reflection_lm: reflection_lm, reflection_minibatch_size: 5]
        ]
      )

    Imp.Optimize.Anything.best_candidate(result)
  end

  @doc "A candidate map back into Jev's two strings."
  def unpack(candidate) do
    instructions = Map.fetch!(candidate, "instructions")

    criteria =
      candidate |> Map.delete("instructions") |> Map.new(fn {"option " <> k, v} -> {k, v} end)

    {instructions, criteria}
  end

  @doc "Jev's program as a candidate map: `instructions` plus one `option <label>` entry per option."
  def pack(instructions, criteria),
    do:
      Map.new(criteria, fn {k, v} -> {"option " <> k, v} end)
      |> Map.put("instructions", instructions)
end
