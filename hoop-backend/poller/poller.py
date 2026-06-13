"""The poller — permanent background process draining the Postgres jobs table.

Postgres IS the message bus (no Redis/Celery): claim with FOR UPDATE SKIP LOCKED,
process, write result + notification. Sync loop (our DB layer is sync). run_once()
is factored out so the lifecycle is testable without an infinite loop.

Run:  .venv/bin/python -m poller.poller
"""

import json
import time

from lib.log import get_logger
from storage.content_store import get_conn
from poller.job_handlers import handle_job
from poller.replenishment import run_feeds
from poller.world_tick import maybe_world_tick

log = get_logger("poller")


def claim_job(conn) -> dict | None:
    """Atomically grab the highest-priority pending job and mark it processing."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT * FROM jobs
            WHERE status = 'pending'
            ORDER BY priority ASC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        )
        job = cur.fetchone()
        if job:
            cur.execute(
                "UPDATE jobs SET status='processing', picked_at=now() WHERE id=%s",
                (job["id"],),
            )
        conn.commit()
    return job


def complete_job(conn, job: dict, result: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE jobs SET status='done', done_at=now(), result=%s WHERE id=%s",
            (json.dumps(result), job["id"]),
        )
        if job.get("player_id") and result and result.get("notify"):
            cur.execute(
                "INSERT INTO notifications (player_id, type, payload) VALUES (%s, %s, %s)",
                (job["player_id"], job["type"] + "_resolved", json.dumps(result)),
            )
        conn.commit()


def fail_job(conn, job: dict, error: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE jobs SET status='failed', done_at=now(), error=%s WHERE id=%s",
            (error, job["id"]),
        )
        conn.commit()


def run_once(conn=None) -> tuple[str, str | None]:
    """Process at most one job, else do a watermark check. Returns (status, job_id)."""
    own = conn is None
    conn = conn or get_conn()
    try:
        job = claim_job(conn)
        if not job:
            fed = run_feeds()
            if fed:
                log.info("idle tick -> feed work: %s", fed)
            # Periodically nudge the world agent to review drift (interval+threshold
            # gated inside). Off the player hot path; proposals stay human-gated.
            maybe_world_tick()
            return ("idle", None)
        log.info("CLAIM job %s type=%s player=%s prio=%d",
                 str(job["id"])[:8], job["type"], job.get("player_id"), job["priority"])
        try:
            result = handle_job(job)
            complete_job(conn, job, result)
            log.info("DONE  job %s type=%s%s", str(job["id"])[:8], job["type"],
                     " (notified player)" if result and result.get("notify") else "")
            return ("done", str(job["id"]))
        except Exception as e:
            log.exception("FAILED job %s type=%s: %s", str(job["id"])[:8], job["type"], e)
            fail_job(conn, job, f"{type(e).__name__}: {e}")
            return ("failed", str(job["id"]))
    finally:
        if own:
            conn.close()


def poll_loop(interval: int = 5) -> None:
    log.info("poller started (interval=%ds)", interval)
    while True:
        try:
            run_once()
        except Exception as e:  # never let the loop die
            log.exception("loop error: %s", e)
        time.sleep(interval)


if __name__ == "__main__":
    poll_loop()
