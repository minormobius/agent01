defmodule ImpBench.Trec do
  @moduledoc """
  The `trec` task: Imp's own matched GEPA experiment, re-run on our models.

  A question is routed to one of two opaque codes: `K11` (a question asking
  for a description, definition, reason or manner — TREC's DESC) or `K47` (a
  question asking for an entity — TREC's ENTY). The program is never told
  what the codes mean. During optimization the metric's feedback on the 20
  TRAIN rows names the meanings ("Expected K11 for …; K47 represents …"); the
  40 SELECTION rows return a score only; the 80 HELD-OUT rows are scored at
  the end. So a model starts near chance however strong it is, and any lift
  is what the optimizer taught it. This is Imp's
  `research/matched_instruction_optimizers_trec` (signature, instruction,
  metric and splits copied from its `run_imp.exs`), where GEPA on
  gpt-5.4-mini gained +0.40 held-out accuracy (Imp RESULTS.md R3).

  **The rows are not in this repository.** Imp's TREC attribution records the
  corpus license as unknown, so they are fetched at run time from Imp's
  repository at a pinned commit and checked against the sha256 below.
  """

  @commit "49a635d361226c67d8c7ad5b2d90085176e0d519"
  @base "https://raw.githubusercontent.com/deepfates/imp/#{@commit}/research/matched_instruction_optimizers_trec/"
  @files %{
    "train" => "d227d28bd89f448e024b94df01b27a1331446cea460865482eed0c60fb3a5fb6",
    "selection" => "ccaa1323bf6a8367fce75d453e199920f670ed799f2bf0849959176c2cc8666b",
    "held_out" => "e656e003ae96d2808f720ad120f2e8f2cd5568ccbf6f605ca8e456450af5914a"
  }
  @routes %{"DESC" => "K11", "ENTY" => "K47"}
  @meanings %{
    "K11" => "question asking for a description, definition, reason, or manner",
    "K47" => "question asking for an entity such as an animal, product, substance, or other thing"
  }

  def source, do: %{commit: @commit, base: @base, sha256: @files}

  @doc "The three splits as lists of `%{id, text, route}`; fetched once, then read from `data/`."
  def rows do
    for {name, sha} <- @files, into: %{} do
      path = Path.join("data", "trec-#{name}.jsonl")

      body =
        case File.read(path) do
          {:ok, b} ->
            b

          _ ->
            b = Req.get!(@base <> "#{name}.jsonl", retry: :transient, decode_body: false).body
            File.mkdir_p!("data")
            File.write!(path, b)
            b
        end

      got = :crypto.hash(:sha256, body) |> Base.encode16(case: :lower)

      got == sha ||
        raise "trec #{name}: sha256 #{got}, expected #{sha} — refusing to score against unverified rows"

      rows =
        body
        |> String.split("\n", trim: true)
        |> Enum.map(&Jason.decode!/1)
        |> Enum.map(fn r ->
          coarse = r["label"] |> String.split(":") |> hd()
          %{id: r["id"], text: r["text"], route: Map.fetch!(@routes, coarse)}
        end)

      {String.to_atom(name), rows}
    end
  end

  def program(lm) do
    Imp.predict(
      Imp.signature(
        "text: string -> route: enum[K11,K47]",
        "Route the question to exactly one opaque code. Return only the required structured route."
      ),
      lm: lm
    )
  end

  def examples(rows, feedback_allowed) do
    Enum.map(rows, fn r ->
      Imp.example(%{text: r.text, route: r.route, feedback_allowed: feedback_allowed})
      |> Imp.with_inputs([:text])
    end)
  end

  @doc "Imp's metric: feedback names the codes' meanings on train rows only."
  def metric do
    fn example, prediction ->
      expected = Imp.Example.get(example, :route)
      actual = Imp.Prediction.get(prediction, :route)
      score = if actual == expected, do: 1.0, else: 0.0

      if Imp.Example.get(example, :feedback_allowed) do
        %{
          score: score,
          feedback:
            if(score == 1.0,
              do: "Correct: #{expected} handles #{@meanings[expected]}.",
              else:
                "Expected #{expected} for #{@meanings[expected]}; #{actual} represents #{@meanings[actual] || "unknown service"}."
            )
        }
      else
        score
      end
    end
  end
end
