#!/usr/bin/env python3
"""Bootstrap the private os-api broker; never print or put tokens in argv."""
import argparse
import getpass
from http.client import HTTPException
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit, unquote
from urllib.request import HTTPRedirectHandler, Request, build_opener


class DepositError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def https_url(url):
    try:
        parsed = urlsplit(url)
    except ValueError:
        raise DepositError("invalid HTTPS endpoint") from None
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or parsed.query:
        raise DepositError("endpoints must use HTTPS without embedded credentials, queries or fragments")
    return url.rstrip("/")


def request_json(url, method="GET", body=None, bearer=None):
    # Cloudflare rejects Python's default urllib user agent with error 1010.
    headers = {"Accept": "application/json", "User-Agent": "os-api-credential-handoff/1.0"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    if body is not None:
        headers["Content-Type"] = "application/json"
    data = json.dumps(body).encode() if body is not None else None
    try:
        with build_opener(NoRedirect()).open(Request(url, data=data, headers=headers, method=method), timeout=30) as response:
            result = json.loads(response.read(1024 * 1024))
            if not isinstance(result, dict):
                raise DepositError("endpoint returned an invalid JSON object")
            return result
    except HTTPError as error:
        raise DepositError(f"{urlsplit(url).hostname} returned HTTP {error.code}") from None
    except (URLError, TimeoutError, OSError, ValueError, HTTPException):
        raise DepositError(f"request to {urlsplit(url).hostname} failed or returned invalid JSON") from None


def did_document_url(did):
    if not isinstance(did, str):
        raise DepositError("invalid DID")
    if re.fullmatch(r"did:plc:[a-z2-7]{24}", did):
        return "https://plc.directory/" + did
    if did.startswith("did:web:"):
        parts = did[8:].split(":")
        domain = unquote(parts[0])
        if not re.fullmatch(r"[a-zA-Z0-9.-]+(?::[0-9]+)?", domain):
            raise DepositError("invalid did:web domain")
        if any(unquote(part) in ("", ".", "..") for part in parts[1:]):
            raise DepositError("invalid did:web path")
        path = "/".join(quote(unquote(part), safe="") for part in parts[1:])
        return https_url("https://" + domain) + ("/" + path + "/did.json" if path else "/.well-known/did.json")
    raise DepositError("unsupported DID method")


def identity_session(handle, password, call=request_json):
    resolved = call("https://bsky.social/xrpc/com.atproto.identity.resolveHandle?" + urlencode({"handle": handle}))
    did = resolved.get("did", "")
    doc = call(did_document_url(did))
    services = doc.get("service", [])
    if not isinstance(services, list):
        raise DepositError("DID document has invalid services")
    endpoint = next((s.get("serviceEndpoint") for s in services if isinstance(s, dict) and s.get("id") in ("#atproto_pds", did + "#atproto_pds")), None)
    if not isinstance(endpoint, str):
        raise DepositError("DID document has no ATProto PDS service")
    pds = https_url(endpoint)
    session = call(pds + "/xrpc/com.atproto.server.createSession", "POST", {"identifier": handle, "password": password})
    if session.get("did") != did or not valid_token(session.get("accessJwt")):
        raise DepositError("PDS session identity did not match the resolved handle")
    return did, session["accessJwt"]


def valid_token(value):
    return isinstance(value, str) and 0 < len(value) <= 32768 and not re.search(r"[\s\x00-\x1f\x7f]", value)


def read_credential(path):
    try:
        original = path.read_bytes()
        document = json.loads(original)
    except (OSError, ValueError):
        raise DepositError("cannot read login cache; run this script with --login first (file storage is required)") from None
    if not isinstance(document, dict) or document.get("auth_mode") != "chatgpt":
        raise DepositError("login cache must use auth_mode chatgpt, not an API key or external token")
    tokens = document.get("tokens")
    if not isinstance(tokens, dict) or not valid_token(tokens.get("refresh_token")) or not valid_token(tokens.get("access_token")):
        raise DepositError("login cache has no valid ChatGPT access/refresh token pair")
    account = tokens.get("account_id") or document.get("account_id") or ""
    if not isinstance(account, str) or len(account) > 256 or re.search(r"[\r\n]", account):
        raise DepositError("login cache has an invalid account_id")
    return original, {"access_token": tokens["access_token"], "refresh_token": tokens["refresh_token"], "account_id": account}


def deposit(path, did, jwt, api, call=request_json):
    original, credential = read_credential(path)
    url = api + "/openai/credential?" + urlencode({"session": did, "authMode": "pds"})
    result = call(url, "PUT", credential, jwt)
    if result.get("ok") is not True or result.get("stored") is not True:
        raise DepositError("deposit was not confirmed; local login cache retained")
    try:
        if path.read_bytes() != original:
            raise DepositError("worker stored the credential, but the local cache changed; stop local use and establish one refresh owner")
        path.unlink()
    except OSError:
        raise DepositError("worker stored the credential, but local cache removal failed; stop local use and remove that cache before proceeding") from None
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="Hand a dedicated ChatGPT login to os-api; successful deposit removes its local auth.json.")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--login", action="store_true", help="create a dedicated browser login with file storage")
    action.add_argument("--status", action="store_true", help="show broker status without returning secrets")
    action.add_argument("--delete", action="store_true", help="remove the broker credential")
    parser.add_argument("--fresh", action="store_true", help="with --login, discard an unusable dedicated local cache before a fresh browser login")
    parser.add_argument("--handoff", action="store_true", help="explicitly hand over and remove a cache selected by CODEX_AUTH_JSON or CODEX_HOME")
    args = parser.parse_args(argv)
    if args.fresh and not args.login:
        parser.error("--fresh requires --login")
    dedicated = Path.home() / ".codex-os-api"
    override = os.environ.get("CODEX_AUTH_JSON") or os.environ.get("CODEX_HOME")
    path = Path(os.environ.get("CODEX_AUTH_JSON") or str(Path(os.environ.get("CODEX_HOME") or dedicated) / "auth.json")).expanduser()
    if args.login:
        if override:
            raise DepositError("--login uses the dedicated cache; unset CODEX_HOME and CODEX_AUTH_JSON for bootstrap")
        if path.exists():
            if not args.fresh:
                raise DepositError("dedicated login cache already exists; deposit it, or use --login --fresh for recovery")
            try:
                path.unlink()
            except OSError:
                raise DepositError("cannot remove old dedicated cache; check file permissions") from None
        dedicated.mkdir(mode=0o700, parents=True, exist_ok=True)
        login_env = {**os.environ, "CODEX_HOME": str(dedicated)}
        executable = shutil.which("codex")
        if not executable:
            raise DepositError("Codex CLI not found; install it and retry")
        try:
            subprocess.run([executable, "-c", 'cli_auth_credentials_store="file"', "login"], env=login_env, check=True)
        except (OSError, subprocess.CalledProcessError):
            raise DepositError("Codex login failed; install the Codex CLI and retry") from None
        read_credential(path)
        print("Dedicated login ready. Run this script again to hand it to os-api.")
        return
    if not (args.status or args.delete):
        if override and not args.handoff:
            raise DepositError("custom cache requires --handoff: deposit removes auth.json; stop all local clients using it first")
        read_credential(path)
        print("Handing the login to os-api; successful storage removes the local auth.json. Do not use this cache locally.")
    api = https_url(os.environ.get("OS_API", "https://os-api.mino.mobi"))
    handle = (os.environ.get("OS_HANDLE") or input("allowlisted Bluesky handle: ")).strip().removeprefix("@").lower()
    password = os.environ.pop("OS_APP_PASSWORD", None) or getpass.getpass("app password: ")
    if not handle or not password:
        raise DepositError("handle and app password are required")
    did, jwt = identity_session(handle, password)
    if args.status or args.delete:
        result = request_json(api + "/openai/credential?" + urlencode({"session": did, "authMode": "pds"}), "DELETE" if args.delete else "GET", bearer=jwt)
    else:
        result = deposit(path, did, jwt, api)
    safe = {key: result[key] for key in ("ok", "stored", "accountId", "accessExpiresAt", "accessExpired", "lastRefresh", "loginRequired", "error") if key in result}
    print(json.dumps(safe, indent=2))
    if not (args.status or args.delete):
        print("Handoff complete. In the container: agent --harness=codex astra")


if __name__ == "__main__":
    try:
        main()
    except (DepositError, KeyboardInterrupt, EOFError) as error:
        print("error: " + (str(error) or "cancelled"), file=sys.stderr)
        sys.exit(1)
