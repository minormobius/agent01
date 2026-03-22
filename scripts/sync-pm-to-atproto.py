#!/usr/bin/env python3
"""
Sync PM project data to/from ATProto PDS.

Reads a project JSON export and writes it as ATProto records:
  - com.minomobi.pm.project (project envelope with embedded state)
  - com.minomobi.pm.schedule (one per task, for interop)
  - com.minomobi.pm.team (team roster)

Usage:
    export BLUESKY_HANDLE=minomobi.com
    export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

    # Push project to PDS
    SYNC_MODE=push PROJECT_FILE=pm/exports/latest.json python3 scripts/sync-pm-to-atproto.py

    # Pull project from PDS
    SYNC_MODE=pull python3 scripts/sync-pm-to-atproto.py
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PDS = "https://bsky.social"
BATCH_SIZE = 200
MAX_RETRIES = 4
RETRY_BASE_DELAY = 3


def create_session(handle, password):
    url = f"{PDS}/xrpc/com.atproto.server.createSession"
    data = json.dumps({"identifier": handle, "password": password}).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        session = json.loads(resp.read())
    print(f"Authenticated as {session['handle']} ({session['did']})")
    return session["accessJwt"], session["did"]


def xrpc_post(token, nsid, payload):
    url = f"{PDS}/xrpc/{nsid}"
    data = json.dumps(payload).encode()
    for attempt in range(MAX_RETRIES + 1):
        req = Request(url, data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        try:
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except HTTPError as exc:
            body = exc.read().decode()
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Rate limited, retrying in {delay}s...")
                time.sleep(delay)
                continue
            print(f"  HTTP {exc.code}: {body}")
            raise
    return None


def xrpc_get(token, nsid, params):
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{PDS}/xrpc/{nsid}?{qs}"
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def push_project(token, did, project):
    now = datetime.now(timezone.utc).isoformat()
    name = project.get("projectName", "Project")
    rkey = re.sub(r"[^a-z0-9]+", "-", name.lower())[:50] or "project"

    tasks = project.get("tasks", [])
    members = project.get("members", [])
    deps = project.get("deps", [])
    baselines = project.get("baselines", [])

    leaves = [t for t in tasks if not any(c.get("parentId") == t["id"] for c in tasks)]
    bac = sum(t.get("plannedCost", 0) for t in leaves)
    starts = [t["plannedStart"] for t in tasks if t.get("plannedStart")]
    ends = [t["plannedEnd"] for t in tasks if t.get("plannedEnd")]

    # Write project record with embedded state
    project_record = {
        "$type": "com.minomobi.pm.project",
        "name": name,
        "status": "active",
        "budgetAtCompletion": bac,
        "scheduledStart": min(starts) if starts else now,
        "scheduledEnd": max(ends) if ends else now,
        "createdAt": now,
        "updatedAt": now,
        "_pmState": {
            "tasks": tasks,
            "deps": deps,
            "baselines": baselines,
            "members": members,
            "collapsed": project.get("collapsed", []),
        },
    }

    print(f"Pushing project '{name}' → com.minomobi.pm.project/{rkey}")
    xrpc_post(token, "com.atproto.repo.putRecord", {
        "repo": did,
        "collection": "com.minomobi.pm.project",
        "rkey": rkey,
        "record": project_record,
    })

    # Write individual schedule records for interop
    writes = []
    for t in tasks:
        writes.append({
            "$type": "com.atproto.repo.applyWrites#create",
            "collection": "com.minomobi.pm.schedule",
            "rkey": t["id"][:15],
            "value": {
                "$type": "com.minomobi.pm.schedule",
                "projectRkey": rkey,
                "issueRkey": t["id"][:15],
                "plannedStart": t.get("plannedStart", now),
                "plannedEnd": t.get("plannedEnd", now),
                "plannedCost": t.get("plannedCost", 0),
                "actualCost": t.get("actualCost", 0),
                "percentComplete": t.get("percentComplete", 0),
                "createdAt": now,
            },
        })

    # Batch writes
    for i in range(0, len(writes), BATCH_SIZE):
        batch = writes[i:i + BATCH_SIZE]
        xrpc_post(token, "com.atproto.repo.applyWrites", {
            "repo": did,
            "writes": batch,
        })
        print(f"  Pushed {min(i + BATCH_SIZE, len(writes))}/{len(writes)} schedule records")

    # Write team roster
    if members:
        print(f"  Pushing team roster ({len(members)} members)")
        xrpc_post(token, "com.atproto.repo.putRecord", {
            "repo": did,
            "collection": "com.minomobi.pm.team",
            "rkey": f"{rkey}-team",
            "record": {
                "$type": "com.minomobi.pm.team",
                "projectRkey": rkey,
                "members": [{
                    "id": m["id"],
                    "displayName": m["displayName"],
                    "role": m["role"],
                    "handle": m.get("handle"),
                    "did": m.get("did"),
                    "costRate": m.get("costRate", 0),
                    "maxHoursPerWeek": m.get("maxHoursPerWeek", 40),
                    "color": m.get("color"),
                } for m in members],
                "createdAt": now,
            },
        })

    print(f"Push complete: {len(tasks)} tasks, {len(members)} members")


def pull_project(token, did):
    print("Pulling from PDS...")
    projects = xrpc_get(token, "com.atproto.repo.listRecords", {
        "repo": did,
        "collection": "com.minomobi.pm.project",
        "limit": "100",
    })

    records = projects.get("records", [])
    if not records:
        print("No projects found on PDS.")
        return None

    rec = records[-1]
    val = rec["value"]
    print(f"Found project: {val.get('name', 'unnamed')}")

    if val.get("_pmState"):
        state = val["_pmState"]
        state["projectName"] = val.get("name", "Project")
        print(f"  Full state: {len(state.get('tasks', []))} tasks, {len(state.get('members', []))} members")
        return state

    # Fallback: reconstruct from schedule records
    schedules = xrpc_get(token, "com.atproto.repo.listRecords", {
        "repo": did,
        "collection": "com.minomobi.pm.schedule",
        "limit": "1000",
    })

    tasks = []
    for r in schedules.get("records", []):
        s = r["value"]
        tasks.append({
            "id": s.get("issueRkey", ""),
            "parentId": None,
            "name": s.get("issueRkey", "Task"),
            "plannedStart": s.get("plannedStart", "")[:10],
            "plannedEnd": s.get("plannedEnd", "")[:10],
            "plannedCost": s.get("plannedCost", 0),
            "actualCost": s.get("actualCost", 0),
            "percentComplete": s.get("percentComplete", 0),
            "duration": 8,
        })

    print(f"  Reconstructed {len(tasks)} tasks from schedule records")
    return {
        "projectName": val.get("name", "Project"),
        "tasks": tasks,
        "deps": [],
        "baselines": [],
        "members": [],
        "collapsed": [],
    }


def main():
    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")
    mode = os.environ.get("SYNC_MODE", "push")
    project_file = os.environ.get("PROJECT_FILE", "pm/exports/latest.json")

    if not handle or not password:
        print("Error: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set")
        sys.exit(1)

    token, did = create_session(handle, password)

    if mode == "push":
        if not os.path.exists(project_file):
            print(f"Error: Project file not found: {project_file}")
            sys.exit(1)
        with open(project_file) as f:
            project = json.load(f)
        push_project(token, did, project)

    elif mode == "pull":
        state = pull_project(token, did)
        if state:
            os.makedirs("pm/exports", exist_ok=True)
            out = "pm/exports/pulled.json"
            with open(out, "w") as f:
                json.dump(state, f, indent=2)
            print(f"Saved to {out}")
    else:
        print(f"Unknown mode: {mode}")
        sys.exit(1)


if __name__ == "__main__":
    main()
