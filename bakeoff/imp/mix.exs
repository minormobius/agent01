defmodule ImpBench.MixProject do
  use Mix.Project

  def project do
    [
      app: :imp_bench,
      version: "0.1.0",
      elixir: "~> 1.19",
      start_permanent: false,
      deps: [{:imp, "~> 0.5.0"}]
    ]
  end

  def application, do: [extra_applications: [:logger]]
end
