FROM node:22-slim

# System deps: git, bash, python3, build tools for node-pty, curl for R2 sync
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

# Create workspace and config dirs
RUN mkdir -p /home/coder/workspace /home/coder/.claude && chown -R node:node /home/coder
WORKDIR /home/coder

# Copy server files
COPY package.json /home/coder/package.json
COPY server.js /home/coder/server.js
COPY startup.sh /home/coder/startup.sh

# Install server deps
RUN npm install --production

# Make startup executable
RUN chmod +x /home/coder/startup.sh

# Run as non-root
USER node

EXPOSE 8080

CMD ["/home/coder/startup.sh"]
