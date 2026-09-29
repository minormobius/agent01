defmodule ImpBench.ClaudeCode do
  @moduledoc """
  An `Imp.LM` that answers through the Claude Code CLI (`claude -p`) — the
  same client, model and subscription credential (`CLAUDE_CODE_OAUTH_TOKEN`)
  the build-a-bot already runs on in `lab-build.yml`, so Imp needs no API key.

  Each call is one headless, tool-less turn:

      claude -p --bare --model <model> --tools "" --output-format json \\
        --max-turns 1 --no-session-persistence --strict-mcp-config \\
        [--system-prompt <system>]   < prompt

  `--bare` skips hooks and plugins — this repo's `.claude/settings.json` has
  session hooks that must not fire on a CI runner. System messages become
  `--system-prompt`; the rest of the conversation (the Chat adapter's
  few-shot demos arrive as user/assistant pairs) is rendered as a labelled
  transcript ending on the last user turn. The reply is the `result` field
  of the CLI's JSON result record; `is_error` becomes `{:error, …}`.

  Text only: no native tool calls, so it serves Imp's reflection and
  judging calls and plain `predict` programs, not `react` agents (the
  builder itself stays Claude Code, driven by the harness).

  `IMP_BENCH_CLAUDE_CLI` points at another executable (the tests use a stub).
  """
  @behaviour Imp.LM

  defstruct model: "claude-sonnet-5", cli: nil, timeout: 600_000

  def new(opts \\ []) do
    %__MODULE__{
      model: Keyword.get(opts, :model, "claude-sonnet-5"),
      cli: Keyword.get(opts, :cli) || System.get_env("IMP_BENCH_CLAUDE_CLI") || "claude",
      timeout: Keyword.get(opts, :timeout, 600_000)
    }
  end

  @impl true
  def generate(%__MODULE__{} = lm, messages, opts) do
    case Keyword.get(opts, :n, 1) do
      1 ->
        once(lm, messages)

      n ->
        Enum.reduce_while(1..n, {:ok, []}, fn _, {:ok, acc} ->
          case once(lm, messages) do
            {:ok, t} -> {:cont, {:ok, acc ++ [t]}}
            err -> {:halt, err}
          end
        end)
    end
  end

  def generate(__MODULE__, messages, opts), do: generate(new(), messages, opts)

  defp once(lm, messages) do
    {system, rest} = Enum.split_with(messages, &(role(&1) == :system))
    system_text = system |> Enum.map(&text/1) |> Enum.join("\n\n")
    prompt = render(rest)

    dir =
      Path.join(System.tmp_dir!(), "imp-cc-#{Base.url_encode64(:crypto.strong_rand_bytes(6))}")

    File.mkdir_p!(dir)
    prompt_file = Path.join(dir, "prompt.txt")
    File.write!(prompt_file, prompt)

    args =
      [
        "-p",
        "--bare",
        "--model",
        lm.model,
        "--tools",
        "",
        "--output-format",
        "json",
        "--max-turns",
        "1",
        "--no-session-persistence",
        "--strict-mcp-config"
      ] ++
        if(system_text == "", do: [], else: ["--system-prompt", system_text])

    # stdin from a file: prompts can be long, and System.cmd has no stdin.
    cmd = Enum.map_join([lm.cli | args], " ", &shell_quote/1) <> " < " <> shell_quote(prompt_file)

    task = Task.async(fn -> System.cmd("sh", ["-c", cmd], stderr_to_stdout: false) end)

    result =
      case Task.yield(task, lm.timeout) || Task.shutdown(task, :brutal_kill) do
        {:ok, {out, 0}} -> parse(out)
        {:ok, {out, code}} -> parse(out) |> error_unless_ok("claude exited #{code}")
        nil -> {:error, {:claude_code, :timeout}}
      end

    File.rm_rf(dir)
    result
  end

  defp parse(out) do
    record =
      out
      |> String.split("\n", trim: true)
      |> Enum.reverse()
      |> Enum.find_value(fn line ->
        case Jason.decode(line) do
          {:ok, %{"type" => "result"} = r} -> r
          _ -> nil
        end
      end)

    case record do
      %{"is_error" => false, "result" => text} when is_binary(text) ->
        {:ok, text}

      %{} = r ->
        {:error, {:claude_code, Map.take(r, ~w(subtype terminal_reason api_error_status result))}}

      nil ->
        {:error, {:claude_code, :no_result_record, String.slice(out, 0, 300)}}
    end
  end

  defp error_unless_ok({:ok, _} = ok, _), do: ok
  defp error_unless_ok({:error, e}, why), do: {:error, {why, e}}

  # One user message is sent as-is; a conversation is rendered as a transcript.
  defp render([m]), do: text(m)

  defp render(msgs) do
    body =
      Enum.map_join(msgs, "\n\n", fn m ->
        label = if role(m) == :assistant, do: "Assistant", else: "User"
        "#{label}:\n#{text(m)}"
      end)

    "The conversation so far is below. Reply as the Assistant to the last User message.\n\n" <>
      body
  end

  defp role(m), do: (m[:role] || m["role"]) |> to_string() |> String.to_existing_atom()

  defp text(m) do
    case m[:content] || m["content"] do
      s when is_binary(s) ->
        s

      parts when is_list(parts) ->
        Enum.map_join(parts, "\n", fn p -> p[:text] || p["text"] || "" end)

      other ->
        to_string(other || "")
    end
  end

  defp shell_quote(s), do: "'" <> String.replace(to_string(s), "'", "'\\''") <> "'"
end
