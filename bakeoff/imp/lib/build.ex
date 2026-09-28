defmodule ImpBench.Build do
  @moduledoc """
  The `build` task: the Bluesky build-a-bot's job, done by an Imp agent.

  The real pipeline (`.github/workflows/lab-build.yml`, docs/LAB-FACTORY.md)
  takes a mention like "odyssey trail where it's a terminal game you're sailing
  around the Aegean…" and has a headless agent build a one-page site under
  `minomobi.com/<slug>/`, with no network, only file tools and the shared kit.
  Here an `Imp.react` agent gets the same request text and the same
  constraints, builds into a scratch directory, and is scored by the
  factory's own gates plus Jev:

  | part | weight | what |
  |---|---|---|
  | exists | 0.15 | `index.html` written and more than 500 bytes |
  | gate | 0.20 | `scripts/lab-content-gate.mjs` passes (title + OG tags, no unbounded streams, no wallets, …) |
  | smoke | 0.35 | `scripts/lab-smoke.mjs` under the production CSP: clean = full; each problem −0.25; blank = 0 |
  | fit | 0.30 | Jev's `noul`: does the page do what the request asked? (skipped, and re-weighted, without a key) |

  Every rule the gates apply is stated in the instructions. The agent also
  gets `check_site`, which runs the same smoke test and gate and returns the
  report — the factory runs those as a separate repair pass; here the agent
  can call them itself.

  **Corpus:** minormobius's own requests from `.github/lab-requests/` (their
  text is theirs to publish), only the ones that stand alone as a fresh build
  — most requests revise an existing site and cannot be scored without it.
  """

  alias ImpBench.Jev

  @test ~w(train-game odyssey-trail domain-availability sketch-out testing-this yes-that daily-digital mutuals-combined)
  @max_file 400_000
  @max_files 30

  @instructions """
  You build one small website from a request someone posted on Bluesky. You
  work only through the tools: there is no network and no shell. Write the site
  into `site/`; its entry point is `site/index.html`. It is served at
  https://minomobi.com/<slug>/ beside a shared kit you can read in `kit/`.

  Rules the build is checked against (all of them are enforced):
  - `site/index.html` must have a `<title>`, `<meta property="og:title" content="…">` and
    `<meta property="og:description" content="…">`.
  - Link the kit, never copy it: `<link rel="stylesheet" href="../_kit/tokens.css">` and
    `<script src="../_kit/kit.js"></script>`. Read `kit/README.md` for what it offers.
  - The page must load with no JavaScript errors under a strict Content-Security-Policy:
    no external scripts, styles or fonts (inline them or write them into `site/`), no eval.
  - Bluesky data only through `kit.bskyGet` for a subject the visitor names (a handle, a
    post). Never the firehose, jetstream, WebSockets, EventSource, `com.atproto.sync.*`
    (except getRepo) or `com.atproto.repo.listRecords`.
  - No wallets or crypto providers, no service workers, no notification prompts, no
    credential collection.
  - At most #{@max_files} files, each under #{div(@max_file, 1000)} KB.
  - Each reply you write is limited in length, so never put a whole large page in one
    call: keep `site/index.html` short and put scripts and styles in their own files
    (`site/app.js`, `site/style.css`), each written by its own `write_file` call. Grow a
    file with `edit_file` rather than rewriting it.

  Call `check_site` after writing: it loads the page in a real headless browser
  and runs the content gate, and tells you exactly what fails. Fix what it reports.
  When the site does what the request asks and `check_site` is clean, submit a
  one-paragraph `summary` of what you built and the list of `files`.
  """

  def instructions, do: @instructions
  def test_slugs, do: @test

  @doc "The request files for the test slugs: `%{slug, task}`."
  def requests do
    root = repo_root()

    for slug <- @test do
      r =
        Path.join([root, ".github/lab-requests", slug <> ".json"])
        |> File.read!()
        |> Jason.decode!()

      "minormobius.bsky.social" = r["requester"]
      %{slug: slug, task: r["task"]}
    end
  end

  def repo_root, do: Path.expand("../..", File.cwd!())

  # ─── the task ────────────────────────────────────────────────────────

  @doc "Build every test request with `lm`, score each, keep the sites under `out/build/`."
  def run(lm, out) do
    jev? = Jev.key() not in [nil, ""]
    max_iters = String.to_integer(System.get_env("IMP_BENCH_BUILD_ITERS") || "40")

    rows =
      requests()
      |> Task.async_stream(&build_one(&1, lm, out, jev?, max_iters),
        max_concurrency: 4,
        timeout: 1_500_000,
        on_timeout: :kill_task,
        ordered: true
      )
      |> Enum.zip(requests())
      |> Enum.map(fn
        {{:ok, row}, _} -> row
        {{:exit, why}, r} -> %{slug: r.slug, score: 0.0, error: "killed: #{inspect(why)}"}
      end)

    usage = rows |> Enum.map(&(&1[:usage] || %{})) |> Enum.reduce(%{}, &merge_usage/2)

    %{
      n_test: length(rows),
      judge:
        if(jev?,
          do: "jev",
          else: "none (no key): fit is dropped and the other weights renormalized"
        ),
      max_iters: max_iters,
      arms: %{
        "react" => %{
          score: mean(Enum.map(rows, & &1.score)),
          errors: Enum.count(rows, & &1[:error]),
          usage: usage,
          median_seconds: rows |> Enum.map(&(&1[:seconds] || 0)) |> median()
        }
      },
      rows: rows
    }
  end

  defp build_one(req, lm, out, jev?, max_iters) do
    dir =
      Path.join(System.tmp_dir!(), "imp-build-#{req.slug}-#{System.unique_integer([:positive])}")

    site = Path.join(dir, "site")

    agent =
      "request -> summary: string, files: string"
      |> Imp.signature(@instructions)
      |> Imp.react(tools(dir), lm: lm, max_iters: max_iters)

    t0 = System.monotonic_time(:second)
    {result, usage} = Imp.Usage.track(fn -> Imp.call(agent, %{request: req.task}) end)
    secs = System.monotonic_time(:second) - t0

    {calls, termination, err} =
      case result do
        {:ok, pred} ->
          steps = (pred.metadata[:history] && pred.metadata.history.messages) || []

          n =
            steps
            |> Enum.map(fn m -> length((m[:tool_calls] || %{})[:tool_calls] || []) end)
            |> Enum.sum()

          cause = pred.metadata[:termination_cause]

          {n,
           to_string(pred.metadata[:termination_reason]) <>
             if(cause, do: " (#{inspect(cause, limit: 6) |> String.slice(0, 200)})", else: ""),
           nil}

        {:error, e} ->
          {0, "error", inspect(e, limit: 12) |> String.slice(0, 400)}
      end

    s = score(req.task, site, jev?)
    dest = Path.join([out, "build", req.slug])
    File.mkdir_p!(dest)
    if File.dir?(site), do: File.cp_r!(site, dest)

    %{
      slug: req.slug,
      score: s.score,
      parts: s.parts,
      feedback: String.slice(s.feedback, 0, 1500),
      seconds: secs,
      tool_calls: calls,
      termination: termination,
      error: err,
      usage: usage |> Map.values() |> Enum.reduce(%{}, &merge_usage/2)
    }
  end

  defp merge_usage(a, b) do
    for k <- ~w(input_tokens output_tokens total_tokens prompt_tokens completion_tokens)a,
        into: %{} do
      {k,
       num(Map.get(a, k) || Map.get(a, to_string(k))) +
         num(Map.get(b, k) || Map.get(b, to_string(k)))}
    end
    |> Map.reject(fn {_, v} -> v == 0 end)
  end

  defp num(n) when is_number(n), do: n
  defp num(_), do: 0
  defp mean([]), do: nil
  defp mean(xs), do: Enum.sum(xs) / length(xs)
  defp median([]), do: nil
  defp median(xs), do: xs |> Enum.sort() |> Enum.at(div(length(xs), 2))

  # ─── the agent's tools, confined to one scratch directory ───────────

  def tools(dir) do
    site = Path.join(dir, "site")
    kit = Path.join(repo_root(), "lab/_kit")
    File.mkdir_p!(site)

    resolve = fn path ->
      path = String.trim(path || "")

      cond do
        String.contains?(path, "..") ->
          {:error, "paths may not contain .."}

        String.starts_with?(path, "site/") or path == "site" ->
          {:site, Path.join(site, String.trim_leading(path, "site") |> String.trim_leading("/"))}

        String.starts_with?(path, "kit/") or path == "kit" ->
          {:kit, Path.join(kit, String.trim_leading(path, "kit") |> String.trim_leading("/"))}

        true ->
          {:error, "paths start with site/ (yours, writable) or kit/ (shared, read-only)"}
      end
    end

    [
      Imp.tool(
        :list_files,
        "List files under site/ or kit/.",
        fn %{"dir" => d} ->
          case resolve.(d) do
            {:error, e} -> %{"error" => e}
            {_, p} -> %{"files" => if(File.dir?(p), do: File.ls!(p) |> Enum.sort(), else: [])}
          end
        end,
        schema:
          obj(
            %{
              "dir" => %{
                "type" => "string",
                "description" => "site, kit, or a subdirectory of either"
              }
            },
            ["dir"]
          )
      ),
      Imp.tool(
        :read_file,
        "Read a file under site/ or kit/ (first 30,000 characters).",
        fn %{"path" => p} ->
          case resolve.(p) do
            {:error, e} ->
              %{"error" => e}

            {_, f} ->
              if File.regular?(f),
                do: %{"content" => f |> File.read!() |> String.slice(0, 30_000)},
                else: %{"error" => "no such file"}
          end
        end,
        schema: obj(%{"path" => %{"type" => "string"}}, ["path"])
      ),
      Imp.tool(
        :write_file,
        "Create or overwrite a file under site/.",
        fn %{"path" => p, "content" => c} ->
          case resolve.(p) do
            {:site, f} ->
              cond do
                byte_size(c) > @max_file ->
                  %{"error" => "file too large (max #{@max_file} bytes)"}

                not File.exists?(f) and count_files(site) >= @max_files ->
                  %{"error" => "at most #{@max_files} files"}

                true ->
                  File.mkdir_p!(Path.dirname(f))
                  File.write!(f, c)
                  %{"ok" => true, "bytes" => byte_size(c)}
              end

            {:kit, _} ->
              %{"error" => "kit/ is read-only; link it from ../_kit/ instead"}

            {:error, e} ->
              %{"error" => e}
          end
        end,
        schema:
          obj(%{"path" => %{"type" => "string"}, "content" => %{"type" => "string"}}, [
            "path",
            "content"
          ])
      ),
      Imp.tool(
        :edit_file,
        "Replace one exact occurrence of `old` with `new` in a file under site/.",
        fn %{"path" => p, "old" => old, "new" => new} ->
          case resolve.(p) do
            {:site, f} ->
              with true <- File.regular?(f) || {:error, "no such file"},
                   body = File.read!(f),
                   1 <- body |> String.split(old) |> length() |> Kernel.-(1) do
                File.write!(f, String.replace(body, old, new, global: false))
                %{"ok" => true}
              else
                {:error, e} ->
                  %{"error" => e}

                0 ->
                  %{"error" => "`old` not found"}

                n when is_integer(n) ->
                  %{"error" => "`old` occurs #{n} times; include more context"}
              end

            {:kit, _} ->
              %{"error" => "kit/ is read-only"}

            {:error, e} ->
              %{"error" => e}
          end
        end,
        schema:
          obj(
            %{
              "path" => %{"type" => "string"},
              "old" => %{"type" => "string"},
              "new" => %{"type" => "string"}
            },
            ["path", "old", "new"]
          )
      ),
      Imp.tool(
        :check_site,
        "Load site/index.html in a headless browser under the production CSP and run the content gate. Returns what fails.",
        fn _ ->
          check(site)
          |> Map.take([:smoke_report, :gate_report, :smoke_problems, :gate_ok])
          |> stringify()
        end,
        schema: obj(%{}, [])
      )
    ]
  end

  defp count_files(dir), do: Path.wildcard(Path.join(dir, "**/*")) |> Enum.count(&File.regular?/1)

  # ─── checks: the factory's own scripts, run from the repo root ──────

  @doc "Run lab-smoke and lab-content-gate against a built site directory."
  def check(site) do
    root = repo_root()
    index = Path.join(site, "index.html")
    exists = File.regular?(index) and File.stat!(index).size > 500

    {gate_out, gate_code} =
      System.cmd("node", ["scripts/lab-content-gate.mjs", site], cd: root, stderr_to_stdout: true)

    {smoke_out, smoke_code} =
      if File.regular?(index),
        do:
          System.cmd("node", ["scripts/lab-smoke.mjs", site],
            cd: root,
            stderr_to_stdout: true,
            env: chrome_env()
          ),
        else: {"no site/index.html", 1}

    # lab-smoke ends a failing run with "✘ N problem(s) loading …"
    problems =
      case Regex.run(~r/✘ (\d+) problem/, smoke_out) do
        [_, n] -> String.to_integer(n)
        _ -> 0
      end

    blank = smoke_out =~ ~r/blank/i and smoke_code != 0

    %{
      exists: exists,
      gate_ok: gate_code == 0,
      gate_report: tail(gate_out),
      smoke_ok: smoke_code == 0,
      smoke_problems: if(smoke_code == 0, do: 0, else: max(problems, 1)),
      smoke_blank: blank,
      smoke_report: tail(smoke_out)
    }
  end

  defp chrome_env do
    case System.get_env("CHROME_BIN") do
      nil -> []
      bin -> [{"CHROME_BIN", bin}]
    end
  end

  defp tail(out),
    do: out |> String.split("\n") |> Enum.take(-40) |> Enum.join("\n") |> String.slice(0, 6000)

  @doc "The partial-credit score, its parts, and feedback naming what failed."
  def score(request, site, jev?) do
    c = check(site)

    smoke =
      cond do
        not File.regular?(Path.join(site, "index.html")) -> 0.0
        c.smoke_blank -> 0.0
        c.smoke_ok -> 1.0
        true -> max(0.0, 1.0 - 0.25 * c.smoke_problems)
      end

    fit = if jev? and c.exists, do: judge(request, site), else: nil

    # the gate passes vacuously on an empty directory: it only counts once there is a page
    parts = %{exists: b(c.exists), gate: b(c.gate_ok and c.exists), smoke: smoke, fit: fit}
    weights = %{exists: 0.15, gate: 0.20, smoke: 0.35, fit: 0.30}
    used = Enum.reject(weights, fn {k, _} -> is_nil(parts[k]) end)
    total = used |> Enum.map(fn {k, w} -> w * parts[k] end) |> Enum.sum()
    total = total / (used |> Enum.map(&elem(&1, 1)) |> Enum.sum())

    feedback =
      [
        !c.exists && "site/index.html is missing or under 500 bytes.",
        !c.gate_ok && "The content gate failed:\n" <> c.gate_report,
        smoke < 1.0 && "The smoke test found problems:\n" <> c.smoke_report,
        fit && fit < 0.5 &&
          "A judge doubts the page does what the request asked (#{Float.round(fit, 2)})."
      ]
      |> Enum.filter(& &1)
      |> Enum.join("\n\n")

    %{
      score: total,
      parts: parts,
      feedback: if(feedback == "", do: "Clean build.", else: feedback),
      check: Map.drop(c, [:smoke_report, :gate_report])
    }
  end

  defp b(true), do: 1.0
  defp b(_), do: 0.0

  # Jev as judge: facts computed by the harness, then one noul. ("The caller
  # computes, the model decides" — mega/jev's rule.)
  defp judge(request, site) do
    html = File.read!(Path.join(site, "index.html"))

    text =
      html
      |> String.replace(~r/<script.*?<\/script>|<style.*?<\/style>/s, " ")
      |> String.replace(~r/<[^>]+>/, " ")
      |> String.replace(~r/\s+/, " ")

    files = Path.wildcard(Path.join(site, "**/*")) |> Enum.filter(&File.regular?/1)

    state = %{
      request: String.slice(request, 0, 3000),
      page: %{
        title: (Regex.run(~r/<title>(.*?)<\/title>/s, html) || [nil, ""]) |> Enum.at(1),
        visible_text: String.slice(text, 0, 2500),
        files: Enum.map(files, &Path.relative_to(&1, site)),
        script_bytes:
          files
          |> Enum.filter(&String.ends_with?(&1, ".js"))
          |> Enum.map(&File.stat!(&1).size)
          |> Enum.sum()
          |> Kernel.+(inline_script_bytes(html)),
        has_canvas: html =~ "<canvas",
        inputs: length(Regex.scan(~r/<input|<textarea|<select/, html)),
        buttons: length(Regex.scan(~r/<button/, html))
      }
    }

    body = %{
      model: "jev-latest",
      state: state,
      questions: %{
        fits: %{
          type: "noul",
          instructions:
            "Given the request and the facts about the page built for it, does the page plausibly do what the request asked for?",
          criteria: %{
            true: "The page implements the thing requested.",
            false: "The page misses or ignores what was requested."
          }
        }
      }
    }

    case Req.post("#{Jev.base_url()}/v1/systemone",
           json: body,
           headers: [authorization: "Bearer #{Jev.key()}"],
           receive_timeout: 60_000,
           retry: :transient
         ) do
      {:ok, %{status: 200, body: b}} ->
        b = if is_binary(b), do: Jason.decode!(b), else: b
        get_in(b, ["answers", "fits", "noul"])

      _ ->
        nil
    end
  end

  defp inline_script_bytes(html),
    do:
      Regex.scan(~r/<script[^>]*>(.*?)<\/script>/s, html)
      |> Enum.map(fn [_, s] -> byte_size(s) end)
      |> Enum.sum()

  defp obj(props, required),
    do: %{"type" => "object", "properties" => props, "required" => required}

  defp stringify(m), do: Map.new(m, fn {k, v} -> {to_string(k), v} end)
end
