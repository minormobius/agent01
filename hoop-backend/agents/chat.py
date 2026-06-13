"""Interactive REPL for a player agent. Type messages; the narrator replies.

Usage:  .venv/bin/python -m agents.chat [player_id]
Commands: /quit to exit, /think <msg> to allow reasoning for one turn,
          /reset to clear the agent's in-context message history.
"""

import sys

from agents.letta_client import clear_message_history, send_message
from agents.player_agent import get_or_create_player_agent


def main():
    pid = sys.argv[1] if len(sys.argv) > 1 else "letta_demo"
    agent_id = get_or_create_player_agent(pid)
    print(f"\nPlayer agent ready ({pid} -> {agent_id}).")
    print("Type to play. /quit, /reset, or /think <msg> for one reasoning turn.\n")

    while True:
        try:
            line = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        if line in ("/quit", "/exit"):
            break
        if line == "/reset":
            clear_message_history(agent_id)
            print("(history cleared)\n")
            continue

        no_think = True
        if line.startswith("/think "):
            no_think = False
            line = line[len("/think "):]

        reply = send_message(agent_id, line, no_think=no_think)
        print(f"\n{reply}\n")


if __name__ == "__main__":
    main()
