FROM node:22-slim

# System deps: git, bash, python3, build tools for node-pty, curl for workspace sync
RUN apt-get update && apt-get install -y \
    git \
    bash \
    python3 \
    python3-pip \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Agent harnesses + GitHub MCP server, installed globally.
#
# TWO harnesses, deliberately: this container is a cross-model AND cross-harness
# testing platform, and a comparison across models is only meaningful if the
# agent loop is a controlled variable you can also change. Claude Code drives
# any Anthropic-Messages endpoint; OpenCode drives any OpenAI-Chat-Completions
# endpoint via @ai-sdk/openai-compatible. Between them every profile in
# AGENT_PROFILES is runnable under two independent agent loops. See agent.sh.
#
# THREE harnesses now. Codex is the odd one: it speaks only the OpenAI
# Responses API (it removed Chat Completions in 0.154), so it cannot drive the
# open models at all — it exists here for the ChatGPT-subscription cell, which
# it reaches through os-api's own /openai proxy rather than through OpenAI
# directly. It is a ~324 MB static musl binary, easily the largest thing in
# this image. See os/api/CODEX.md.
RUN npm install -g \
      @anthropic-ai/claude-code \
      opencode-ai \
      @openai/codex \
      @modelcontextprotocol/server-github

# uv — fast Python package/project manager (pip/venv/pipx/poetry replacement).
# Installs over HTTPS, so it works within Cloudflare Containers' HTTP/HTTPS-only
# egress. 10–100x faster cold installs, which matters on ephemeral container disk
# where the agent re-installs often. `uv pip`, `uv venv`, `uv run` all available;
# system pip stays for compatibility. (Pin the tag for reproducibility.)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Create workspace and config dirs. .opencode-cells holds one isolated
# XDG_CONFIG_HOME/XDG_DATA_HOME per model profile (agent.sh) so two profiles
# never share a config file or a session store.
RUN mkdir -p /home/coder/workspace /home/coder/.claude /home/coder/.opencode-cells \
    && chown -R node:node /home/coder
WORKDIR /home/coder

# Copy server files
COPY package.json /home/coder/package.json
COPY server.js /home/coder/server.js
COPY startup.sh /home/coder/startup.sh

# Agent launcher — runs any (harness, model-profile) cell from AGENT_PROFILES:
# `agent --harness=opencode ds4-flash`. See agent.sh.
COPY agent.sh /usr/local/bin/agent
RUN chmod +x /usr/local/bin/agent

# Install server deps
RUN npm install --production

# Make startup executable
RUN chmod +x /home/coder/startup.sh

# Run as non-root
USER node

EXPOSE 8080

CMD ["/home/coder/startup.sh"]
