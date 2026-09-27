# Patch Imp 0.5.0's GEPA safety-error walker to tolerate improper lists.
#
#   elixir patch_imp.exs deps/imp      # then: mix deps.compile imp --force
#
# Imp.Optimizer.GEPA.Engine and .ProgramAdapter both define
# find_operational_safety/1, which walks every term GEPA collects (after each
# batch, all trajectories) looking for an Imp.OperationalSafetyError. Its list
# clause is `when is_list(list)` -> Enum.find_value/2, and is_list/1 is true for
# an improper list, which Enum.find_value/2 cannot walk: it raises
# FunctionClauseError in Enum.find_value_list/3 and GEPA dies. Real provider
# data carries such a term (imp-02 and imp-03 both died this way against
# DeepSeek); a metric whose metadata holds `["a" | "b"]` reproduces it with no
# model at all.
#
# The replacement walks cons cells, so an improper tail reaches the catch-all
# clause and is ignored. Idempotent; fails loudly if the source no longer
# contains the clause it expects, so a new Imp release cannot be silently
# left unpatched or wrongly patched.
[dir] = System.argv()

old = """
  defp find_operational_safety(list) when is_list(list),
    do: Enum.find_value(list, &find_operational_safety/1)
"""

new = """
  # patched by bakeoff/imp/patch_imp.exs: walk cons cells so an improper list
  # (is_list/1 is true for one) cannot crash Enum.find_value/2.
  defp find_operational_safety([head | tail]),
    do: find_operational_safety(head) || find_operational_safety(tail)

  defp find_operational_safety([]), do: nil
"""

for file <- ~w(lib/imp/optimizer/gepa/engine.ex lib/imp/optimizer/gepa/program_adapter.ex) do
  path = Path.join(dir, file)
  src = File.read!(path)

  cond do
    String.contains?(src, new) ->
      IO.puts("already patched: #{file}")

    String.contains?(src, old) ->
      File.write!(path, String.replace(src, old, new))
      IO.puts("patched: #{file}")

    true ->
      raise "#{file}: the find_operational_safety/1 list clause is not what this patch expects; re-check it against Imp's source before running GEPA"
  end
end
