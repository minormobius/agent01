defmodule ImpBench.FakeOpenAI do
  @moduledoc """
  A local OpenAI-compatible endpoint for testing the rig through Imp's real
  ReqLLM path — real HTTP, real response parsing, real provider metadata —
  with no key and no spend. The scripted `Imp.LM.Static` model skips all of
  that, which is how imp-02/03's GEPA crash (an improper list somewhere in
  real response data) passed every offline test.

      ImpBench.FakeOpenAI.start(4077)
      IMP_BENCH_MODEL=fake   # lm_for("fake") points Imp at it

  Behaviour: a request that offers tools gets one `get_order` call, then a
  `submit`; a request without tools gets the Chat adapter's field format, or,
  for a GEPA reflection prompt, a fenced instruction.
  """
  use Plug.Router

  plug(:match)
  plug(Plug.Parsers, parsers: [:json], json_decoder: Jason)
  plug(:dispatch)

  def start(port \\ 4077) do
    case Plug.Cowboy.http(__MODULE__, [], port: port) do
      {:ok, _} -> :ok
      {:error, {:already_started, _}} -> :ok
    end

    "http://127.0.0.1:#{port}/v1"
  end

  post "/v1/chat/completions" do
    body = conn.body_params
    messages = body["messages"] || []
    text = Enum.map_join(messages, "\n", &content_text(&1["content"]))
    tools? = (body["tools"] || []) != []
    last = List.last(messages) || %{}

    tool_names = Enum.map(body["tools"] || [], &get_in(&1, ["function", "name"]))
    tool_turns = Enum.count(messages, &(&1["role"] == "tool"))

    message =
      cond do
        # a builder: write a page, check it, submit
        "write_file" in tool_names and tool_turns == 0 ->
          tool_call("write_file", %{"path" => "site/index.html", "content" => fake_page()})

        "write_file" in tool_names and tool_turns == 1 ->
          tool_call("check_site", %{})

        "write_file" in tool_names ->
          tool_call("submit", %{"summary" => "A fake page.", "files" => "site/index.html"})

        tools? and last["role"] == "tool" ->
          tool_call("submit", %{"answer" => "no", "work" => "fake"})

        tools? ->
          id =
            Regex.run(
              ~r/[OP]-\d+/,
              content_text(Enum.find(messages, &(&1["role"] == "user"))["content"])
            ) || ["P-201"]

          tool_call("get_order", %{"order_id" => hd(id)})

        text =~ ~r/instruction/i and length(messages) == 1 ->
          %{
            "role" => "assistant",
            "content" =>
              "```\nFake rewrite: read the policy version from the order date first.\n```"
          }

        true ->
          fields =
            Regex.scan(~r/\[\[ ## (\w+) ## \]\]\n\{/, text)
            |> Enum.map(&Enum.at(&1, 1))
            |> Enum.uniq()

          fields = if fields == [], do: ["answer"], else: fields

          # an enum field names its allowed values ("one of: K11; K47"): take the first
          value =
            case Regex.run(~r/one of: ([^;\s]+);/, text) do
              [_, v] -> v
              _ -> "blue"
            end

          %{
            "role" => "assistant",
            "content" =>
              Enum.map_join(fields, "\n\n", &"[[ ## #{&1} ## ]]\n#{value}") <>
                "\n\n[[ ## completed ## ]]"
          }
      end

    # DeepSeek and Kimi return their thinking beside the answer.
    message = Map.put(message, "reasoning_content", "Let me think about which tool to call next.")

    resp = %{
      "id" => "chatcmpl-fake",
      "object" => "chat.completion",
      "created" => 0,
      "model" => body["model"] || "fake",
      "choices" => [
        %{
          "index" => 0,
          "message" => message,
          "finish_reason" => if(message["tool_calls"], do: "tool_calls", else: "stop")
        }
      ],
      "usage" => %{
        "prompt_tokens" => 100,
        "completion_tokens" => 10,
        "total_tokens" => 110,
        "completion_tokens_details" => %{"reasoning_tokens" => 8},
        "prompt_cache_hit_tokens" => 0,
        "prompt_cache_miss_tokens" => 100
      }
    }

    conn |> put_resp_content_type("application/json") |> send_resp(200, Jason.encode!(resp))
  end

  # A Jev-shaped endpoint: picks the first option, confident on every other call.
  post "/v1/systemone" do
    q = conn.body_params["questions"]["pick"]
    options = Map.keys(q["criteria"]) |> Enum.sort()
    conf = if rem(System.unique_integer([:positive]), 2) == 0, do: 0.95, else: 0.6

    body = %{
      "model" => "jev-fake",
      "answers" => %{
        "pick" => %{"choice" => hd(options), "confidence" => conf, "probabilities" => %{}}
      },
      "usage" => %{"input_tokens" => 120, "output_tokens" => 4}
    }

    conn |> put_resp_content_type("application/json") |> send_resp(200, Jason.encode!(body))
  end

  match _ do
    send_resp(conn, 404, "not found")
  end

  defp fake_page do
    """
    <!doctype html><html><head><meta charset="utf-8"><title>Fake build</title>
    <meta property="og:title" content="Fake build"><meta property="og:description" content="Written by the fake model.">
    <link rel="stylesheet" href="../_kit/tokens.css"><script src="../_kit/kit.js"></script></head>
    <body><h1>Fake build</h1><p>#{String.duplicate("A page the fake model writes so the rig's success path runs. ", 12)}</p></body></html>
    """
  end

  defp tool_call(name, args) do
    %{
      "role" => "assistant",
      "content" => nil,
      "tool_calls" => [
        %{
          "id" => "call_#{System.unique_integer([:positive])}",
          "type" => "function",
          "function" => %{"name" => name, "arguments" => Jason.encode!(args)}
        }
      ]
    }
  end

  defp content_text(c) when is_binary(c), do: c
  defp content_text(c) when is_list(c), do: Enum.map_join(c, "\n", &(&1["text"] || ""))
  defp content_text(_), do: ""
end
