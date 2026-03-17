FROM node:22-slim

# System deps: git, bash, python3 (for PDS scripts), build tools for node-pty
RUN apt-get update && apt-get install -y \
    git \
    bash \
    python3 \
    python3-pip \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Create workspace
RUN mkdir -p /home/coder/workspace && chown -R node:node /home/coder
WORKDIR /home/coder

# Copy PTY server
COPY package.json /home/coder/package.json
COPY server.js /home/coder/server.js

# Install server deps
RUN npm install --production

# Run as non-root
USER node

EXPOSE 8080

CMD ["node", "server.js"]
