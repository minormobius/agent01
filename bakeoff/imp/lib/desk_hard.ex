defmodule ImpBench.DeskHard do
  @moduledoc """
  The `desk_hard` task: the refund desk with the rules that trip agents up.

  `desk` (imp-01) was at ceiling for both DeepSeek models on the first run, so
  it cannot show what an optimizer adds. This world keeps the same shape (the
  agent sees it only through tools; `solve/1` computes the key from the same
  data) and adds the traps a real policy has:

  - **Policy versions.** Orders placed before 2026-09-01 fall under policy v1,
    later ones under v2, and v2 changed the windows: electronics 30 → 21 days,
    furniture 30 → 45. Using today's policy for an August order is wrong in
    both directions (P-205 is refundable only under v1, P-213 only under v2).
  - **The window runs from delivery**, not from the order date.
  - **Undelivered orders cancel for 100%**, whatever the tier, window or fee.
  - **Opened electronics carry a restocking fee**, subtracted after the tier
    percent (15% of the price under v1, 10% under v2).
  - **Scans.** Some questions need `list_customers` and every customer's orders.
  - Five currencies, including JPY at 149.5.

  Every question carries a `why`: the reference solver's derivation, which is
  the feedback GEPA's reflection model reads for the train and validation rows.
  """

  @today ~D[2026-09-27]
  @v2_from ~D[2026-09-01]

  @customers [
    %{
      "id" => "H1",
      "email" => "ana@example.com",
      "name" => "Ana Ruiz",
      "tier" => "gold",
      "country" => "ES"
    },
    %{
      "id" => "H2",
      "email" => "ben@example.com",
      "name" => "Ben Okafor",
      "tier" => "standard",
      "country" => "GB"
    },
    %{
      "id" => "H3",
      "email" => "chen@example.com",
      "name" => "Chen Wei",
      "tier" => "standard",
      "country" => "US"
    },
    %{
      "id" => "H4",
      "email" => "dara@example.com",
      "name" => "Dara Kim",
      "tier" => "gold",
      "country" => "US"
    },
    %{
      "id" => "H5",
      "email" => "emil@example.com",
      "name" => "Emil Brandt",
      "tier" => "platinum",
      "country" => "DE"
    },
    %{
      "id" => "H6",
      "email" => "fumi@example.com",
      "name" => "Fumi Sato",
      "tier" => "standard",
      "country" => "JP"
    },
    %{
      "id" => "H7",
      "email" => "gus@example.com",
      "name" => "Gus Hale",
      "tier" => "platinum",
      "country" => "GB"
    },
    %{
      "id" => "H8",
      "email" => "hana@example.com",
      "name" => "Hana Mori",
      "tier" => "gold",
      "country" => "JP"
    }
  ]

  # delivered: nil means not delivered yet (status "shipped").
  @orders [
            {"P-201", "H1", "2026-08-20", "2026-08-25", "electronics", 300.0, "delivered", true},
            {"P-202", "H1", "2026-09-05", "2026-09-09", "electronics", 400.0, "delivered", true},
            {"P-203", "H2", "2026-09-12", "2026-09-15", "apparel", 120.0, "delivered", false},
            {"P-204", "H2", "2026-09-20", nil, "furniture", 700.0, "shipped", false},
            {"P-205", "H3", "2026-08-29", "2026-09-02", "electronics", 250.0, "delivered", false},
            {"P-206", "H3", "2026-09-01", "2026-09-04", "electronics", 250.0, "delivered", false},
            {"P-207", "H4", "2026-09-02", "2026-09-10", "furniture", 1200.0, "delivered", false},
            {"P-208", "H4", "2026-09-15", "2026-09-19", "books", 40.0, "returned", false},
            {"P-209", "H5", "2026-09-08", "2026-09-12", "electronics", 900.0, "delivered", true},
            {"P-210", "H5", "2026-07-30", "2026-08-03", "apparel", 200.0, "delivered", false},
            {"P-211", "H6", "2026-09-14", "2026-09-16", "books", 30.0, "delivered", false},
            {"P-212", "H6", "2026-09-10", "2026-09-11", "books", 60.0, "delivered", false},
            {"P-213", "H7", "2026-08-15", "2026-08-20", "furniture", 1500.0, "delivered", false},
            {"P-214", "H7", "2026-09-18", nil, "electronics", 600.0, "shipped", true},
            {"P-215", "H8", "2026-09-03", "2026-09-06", "electronics", 350.0, "delivered", true},
            {"P-216", "H8", "2026-09-21", "2026-09-24", "apparel", 80.0, "delivered", false}
          ]
          |> Enum.map(fn {id, c, od, dd, cat, usd, st, opened} ->
            {id,
             %{
               "id" => id,
               "customer_id" => c,
               "order_date" => od,
               "delivered_date" => dd,
               "category" => cat,
               "amount_usd" => usd,
               "status" => st,
               "opened" => opened
             }}
          end)
          |> Map.new()

  @policy %{
    "v1" => %{
      "electronics" => {30, %{"standard" => 90, "gold" => 100, "platinum" => 100}, 15},
      "apparel" => {60, %{"standard" => 100, "gold" => 100, "platinum" => 100}, 0},
      "books" => {14, %{"standard" => 100, "gold" => 100, "platinum" => 100}, 0},
      "furniture" => {30, %{"standard" => 80, "gold" => 90, "platinum" => 100}, 0}
    },
    "v2" => %{
      "electronics" => {21, %{"standard" => 90, "gold" => 100, "platinum" => 100}, 10},
      "apparel" => {60, %{"standard" => 100, "gold" => 100, "platinum" => 100}, 0},
      "books" => {14, %{"standard" => 100, "gold" => 100, "platinum" => 100}, 0},
      "furniture" => {45, %{"standard" => 85, "gold" => 90, "platinum" => 100}, 0}
    }
  }

  @currency %{"ES" => "EUR", "DE" => "EUR", "GB" => "GBP", "US" => "USD", "JP" => "JPY"}
  @usd_to %{"USD" => 1.0, "EUR" => 0.92, "GBP" => 0.79, "JPY" => 149.5}

  @instructions """
  You work a customer refund desk. You can only learn about customers, orders
  and policy through the tools; never guess a value you could look up.

  Give only the final value in `answer`: a money amount like `331.20 EUR`, an
  order id like `P-204`, an email, a count like `2`, or `yes` / `no`. Money is
  in the customer's local currency, rounded to 2 decimals. A refund for an
  order that is not eligible is `0.00` in the local currency.
  """

  def instructions, do: @instructions

  # ─── tools ──────────────────────────────────────────────────────────

  def tools do
    [
      Imp.tool(
        :find_customer,
        "Look up a customer by email. Returns id, name, tier and country.",
        fn %{"email" => email} ->
          Enum.find(
            @customers,
            %{"error" => "no customer with that email"},
            &(&1["email"] == email |> String.trim() |> String.downcase())
          )
        end, schema: obj(%{"email" => %{"type" => "string"}}, ["email"])),
      Imp.tool(
        :list_customers,
        "List every customer: id, email, tier and country.",
        fn _ ->
          %{"customers" => Enum.map(@customers, &Map.take(&1, ~w(id email tier country)))}
        end, schema: obj(%{}, [])),
      Imp.tool(
        :list_orders,
        "List a customer's order ids, oldest first.",
        fn %{"customer_id" => id} -> %{"order_ids" => order_ids(String.trim(id))} end,
        schema: obj(%{"customer_id" => %{"type" => "string"}}, ["customer_id"])
      ),
      Imp.tool(
        :get_order,
        "Read one order: customer, order date, delivery date (null if not delivered yet), category, price in USD, status, and whether the item was opened.",
        fn %{"order_id" => id} ->
          Map.get(@orders, String.trim(id), %{"error" => "no such order"})
        end,
        schema: obj(%{"order_id" => %{"type" => "string"}}, ["order_id"])
      ),
      Imp.tool(
        :refund_policy,
        "The refund policy that governs an order, from its category, the customer's tier and the ORDER date. " <>
          "Returns the policy version, the refund window in days (counted from delivery), the percent of the price refunded, " <>
          "and the restocking fee (percent of the price) charged when the item was opened. " <>
          "An order not yet delivered can always be cancelled for 100% of its price with no fee.",
        fn %{"category" => cat, "tier" => tier, "order_date" => od} ->
          with {:ok, d} <- Date.from_iso8601(String.trim(od)),
               v = version(d),
               {window, pct, fee} <- @policy[v][cat] || :no_category,
               p when is_integer(p) <- pct[tier] || :no_tier do
            %{
              "version" => v,
              "category" => cat,
              "tier" => tier,
              "window_days" => window,
              "percent" => p,
              "restocking_fee_percent_if_opened" => fee
            }
          else
            :no_category -> %{"error" => "no policy for that category"}
            :no_tier -> %{"error" => "unknown tier"}
            _ -> %{"error" => "order_date must be YYYY-MM-DD"}
          end
        end,
        schema:
          obj(
            %{
              "category" => %{
                "type" => "string",
                "enum" => ~w(electronics apparel books furniture)
              },
              "tier" => %{"type" => "string", "enum" => ~w(standard gold platinum)},
              "order_date" => %{"type" => "string"}
            },
            ["category", "tier", "order_date"]
          )
      ),
      Imp.tool(
        :days_since,
        "Days from a date (YYYY-MM-DD) to today.",
        fn %{"date" => date} ->
          case Date.from_iso8601(String.trim(date)) do
            {:ok, d} -> %{"today" => Date.to_iso8601(@today), "days" => Date.diff(@today, d)}
            _ -> %{"error" => "date must be YYYY-MM-DD"}
          end
        end, schema: obj(%{"date" => %{"type" => "string"}}, ["date"])),
      Imp.tool(
        :convert,
        "Convert a USD amount to USD, EUR, GBP or JPY (or pass a country code for its currency).",
        fn args ->
          to = args["to"] |> to_string() |> String.trim() |> String.upcase()
          to = Map.get(@currency, to, to)

          case @usd_to[to] do
            nil ->
              %{"error" => "unknown currency"}

            rate ->
              %{
                "amount" => Float.round(num(args["amount_usd"]) * rate, 2),
                "currency" => to,
                "rate" => rate
              }
          end
        end,
        schema:
          obj(%{"amount_usd" => %{"type" => "number"}, "to" => %{"type" => "string"}}, [
            "amount_usd",
            "to"
          ])
      )
    ]
  end

  # ─── questions ──────────────────────────────────────────────────────

  def questions do
    order_ids = @orders |> Map.keys() |> Enum.sort()

    refund_q =
      for id <- order_ids do
        c = customer(@orders[id]["customer_id"])

        {"How much would #{c["email"]} be refunded for order #{id}, in their local currency?",
         {:refund, id}}
      end

    eligible_q =
      for id <- ~w(P-201 P-205 P-206 P-212 P-213 P-214 P-215 P-208) do
        {"Is order #{id} eligible for a refund today? Answer yes or no.", {:eligible, id}}
      end

    total_q =
      for c <- @customers do
        {"What is the total refund #{c["email"]} could get right now across all their orders, in their local currency?",
         {:total, c["id"]}}
      end

    scan_q = [
      {"Which customer could get the largest total refund right now, measured in USD? Answer with their email.",
       :largest},
      {"How many platinum customers have at least one order eligible for a refund today?",
       :platinum_with_eligible},
      {"How many orders across all customers are eligible for a refund today?", :all_eligible},
      {"Which single order would refund the most right now, measured in USD? Answer with the order id.",
       :largest_order}
    ]

    (refund_q ++ eligible_q ++ total_q ++ scan_q)
    |> Enum.with_index(1)
    |> Enum.map(fn {{q, key}, i} ->
      {answer, why} = solve(key)

      %{
        id: "h#{String.pad_leading("#{i}", 2, "0")}",
        question: q,
        answer: answer,
        why: why,
        key: key
      }
    end)
  end

  @doc "Deterministic three-way split: train (i ≡ 1 mod 4), validation (i ≡ 3 mod 4), test (the rest)."
  def split do
    qs = questions()
    by = fn r -> Enum.filter(qs, &(rem(idx(&1), 4) == r)) end
    {by.(1), by.(3), Enum.filter(qs, &(rem(idx(&1), 4) in [0, 2]))}
  end

  defp idx(%{id: "h" <> n}), do: String.to_integer(n)

  # ─── the reference solver ───────────────────────────────────────────

  def solve({:refund, id}) do
    {usd, why} = refund_usd(id)
    cid = @orders[id]["customer_id"]
    {money(usd, cid), why <> " → " <> money(usd, cid)}
  end

  def solve({:eligible, id}) do
    {usd, why} = refund_usd(id)
    {if(eligible?(id), do: "yes", else: "no"), "#{why} (refund #{fmt(usd)} USD)"}
  end

  def solve({:total, cid}) do
    parts = for id <- order_ids(cid), do: {id, refund_usd(id)}
    usd = parts |> Enum.map(fn {_, {u, _}} -> u end) |> Enum.sum()
    why = Enum.map_join(parts, "; ", fn {id, {u, w}} -> "#{id}: #{w} = #{fmt(u)} USD" end)
    {money(usd, cid), "#{why}. Sum #{fmt(usd)} USD → #{money(usd, cid)}"}
  end

  def solve(:largest) do
    totals =
      for c <- @customers,
          do:
            {c["email"],
             c["id"] |> order_ids() |> Enum.map(&elem(refund_usd(&1), 0)) |> Enum.sum()}

    {email, _} = Enum.max_by(totals, &elem(&1, 1))
    {email, "USD totals: " <> Enum.map_join(totals, ", ", fn {e, u} -> "#{e} #{fmt(u)}" end)}
  end

  def solve(:platinum_with_eligible) do
    plats = Enum.filter(@customers, &(&1["tier"] == "platinum"))
    hits = Enum.filter(plats, fn c -> c["id"] |> order_ids() |> Enum.any?(&eligible?/1) end)

    {"#{length(hits)}",
     "platinum: " <>
       Enum.map_join(
         plats,
         ", ",
         &"#{&1["email"]} #{if &1 in hits, do: "has one", else: "has none"}"
       )}
  end

  def solve(:all_eligible) do
    ids = @orders |> Map.keys() |> Enum.sort() |> Enum.filter(&eligible?/1)
    {"#{length(ids)}", "eligible: " <> Enum.join(ids, ", ")}
  end

  def solve(:largest_order) do
    refunds = for id <- @orders |> Map.keys() |> Enum.sort(), do: {id, elem(refund_usd(id), 0)}
    {id, _} = Enum.max_by(refunds, &elem(&1, 1))
    {id, "USD refunds: " <> Enum.map_join(refunds, ", ", fn {i, u} -> "#{i} #{fmt(u)}" end)}
  end

  @doc "Check that the question set has no ties where an answer is 'the one with the most'."
  def unambiguous? do
    totals =
      for c <- @customers,
          do: c["id"] |> order_ids() |> Enum.map(&elem(refund_usd(&1), 0)) |> Enum.sum()

    refunds = for id <- Map.keys(@orders), do: elem(refund_usd(id), 0)
    top2 = fn xs -> xs |> Enum.sort(:desc) |> Enum.take(2) end
    [a, b] = top2.(totals)
    [x, y] = top2.(refunds)
    a != b and x != y
  end

  defp version(date), do: if(Date.compare(date, @v2_from) == :lt, do: "v1", else: "v2")

  # Every eligible order in this world refunds a positive amount, so this is exact.
  defp eligible?(id), do: elem(refund_usd(id), 0) > 0

  defp refund_usd(id) do
    o = @orders[id]
    tier = customer(o["customer_id"])["tier"]
    od = Date.from_iso8601!(o["order_date"])
    v = version(od)
    {window, pcts, fee} = @policy[v][o["category"]]
    pct = pcts[tier]
    price = o["amount_usd"]

    cond do
      o["status"] in ["returned", "cancelled"] ->
        {0.0, "#{id} was #{o["status"]}: not eligible"}

      o["delivered_date"] == nil ->
        {price, "#{id} not delivered yet: cancels for 100% of #{fmt(price)}"}

      true ->
        days = Date.diff(@today, Date.from_iso8601!(o["delivered_date"]))

        if days > window do
          {0.0,
           "#{id} ordered #{o["order_date"]} → policy #{v}; #{o["category"]} window #{window} days from delivery; delivered #{days} days ago: not eligible"}
        else
          fee_usd = if o["opened"] and fee > 0, do: price * fee / 100, else: 0.0
          usd = price * pct / 100 - fee_usd

          fee_txt =
            if fee_usd > 0, do: " minus #{fee}% restocking (opened) #{fmt(fee_usd)}", else: ""

          {usd,
           "#{id} ordered #{o["order_date"]} → policy #{v}; delivered #{days} days ago, within #{window}; " <>
             "#{tier} #{pct}% of #{fmt(price)}#{fee_txt}"}
        end
    end
  end

  defp customer(id), do: Enum.find(@customers, &(&1["id"] == id))

  defp order_ids(cid),
    do:
      @orders
      |> Map.values()
      |> Enum.filter(&(&1["customer_id"] == cid))
      |> Enum.sort_by(& &1["order_date"])
      |> Enum.map(& &1["id"])

  defp money(usd, cid) do
    cur = @currency[customer(cid)["country"]]
    :erlang.float_to_binary(Float.round(usd * @usd_to[cur], 2), decimals: 2) <> " " <> cur
  end

  defp fmt(x), do: :erlang.float_to_binary(x * 1.0, decimals: 2)

  # ─── scoring, with feedback GEPA can learn from ─────────────────────

  @doc "Metric for Imp: score plus feedback naming the rule the answer broke."
  def metric do
    fn example, prediction ->
      expected = Imp.Example.get(example, :answer)
      got = prediction |> Imp.get(:answer) |> to_string()
      score = ImpBench.Desk.score(expected, got)

      feedback =
        if score == 1.0,
          do: "Correct.",
          else:
            "Wrong: answered #{inspect(got)}, the right answer is #{expected}. Derivation: #{Imp.Example.get(example, :why)}"

      %{score: score, feedback: feedback}
    end
  end

  def examples(rows),
    do:
      Enum.map(
        rows,
        &(Imp.example(%{question: &1.question, answer: &1.answer, why: &1.why})
          |> Imp.with_inputs([:question]))
      )

  # ─── helpers ────────────────────────────────────────────────────────

  defp obj(props, required),
    do: %{"type" => "object", "properties" => props, "required" => required}

  defp num(n) when is_number(n), do: n * 1.0

  defp num(n) when is_binary(n) do
    case Float.parse(String.trim(n)) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  defp num(_), do: 0.0
end
