defmodule ImpBench.Scripted do
  @moduledoc """
  A scripted stand-in model for `IMP_BENCH_MODEL=static`: exercises every code
  path of the rig (evaluation, compilation, the ReAct loop, a real tool call,
  submit, trace capture, the report) with no key and no network. Its scores
  mean nothing; that the rig produces them at all is the test.
  """

  def lm do
    Imp.LM.Static.new(
      handler: fn messages, _opts ->
        last = List.last(messages)
        text = messages |> Enum.map(&to_string(&1[:content] || "")) |> Enum.join("\n")
        asked = messages |> Enum.filter(&(&1.role == :user)) |> List.first(%{}) |> Map.get(:content, "") |> to_string()

        cond do
          # route: a plain typed prediction
          text =~ "ticket" and not (text =~ "refund desk") ->
            %{team: if(text =~ ~r/invoice|charge|refund/i, do: "atlas", else: "harbor")}

          # desk, after a tool result: submit an answer
          last.role == :tool ->
            %{tool_calls: [%{name: "submit", arguments: %{"answer" => "no", "work" => "scripted"}}]}

          # desk, first step: look an order up, if the question names one
          true ->
            case Regex.run(~r/O-\d+/, asked |> String.split("question") |> List.last()) do
              [id | _] -> %{next_thought: "read the order", tool_calls: [%{name: "get_order", arguments: %{"order_id" => id}}]}
              _ -> %{tool_calls: [%{name: "find_customer", arguments: %{"email" => "ben@example.com"}}]}
            end
        end
      end
    )
  end
end
