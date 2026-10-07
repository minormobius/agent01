import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deposit", Path(__file__).with_name("deposit-credential.py"))
deposit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deposit)


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "auth.json"
        self.path.write_text(json.dumps({"auth_mode": "chatgpt", "tokens": {
            "access_token": "access", "refresh_token": "refresh", "account_id": "account", "id_token": "never-send",
        }}))

    def test_success_retires_local_copy_and_omits_id_token(self):
        def call(url, method, body, bearer):
            self.assertEqual(method, "PUT")
            self.assertEqual(bearer, "pds-jwt")
            self.assertNotIn("id_token", body)
            self.assertEqual(body["account_id"], "account")
            return {"ok": True, "stored": True}
        deposit.deposit(self.path, "did:web:example.com", "pds-jwt", "https://api.example.com", call)
        self.assertFalse(self.path.exists())

    def test_failure_keeps_local_copy(self):
        with self.assertRaises(deposit.DepositError):
            deposit.deposit(self.path, "did", "jwt", "https://api.example.com", lambda *args: {"ok": False})
        self.assertTrue(self.path.exists())

    def test_changed_cache_is_not_deleted(self):
        def call(*args):
            self.path.write_text("new-login")
            return {"ok": True, "stored": True}
        with self.assertRaises(deposit.DepositError):
            deposit.deposit(self.path, "did", "jwt", "https://api.example.com", call)
        self.assertEqual(self.path.read_text(), "new-login")

    def test_rejects_api_key_and_malformed_tokens(self):
        for body in [{"auth_mode": "apikey"}, None, {"auth_mode": "chatgpt", "tokens": {"refresh_token": []}}]:
            self.path.write_text(json.dumps(body))
            with self.assertRaises(deposit.DepositError):
                deposit.read_credential(self.path)

    def test_pds_service_selected_and_session_identity_checked(self):
        did = "did:web:example.com"
        calls = []
        def call(url, method="GET", body=None):
            calls.append((url, body))
            if len(calls) == 1:
                return {"did": did}
            if len(calls) == 2:
                return {"service": [{"id": "#other", "serviceEndpoint": "https://wrong.example"}, {"id": "#atproto_pds", "serviceEndpoint": "https://pds.example"}]}
            return {"did": did, "accessJwt": "pds-jwt"}
        self.assertEqual(deposit.identity_session('name.example', 'quote"\\password', call), (did, "pds-jwt"))
        self.assertTrue(calls[-1][0].startswith("https://pds.example/"))
        self.assertEqual(calls[-1][1]["password"], 'quote"\\password')
        with self.assertRaises(deposit.DepositError):
            deposit.identity_session("name", "password", lambda *args: {"did": "invalid"})

    def test_did_web_paths_and_https(self):
        self.assertEqual(deposit.did_document_url("did:web:example.com:user:alice"), "https://example.com/user/alice/did.json")
        for endpoint in ["http://example.com", "https://user:password@example.com", "https://example.com?secret=yes"]:
            with self.assertRaises(deposit.DepositError):
                deposit.https_url(endpoint)

    def test_custom_cache_requires_explicit_handoff(self):
        with patch.dict(deposit.os.environ, {"CODEX_AUTH_JSON": str(self.path)}, clear=True), patch.object(Path, "home", return_value=Path(self.temp.name)):
            with self.assertRaisesRegex(deposit.DepositError, "--handoff"):
                deposit.main([])

    def test_fresh_login_uses_an_isolated_child_environment(self):
        root = Path(self.temp.name) / ".codex-os-api"
        root.mkdir()
        cache = root / "auth.json"
        cache.write_text("stale-cache")
        def login(args, env, check):
            self.assertFalse(cache.exists())
            self.assertEqual(env["CODEX_HOME"], str(root))
            self.assertNotIn("CODEX_HOME", deposit.os.environ)
            self.assertEqual(args, ["codex", "-c", 'cli_auth_credentials_store="file"', "login"])
            cache.write_bytes(self.path.read_bytes())
        with patch.dict(deposit.os.environ, {}, clear=True), patch.object(Path, "home", return_value=Path(self.temp.name)), patch.object(deposit.shutil, "which", return_value="codex"), patch.object(deposit.subprocess, "run", side_effect=login):
            deposit.main(["--login", "--fresh"])
        self.assertTrue(cache.exists())

    def test_does_not_report_login_success_without_a_file_cache(self):
        with patch.dict(deposit.os.environ, {}, clear=True), patch.object(Path, "home", return_value=Path(self.temp.name)), patch.object(deposit.shutil, "which", return_value="codex"), patch.object(deposit.subprocess, "run"):
            with self.assertRaisesRegex(deposit.DepositError, "file storage"):
                deposit.main(["--login"])

    def test_http_client_has_an_explicit_user_agent_and_refuses_redirects(self):
        with patch.object(deposit, "build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b'{"ok":true}'
            self.assertEqual(deposit.request_json("https://api.example.com"), {"ok": True})
            sent = opener.return_value.open.call_args.args[0]
            self.assertEqual(sent.get_header("User-agent"), "os-api-credential-handoff/1.0")
            self.assertIsInstance(opener.call_args.args[0], deposit.NoRedirect)


if __name__ == "__main__":
    unittest.main()
