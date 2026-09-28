defmodule ImpBench.Era do
  @moduledoc """
  The `era` task: from one post alone, guess the year minormobius wrote it.

  Labels come free from each post's `createdAt`; nothing is hand-labelled. A
  model can only beat chance (25%, four years) by knowing this one person's
  drift — topics, running jokes, projects, phrasing — which is exactly what
  GEPA is given the chance to write down: on the TRAIN rows the metric's
  feedback names the true year; SELECTION rows return a score only; TEST rows
  are scored at the end.

  **Data** is fetched at run time from the account's PDS
  (`com.atproto.repo.listRecords`, public, no auth), cached in the gitignored
  `data/`, and never committed. Filters: top-level posts only (no replies),
  at least 60 characters, no @-mentions (traces are published, other people's
  handles stay out), and no four-digit year in the text (it would give the
  answer away). Sampling is deterministic — posts ordered by sha256 of their
  record key — and the chosen record keys are written into the result, so the
  exact set can be re-listed while the posts exist.
  """

  @handle "minormobius.bsky.social"
  @years ~w(2023 2024 2025 2026)
  @per_year %{train: 8, selection: 12, test: 30}
  @cache "data/era-posts.json"

  def years, do: @years
  def handle, do: @handle

  @doc "All candidate posts, `%{rkey, created, year, text}`; fetched once, then read from `data/`."
  def posts do
    case File.read(@cache) do
      {:ok, body} ->
        Jason.decode!(body, keys: :atoms)

      _ ->
        posts = fetch() |> candidates()
        File.mkdir_p!(Path.dirname(@cache))
        File.write!(@cache, Jason.encode!(posts))
        posts
    end
  end

  defp fetch do
    did =
      Req.get!("https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle",
        params: [handle: @handle],
        retry: :transient
      ).body
      |> json()
      |> Map.fetch!("did")

    # plc.directory answers application/did+ld+json, which Req does not decode.
    doc = Req.get!("https://plc.directory/#{did}", retry: :transient).body |> json()
    pds = Enum.find(doc["service"], &(&1["id"] == "#atproto_pds"))["serviceEndpoint"]

    Stream.unfold(:start, fn
      :done ->
        nil

      cursor ->
        params =
          [repo: did, collection: "app.bsky.feed.post", limit: 100] ++
            if(cursor == :start, do: [], else: [cursor: cursor])

        body =
          Req.get!("#{pds}/xrpc/com.atproto.repo.listRecords",
            params: params,
            retry: :transient,
            max_retries: 5
          ).body

        records = body["records"] || []
        next = if body["cursor"] && records != [], do: body["cursor"], else: :done
        {records, next}
    end)
    |> Stream.flat_map(& &1)
    |> Enum.map(fn r ->
      v = r["value"]
      created = v["createdAt"] || ""

      %{
        rkey: r["uri"] |> String.split("/") |> List.last(),
        created: String.slice(created, 0, 10),
        year: String.slice(created, 0, 4),
        text: v["text"] || "",
        reply: Map.has_key?(v, "reply")
      }
    end)
  end

  @doc "The filter, public so a cache can be seeded from an outside fetch."
  def candidates(raw), do: raw |> Enum.filter(&keep?/1) |> Enum.map(&Map.drop(&1, [:reply]))

  defp json(body) when is_binary(body), do: Jason.decode!(body)
  defp json(body), do: body

  defp keep?(p) do
    not p.reply and p.year in @years and String.length(p.text) >= 60 and
      not String.contains?(p.text, "@") and not Regex.match?(~r/\b(19|20)\d\d\b/, p.text)
  end

  @doc "Deterministic split: per year, posts ordered by sha256(rkey), then train / selection / test."
  def split do
    by_year = Enum.group_by(posts(), & &1.year)

    for y <- @years, reduce: %{train: [], selection: [], test: []} do
      acc ->
        ordered =
          by_year |> Map.get(y, []) |> Enum.sort_by(&:crypto.hash(:sha256, "era-v1:" <> &1.rkey))

        {train, rest} = Enum.split(ordered, @per_year.train)
        {selection, rest} = Enum.split(rest, @per_year.selection)
        test = Enum.take(rest, @per_year.test)

        %{
          train: acc.train ++ train,
          selection: acc.selection ++ selection,
          test: acc.test ++ test
        }
    end
    # interleave years so a k-example prefix (LabeledFewShot) is balanced
    |> Map.new(fn {k, rows} -> {k, interleave(rows)} end)
  end

  defp interleave(rows) do
    rows
    |> Enum.group_by(& &1.year)
    |> Map.values()
    |> Enum.map(&Enum.with_index/1)
    |> List.flatten()
    |> Enum.sort_by(fn {r, i} -> {i, r.year} end)
    |> Enum.map(&elem(&1, 0))
  end

  def program(lm) do
    "post: string -> year: enum[#{Enum.join(@years, ",")}]"
    |> Imp.signature("A post by one Bluesky user. Guess the year they wrote it.")
    |> Imp.predict(lm: lm)
  end

  def examples(rows, feedback_allowed) do
    Enum.map(rows, fn r ->
      Imp.example(%{post: r.text, year: r.year, rkey: r.rkey, feedback_allowed: feedback_allowed})
      |> Imp.with_inputs([:post])
    end)
  end

  @doc "Exact year scores 1. Train rows get feedback naming the true year; selection rows a score only."
  def metric do
    fn example, prediction ->
      expected = Imp.Example.get(example, :year)
      actual = to_string(Imp.Prediction.get(prediction, :year))
      score = if actual == expected, do: 1.0, else: 0.0

      if Imp.Example.get(example, :feedback_allowed) do
        %{
          score: score,
          feedback:
            if(score == 1.0,
              do: "Correct: this post is from #{expected}.",
              else: "This post was written in #{expected}; you guessed #{actual}."
            )
        }
      else
        score
      end
    end
  end

  @doc "Per-row outcomes, a 4x4 confusion matrix and within-one-year accuracy from an evaluation."
  def summarize(%Imp.Evaluate.Result{rows: rows}, test) do
    by_rkey = Map.new(test, &{&1.rkey, &1})

    outcomes =
      for row <- rows do
        ex = row[:example]
        rkey = Imp.Example.get(ex, :rkey)
        expected = Imp.Example.get(ex, :year)
        predicted = row[:prediction] && safe_year(row[:prediction])
        post = by_rkey[rkey]

        %{
          rkey: rkey,
          created: post && post.created,
          year: expected,
          predicted: predicted,
          text: post && post.text
        }
      end

    confusion =
      for y <- @years, into: %{} do
        {y,
         for(
           p <- @years ++ ["error"],
           into: %{},
           do: {p, Enum.count(outcomes, &(&1.year == y and (&1.predicted || "error") == p))}
         )}
      end

    within_one =
      Enum.count(outcomes, fn o ->
        o.predicted in @years and
          abs(String.to_integer(o.predicted) - String.to_integer(o.year)) <= 1
      end) / max(length(outcomes), 1)

    %{outcomes: outcomes, confusion: confusion, within_one: within_one}
  end

  defp safe_year(pred) do
    Imp.Prediction.get(pred, :year) |> to_string()
  rescue
    _ -> nil
  end
end
