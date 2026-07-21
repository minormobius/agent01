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

# Install Claude Code + GitHub MCP server globally
RUN npm install -g @anthropic-ai/claude-code @modelcontextprotocol/server-github

# uv — fast Python package/project manager (pip/venv/pipx/poetry replacement).
# Installs over HTTPS, so it works within Cloudflare Containers' HTTP/HTTPS-only
# egress. 10–100x faster cold installs, which matters on ephemeral container disk
# where the agent re-installs often. `uv pip`, `uv venv`, `uv run` all available;
# system pip stays for compatibility. (Pin the tag for reproducibility.)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Create workspace and config dirs
RUN mkdir -p /home/coder/workspace /home/coder/.claude && chown -R node:node /home/coder
WORKDIR /home/coder

# Copy server files
COPY package.json /home/coder/package.json
COPY server.js /home/coder/server.js
COPY startup.sh /home/coder/startup.sh

# Agent launcher — runs Claude Code against any AGENT_PROFILES model profile
# (kimi3 = Moonshot Anthropic-compatible endpoint; see agent.sh)
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
