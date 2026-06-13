"""LLM client — local llama.cpp or OpenRouter, unified interface.

Generation backend (pick one):
  - Local (default): Qwen3 via llama.cpp on LLM_BASE_URL (:8080)
  - OpenRouter: set OPENROUTER_API_KEY in .env; set OPENROUTER_MODEL to taste
    (default: qwen/qwen3-235b-a22b). The key's presence is the switch.

Embeddings always use the local nomic-embed-text server on EMBED_BASE_URL (:8081).

Thinking: local uses llama.cpp's chat_template_kwargs enable_thinking flag.
OpenRouter uses the `reasoning` param: think=True caps at OPENROUTER_THINK_BUDGET
tokens (default 2000, env: OPENROUTER_THINK_BUDGET); think=False excludes it.
"""

import json
import os
import re

import requests
from dotenv import load_dotenv

load_dotenv()

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:8080")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen")
EMBED_BASE_URL = os.environ.get("EMBED_BASE_URL", "http://localhost:8081")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text-v1.5")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "qwen/qwen3-235b-a22b")
# Cap reasoning tokens on OpenRouter to prevent the model from drafting its
# full JSON response in the thinking stream and exhausting max_tokens.
OPENROUTER_THINK_BUDGET = int(os.environ.get("OPENROUTER_THINK_BUDGET", "2000"))

DEFAULT_TIMEOUT = 600  # local generation can be slow; be patient

# Global dev kill-switch: when truthy, ALWAYS skip thinking regardless of the
# per-call think= argument. Lets you force fast generation across the whole app.
SKIP_THINKING = os.environ.get("LLM_SKIP_THINKING", "").strip().lower() in (
    "1", "true", "yes", "on",
)

# When True (or LLM_VERBOSE set), print every prompt/response to/from the model.
# Set programmatically (lib.llm.VERBOSE = True) or via env. For demos/debugging.
VERBOSE = os.environ.get("LLM_VERBOSE", "").strip().lower() in ("1", "true", "yes", "on")

GENERATOR_PERSONA = " Adopt a narrative style that blends introspective philosophical reflection with vivid, visceral storytelling. Use recherché vocabulary beyond typical archaisms and complex sentence structures to create an immersive, contemplative tone. Add linguistic depth and mystique without repetition. Explore themes of identity, loyalty, and the subtle mechanisms of power through a deeply personal narrative lens. Craft sentences that weave intricate linguistic tapestries from verified truths, revealing profound insights. Deploy linguistic artifacts evoking timelessness—true obscurities, not common archaisms. DO NOT WRITE A LOT OR RAMBLE--brevity is the soul of wit. "

# The persona belongs in the system role, not glued onto each task prompt. It is also
# scoped to PROSE ONLY: the generators emit structured JSON, and the florid style must
# touch free-prose fields (description / dialogue `says` / narrative `response`) without
# bleeding into machine-read fields (name, tags, world_refs, requires, mechanics, slot
# keys), which must stay plain and literal so the gate/dispatch can match them.
GENERATOR_SYSTEM = (
    "You are the prose engine for a dark, mysterious, and dreamy game world. The voice below "
    "applies ONLY to free-prose fields — descriptions, dialogue lines (`says`/`text`), "
    "and narrative responses. NEVER let it touch structured fields (name, tags, "
    "world_refs, requires, mechanics, slots, ids): those stay plain, literal, and "
    "machine-clean." + GENERATOR_PERSONA
)

def _trace(label: str, text: str) -> None:
    if VERBOSE:
        bar = "─" * 22
        print(f"\n{bar} {label} {bar}\n{text}\n{'─' * (46 + len(label))}")


def call_llm(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 9600,
    think: bool = False,
) -> str:
    """Single-turn chat completion. Returns the assistant `content` string.

    Pass system= to set a system-role message (e.g. GENERATOR_SYSTEM for the prose
    persona); the task instructions stay in `prompt`. Reasoning is OFF by default
    (faster, cleaner JSON). Pass think=True for tasks where deliberation helps
    (e.g. tier labeling, cascade triage). The switch is Qwen3's `enable_thinking`
    chat-template flag, honored by llama.cpp --jinja. The LLM_SKIP_THINKING env var
    force-disables thinking everywhere (dev speed).
    """
    if SKIP_THINKING:
        think = False
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    if OPENROUTER_API_KEY:
        url = f"{OPENROUTER_BASE_URL}/chat/completions"
        headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}"}
        model = OPENROUTER_MODEL
        extra = {
            "reasoning": {"max_tokens": OPENROUTER_THINK_BUDGET} if think else {"exclude": True}
        }
    else:
        url = f"{LLM_BASE_URL}/v1/chat/completions"
        headers = {}
        model = LLM_MODEL
        extra = {} if think else {"chat_template_kwargs": {"enable_thinking": False}}

    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
        **extra,
    }
    _trace(f"PROMPTING (think={think}, openrouter={bool(OPENROUTER_API_KEY)})...", prompt[:300])
    resp = requests.post(url, json=body, headers=headers, timeout=DEFAULT_TIMEOUT)
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    _trace("RESPONSE", content)
    return content


def call_llm_json(prompt: str, *, think: bool = False, **kwargs):
    """Call the LLM and parse its response as JSON, tolerating common slop.

    Handles: markdown fences, leading prose before the JSON, and reasoning text
    that leaked into content. Raises ValueError if no JSON can be recovered.
    """
    raw = call_llm(prompt, think=think, **kwargs)
    return _extract_json(raw)


def _extract_json(raw: str):
    text = raw.strip()
    # Strip ```json ... ``` fences if present.
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # Remove stray newlines inside JSON string tokens. The model sometimes generates
    # `"\nkey"` or `"\n"key"` (with a spurious extra quote), both invalid JSON.
    text = re.sub(r'"[^\S\n]*\n[^\S\n]*"?', '"', text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fall back to the first balanced array/object in the string.
    for open_ch, close_ch in (("[", "]"), ("{", "}")):
        start = text.find(open_ch)
        end = text.rfind(close_ch)
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError(f"Could not parse JSON from LLM response:\n{raw[:500]}")


def embed_text(text: str) -> list[float]:
    """Return a 768-dim embedding for `text` via the embedding server."""
    resp = requests.post(
        f"{EMBED_BASE_URL}/v1/embeddings",
        json={"model": EMBED_MODEL, "input": text},
        timeout=DEFAULT_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def health() -> dict:
    """Quick reachability check. Used by setup scripts."""
    status = {}
    if OPENROUTER_API_KEY:
        status["llm"] = f"openrouter ({OPENROUTER_MODEL})"
    else:
        try:
            r = requests.get(f"{LLM_BASE_URL}/v1/models", timeout=3)
            status["llm"] = "up" if r.ok else f"http {r.status_code}"
        except requests.RequestException as e:
            status["llm"] = f"down ({type(e).__name__})"
    try:
        r = requests.get(f"{EMBED_BASE_URL}/v1/models", timeout=3)
        status["embed"] = "up" if r.ok else f"http {r.status_code}"
    except requests.RequestException as e:
        status["embed"] = f"down ({type(e).__name__})"
    return status


if __name__ == "__main__":
    print(health())
