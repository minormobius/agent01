# Design C — verification findings

Re-run of `CODEX.md` §7.1–7.2 from the sandbox, 2026-09-16, on branch
`claude/codex-containers-research-58t9ad`. No fixes attempted; this is a
report only.

## §7.1 — codex harness against the local mock

    node os/api/container/mock-openai.mjs &                       # :8899
    AGENT_PROFILES='{"mock":{"respBase":"http://127.0.0.1:8899/v1","model":"mock-model","key":"cap-token-stand-in"}}' \
      agent --harness=codex mock exec --skip-git-repo-check "say hi"

**The turn completed.** Output (trimmed):

    [agent] harness=codex profile=mock model=mock-model base=http://127.0.0.1:8899/v1
    OpenAI Codex v0.154.0
    model: mock-model
    user
    say hi
    warning: Model metadata for `mock-model` not found. Defaulting to fallback metadata...
    codex
    pong from the mock — the codex harness reached its provider
    tokens used
    2

The authorization line the mock logged for the `POST /v1/responses`:

    authorization: Bearer cap-token-stand-i…  (25 chars)

Wire keys observed (identical to the set CODEX.md records from the original
verification against codex 0.154.0):

    model,instructions,input,tools,tool_choice,parallel_tool_calls,reasoning,store,stream,include,prompt_cache_key,client_metadata

**PASS** — the container sends the capability token, never a credential.
(The mock's startup `GET /` health-check line logged `authorization: (none)…
(6 chars)`, which is expected — that request carries no header.)

## §7.2 — the worker route, before any credential exists

No token → **401**, as expected:

    $ curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://os-api.mino.mobi/openai/v1/responses -d '{}'
    401

With `Authorization: Bearer $CAP_TOKEN` (var is set in this container) →
**503 no_credential**, as expected:

    $ curl -sS -H "Authorization: Bearer $CAP_TOKEN" -X POST https://os-api.mino.mobi/openai/v1/responses -d '{}'
    {"error":{"message":"os-api: no_credential","type":"os_api_credential"}}
    status: 503

**PASS** — the capability gate works and the failure names itself.

## `agent` with no arguments

    usage: agent [--harness=claude|opencode|codex] <profile> [harness args...]

    harnesses:
      claude (installed)
      opencode (installed)
      codex (installed)

    profiles:
      kimi3      kimi-k3              @ https://api.moonshot.ai/anthropic
                 runs under: claude,opencode
      ds4-flash  deepseek-v4-flash    @ https://api.deepseek.com/anthropic
                 runs under: claude,opencode
      ds4-pro    deepseek-v4-pro      @ https://api.deepseek.com/anthropic
                 runs under: claude,opencode
      claude     (default model)      @ api.anthropic.com (native)
                 runs under: claude   [NO KEY CONFIGURED]
      gpt5       gpt-5.3-codex        @ https://os-api.mino.mobi/openai/v1
                 runs under: codex

## Summary

| Check | Expected | Observed | Result |
|---|---|---|---|
| §7.1 mock turn completes | yes | yes, codex 0.154.0 | PASS |
| §7.1 capability token on the wire | `Bearer cap-token-stand-i…` | exactly that, 25 chars | PASS |
| §7.2 no token | 401 | 401 | PASS |
| §7.2 token, no credential | 503 `no_credential` | 503 `{"error":{"message":"os-api: no_credential","type":"os_api_credential"}}` | PASS |

§7.3 (the step that needs a real browser for `codex login`) was not run — it
is bot-walled from container egress by design, per CODEX.md.
