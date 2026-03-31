//! ATProto PDS client — plain HTTP, no SDK.

use std::cell::RefCell;

use anyhow::{bail, Context, Result};
use serde_json::Value;

const PUBLIC_API: &str = "https://public.api.bsky.app";

pub struct PdsClient {
    pub did: String,
    pds: String,
    session: RefCell<Session>,
}

struct Session {
    access_jwt: String,
    refresh_jwt: String,
}

impl PdsClient {
    pub fn new(
        client: &reqwest::blocking::Client,
        handle: &str,
        app_password: &str,
    ) -> Result<Self> {
        // Resolve handle -> DID
        let resp: Value = client
            .get(format!(
                "{PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle"
            ))
            .query(&[("handle", handle)])
            .send()?
            .error_for_status()?
            .json()?;
        let did = resp["did"]
            .as_str()
            .context("missing did in resolveHandle response")?
            .to_string();

        // Resolve DID -> PDS endpoint
        let doc: Value = if did.starts_with("did:plc:") {
            client
                .get(format!("https://plc.directory/{did}"))
                .send()?
                .error_for_status()?
                .json()?
        } else if did.starts_with("did:web:") {
            let host = did.strip_prefix("did:web:").unwrap().replace(':', "/");
            client
                .get(format!("https://{host}/.well-known/did.json"))
                .send()?
                .error_for_status()?
                .json()?
        } else {
            bail!("Unsupported DID method: {did}");
        };

        let pds = doc["service"]
            .as_array()
            .context("missing service in DID doc")?
            .iter()
            .find(|s| s["type"].as_str() == Some("AtprotoPersonalDataServer"))
            .context("no AtprotoPersonalDataServer in DID doc")?["serviceEndpoint"]
            .as_str()
            .context("missing serviceEndpoint")?
            .to_string();

        // Create session
        let sess: Value = client
            .post(format!("{pds}/xrpc/com.atproto.server.createSession"))
            .json(&serde_json::json!({
                "identifier": handle,
                "password": app_password,
            }))
            .send()?
            .error_for_status()?
            .json()?;

        let access_jwt = sess["accessJwt"]
            .as_str()
            .context("missing accessJwt")?
            .to_string();
        let refresh_jwt = sess["refreshJwt"]
            .as_str()
            .context("missing refreshJwt")?
            .to_string();

        println!("  Authenticated as {handle} ({did})");

        Ok(Self {
            did,
            pds,
            session: RefCell::new(Session {
                access_jwt,
                refresh_jwt,
            }),
        })
    }

    pub fn put_record(
        &self,
        client: &reqwest::blocking::Client,
        collection: &str,
        rkey: &str,
        record: &Value,
    ) -> Result<()> {
        let body = serde_json::json!({
            "repo": self.did,
            "collection": collection,
            "rkey": rkey,
            "record": record,
            "validate": false,
        });

        let resp = client
            .post(format!(
                "{}/xrpc/com.atproto.repo.putRecord",
                self.pds
            ))
            .header(
                "Authorization",
                format!("Bearer {}", self.session.borrow().access_jwt),
            )
            .json(&body)
            .send()?;

        if resp.status().as_u16() == 400 {
            let text = resp.text()?;
            if text.to_lowercase().contains("expired") {
                self.refresh(client)?;
                return self.put_record(client, collection, rkey, record);
            }
            bail!("PDS putRecord 400: {text}");
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            bail!("PDS putRecord {status}: {text}");
        }

        Ok(())
    }

    fn refresh(&self, client: &reqwest::blocking::Client) -> Result<()> {
        let resp: Value = client
            .post(format!(
                "{}/xrpc/com.atproto.server.refreshSession",
                self.pds
            ))
            .header(
                "Authorization",
                format!("Bearer {}", self.session.borrow().refresh_jwt),
            )
            .send()?
            .error_for_status()?
            .json()?;

        let mut session = self.session.borrow_mut();
        session.access_jwt = resp["accessJwt"]
            .as_str()
            .context("missing accessJwt in refresh")?
            .to_string();
        session.refresh_jwt = resp["refreshJwt"]
            .as_str()
            .context("missing refreshJwt in refresh")?
            .to_string();

        println!("  Session refreshed");
        Ok(())
    }
}
