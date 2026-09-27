defmodule ImpBench.Desk do
  @moduledoc """
  The `desk` task: a refund desk an agent can only see through tools.

  The world is fixed and small (four customers, eight orders, a policy table,
  three exchange rates) so that every question has exactly one right answer,
  and that answer is computed by `solve/1` from the same data the tools read.
  The answer key is therefore never hand-typed: if a tool and the key ever
  disagreed, `ImpBench.Selftest` fails before a token is spent.

  Nothing in the question gives the answer away. To answer "how much would
  ana@example.com get back for O-102" a model has to find the customer (for
  tier and country), read the order (category, date, amount, status), read the
  policy for that category and tier, check the window, and convert currency —
  four or five tool calls, each of which it can get wrong.
  """

  @today ~D[2026-09-27]

  @customers %{
    "C1" => %{"id" => "C1", "email" => "ana@example.com", "name" => "Ana Ruiz", "tier" => "gold", "country" => "ES"},
    "C2" => %{"id" => "C2", "email" => "ben@example.com", "name" => "Ben Okafor", "tier" => "standard", "country" => "GB"},
    "C3" => %{"id" => "C3", "email" => "chen@example.com", "name" => "Chen Wei", "tier" => "standard", "country" => "US"},
    "C4" => %{"id" => "C4", "email" => "dara@example.com", "name" => "Dara Kim", "tier" => "gold", "country" => "US"}
  }

  @orders %{
    "O-101" => %{"id" => "O-101", "customer_id" => "C1", "date" => "2026-08-02", "category" => "electronics", "amount_usd" => 240.0, "status" => "delivered"},
    "O-102" => %{"id" => "O-102", "customer_id" => "C1", "date" => "2026-09-10", "category" => "apparel", "amount_usd" => 80.0, "status" => "delivered"},
    "O-103" => %{"id" => "O-103", "customer_id" => "C2", "date" => "2026-09-01", "category" => "electronics", "amount_usd" => 500.0, "status" => "delivered"},
    "O-104" => %{"id" => "O-104", "customer_id" => "C2", "date" => "2026-09-20", "category" => "books", "amount_usd" => 30.0, "status" => "shipped"},
    "O-105" => %{"id" => "O-105", "customer_id" => "C3", "date" => "2026-07-15", "category" => "apparel", "amount_usd" => 120.0, "status" => "delivered"},
    "O-106" => %{"id" => "O-106", "customer_id" => "C3", "date" => "2026-09-18", "category" => "electronics", "amount_usd" => 60.0, "status" => "returned"},
    "O-107" => %{"id" => "O-107", "customer_id" => "C4", "date" => "2026-09-05", "category" => "furniture", "amount_usd" => 900.0, "status" => "delivered"},
    "O-108" => %{"id" => "O-108", "customer_id" => "C4", "date" => "2026-09-22", "category" => "books", "amount_usd" => 45.0, "status" => "delivered"}
  }

  # window in days from the order date; percent of the price refunded, by tier
  @policy %{
    "electronics" => %{"window_days" => 30, "percent" => %{"standard" => 90, "gold" => 100}},
    "apparel" => %{"window_days" => 60, "percent" => %{"standard" => 100, "gold" => 100}},
    "books" => %{"window_days" => 14, "percent" => %{"standard" => 100, "gold" => 100}},
    "furniture" => %{"window_days" => 30, "percent" => %{"standard" => 80, "gold" => 90}}
  }

  @currency %{"ES" => "EUR", "GB" => "GBP", "US" => "USD"}
  @usd_to %{"USD" => 1.0, "EUR" => 0.92, "GBP" => 0.79}

  @instructions """
  You work a customer refund desk. You can only learn about customers, orders
  and policy through the tools; never guess a value you could look up.

  Rules the tools do not state:
  - An order is eligible for a refund only if it has not been returned and
    days_since(order date) is at most the category's window_days.
  - The refund is the order's price times the policy percent for the
    customer's tier.
  - Refunds are paid in the customer's local currency: use `convert`, and
    round money to 2 decimals.

  Give only the final value in `answer`: a money amount like `73.60 EUR`, an
  order id like `O-104`, a count like `2`, or `yes` / `no`. If an order is not
  eligible, a refund amount is `0.00` in the local currency.
  """

  def instructions, do: @instructions
  def today, do: @today

  # ─── tools ──────────────────────────────────────────────────────────

  def tools do
    [
      Imp.tool(:find_customer, "Look up a customer by email. Returns id, name, tier and country.",
        fn %{"email" => email} ->
          Enum.find_value(@customers, %{"error" => "no customer with that email"}, fn {_, c} ->
            if String.downcase(c["email"]) == String.downcase(String.trim(email)), do: c
          end)
        end,
        schema: obj(%{"email" => %{"type" => "string"}}, ["email"])
      ),
      Imp.tool(:list_orders, "List a customer's order ids, oldest first.",
        fn %{"customer_id" => id} -> %{"order_ids" => order_ids(id)} end,
        schema: obj(%{"customer_id" => %{"type" => "string"}}, ["customer_id"])
      ),
      Imp.tool(:get_order, "Read one order: customer, date, category, price in USD and status.",
        fn %{"order_id" => id} -> Map.get(@orders, String.trim(id), %{"error" => "no such order"}) end,
        schema: obj(%{"order_id" => %{"type" => "string"}}, ["order_id"])
      ),
      Imp.tool(:refund_policy, "Refund window (days) and percent refunded for a product category and customer tier.",
        fn %{"category" => cat, "tier" => tier} ->
          case @policy[cat] do
            nil -> %{"error" => "no policy for that category"}
            p -> %{"category" => cat, "tier" => tier, "window_days" => p["window_days"], "percent" => p["percent"][tier]}
          end
        end,
        schema:
          obj(
            %{
              "category" => %{"type" => "string", "enum" => Map.keys(@policy)},
              "tier" => %{"type" => "string", "enum" => ["standard", "gold"]}
            },
            ["category", "tier"]
          )
      ),
      Imp.tool(:days_since, "Days from a date (YYYY-MM-DD) to today.",
        fn %{"date" => date} ->
          case Date.from_iso8601(String.trim(date)) do
            {:ok, d} -> %{"today" => Date.to_iso8601(@today), "days" => Date.diff(@today, d)}
            _ -> %{"error" => "date must be YYYY-MM-DD"}
          end
        end,
        schema: obj(%{"date" => %{"type" => "string"}}, ["date"])
      ),
      Imp.tool(:convert, "Convert a USD amount to a currency (USD, EUR or GBP), and the country's currency if you pass a country code instead.",
        fn args ->
          to = args["to"] |> to_string() |> String.upcase()
          to = Map.get(@currency, to, to)

          case @usd_to[to] do
            nil -> %{"error" => "unknown currency"}
            rate -> %{"amount" => round2(num(args["amount_usd"]) * rate), "currency" => to, "rate" => rate}
          end
        end,
        schema: obj(%{"amount_usd" => %{"type" => "number"}, "to" => %{"type" => "string"}}, ["amount_usd", "to"])
      )
    ]
  end

  # ─── questions and the reference solver ─────────────────────────────

  @doc "Every question, with its answer computed by `solve/1`."
  def questions do
    refund_q =
      for id <- Map.keys(@orders) |> Enum.sort() do
        c = @customers[@orders[id]["customer_id"]]
        {"How much would #{c["email"]} be refunded for order #{id}, in their local currency?", {:refund, id}}
      end

    window_q =
      for id <- ~w(O-101 O-103 O-104 O-105 O-107 O-108) do
        {"Is order #{id} still eligible for a refund? Answer yes or no.", {:eligible, id}}
      end

    priciest_q =
      for cid <- ~w(C1 C2 C3 C4) do
        {"Which of #{@customers[cid]["email"]}'s orders cost the most?", {:priciest, cid}}
      end

    total_q =
      for cid <- ~w(C1 C2 C3 C4) do
        {"What is the total refund #{@customers[cid]["email"]} could get right now across all their orders, in their local currency?",
         {:total, cid}}
      end

    count_q =
      for cid <- ~w(C2 C3) do
        {"How many of #{@customers[cid]["email"]}'s orders are eligible for a refund today?", {:count, cid}}
      end

    (refund_q ++ window_q ++ priciest_q ++ total_q ++ count_q)
    |> Enum.with_index(1)
    |> Enum.map(fn {{q, key}, i} -> %{id: "d#{String.pad_leading("#{i}", 2, "0")}", question: q, answer: solve(key), key: key} end)
  end

  @doc "Deterministic split: every third question trains, the rest are held out."
  def split do
    qs = questions()
    {Enum.filter(qs, &(rem(idx(&1), 3) == 0)), Enum.reject(qs, &(rem(idx(&1), 3) == 0))}
  end

  defp idx(%{id: "d" <> n}), do: String.to_integer(n)

  def solve({:refund, id}), do: money(refund_usd(id), @orders[id]["customer_id"])
  def solve({:eligible, id}), do: if(eligible?(id), do: "yes", else: "no")
  def solve({:priciest, cid}), do: cid |> order_ids() |> Enum.max_by(&@orders[&1]["amount_usd"])

  def solve({:total, cid}) do
    usd = cid |> order_ids() |> Enum.map(&refund_usd/1) |> Enum.sum()
    money(usd, cid)
  end

  def solve({:count, cid}), do: cid |> order_ids() |> Enum.count(&eligible?/1) |> Integer.to_string()

  defp order_ids(cid),
    do: @orders |> Map.values() |> Enum.filter(&(&1["customer_id"] == cid)) |> Enum.sort_by(& &1["date"]) |> Enum.map(& &1["id"])

  defp eligible?(id) do
    o = @orders[id]
    days = Date.diff(@today, Date.from_iso8601!(o["date"]))
    o["status"] != "returned" and days <= @policy[o["category"]]["window_days"]
  end

  defp refund_usd(id) do
    o = @orders[id]
    tier = @customers[o["customer_id"]]["tier"]
    if eligible?(id), do: o["amount_usd"] * @policy[o["category"]]["percent"][tier] / 100, else: 0.0
  end

  # Convert per order and round at the end, exactly as `convert` would on the summed USD.
  defp money(usd, cid) do
    cur = @currency[@customers[cid]["country"]]
    :erlang.float_to_binary(round2(usd * @usd_to[cur]), decimals: 2) <> " " <> cur
  end

  # ─── scoring ────────────────────────────────────────────────────────

  @doc """
  1.0 when the answer means the same value as the key, else 0.0.

  Lenient about form, strict about value: `73.6 eur`, `€73.60` and
  `73.60 EUR` all match `73.60 EUR`, but `73.59 EUR` and `73.60 USD` do not.
  """
  def score(expected, got) when is_binary(got) do
    case {canon(expected), canon(got)} do
      {{:money, a, cur}, {:money, b, cur}} -> if abs(a - b) <= 0.011, do: 1.0, else: 0.0
      {same, same} -> 1.0
      _ -> 0.0
    end
  end

  def score(_expected, _got), do: 0.0

  def canon(s) do
    s =
      s
      |> String.downcase()
      |> String.replace("€", " eur ")
      |> String.replace("£", " gbp ")
      |> String.replace("$", " usd ")
      |> String.replace(~r/[`*,]/, "")
      |> String.trim()

    cond do
      m = Regex.run(~r/\bo-\d+\b/, s) -> {:order, hd(m)}
      m = Regex.run(~r/^(yes|no)\b/, s) -> {:bool, Enum.at(m, 1)}
      m = Regex.run(~r/(usd|eur|gbp)?\s*(\d+(?:\.\d+)?)\s*(usd|eur|gbp)?/, s) ->
        cur = Enum.find([Enum.at(m, 1), Enum.at(m, 3)], &(&1 not in [nil, ""]))
        v = Float.round(num(Enum.at(m, 2)), 2)
        if cur, do: {:money, v, cur}, else: {:num, v}
      true -> {:text, s}
    end
  end

  # ─── helpers ────────────────────────────────────────────────────────

  defp obj(props, required), do: %{"type" => "object", "properties" => props, "required" => required}
  defp round2(x), do: Float.round(x * 1.0, 2)
  defp num(n) when is_number(n), do: n * 1.0

  defp num(n) when is_binary(n) do
    case Float.parse(String.trim(n)) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  defp num(_), do: 0.0
end
