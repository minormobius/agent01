"""Tiny structured logging layer shared across the engine.

One configured logger tree ("world.*") that writes timestamped, component-tagged
lines to stdout — so the API process and the poller process each emit a readable,
greppable stream you can watch side by side during an end-to-end run.

Verbosity via env: WORLD_LOG_LEVEL=DEBUG|INFO|WARNING (default INFO). DEBUG turns on
the chattier per-candidate / per-row lines; INFO is the play-by-play.

Usage:
    from lib.log import get_logger
    log = get_logger("placement")
    log.info("crystallized %s -> %s", feature_key, name)
"""

import logging
import os
import sys

_FMT = "%(asctime)s %(levelname)-5s %(name)-16s %(message)s"
_configured = False


def _configure() -> None:
    global _configured
    if _configured:
        return
    level = os.environ.get("WORLD_LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FMT, datefmt="%H:%M:%S"))
    root = logging.getLogger("world")
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(handler)
    root.propagate = False
    _configured = True


def get_logger(component: str) -> logging.Logger:
    """Return the logger for a component, e.g. get_logger('poller') -> world.poller."""
    _configure()
    return logging.getLogger(f"world.{component}")
