use serde::{Deserialize, Serialize};

/// Sealed envelope as stored on the PDS.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SealedEnvelope {
    #[serde(rename = "$type")]
    r#type: String,
    inner_type: String,
    keyring_rkey: String,
    /// Base64-encoded 96-bit IV
    iv: String,
    /// Base64-encoded AES-GCM ciphertext (includes auth tag)
    ciphertext: String,
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
}

/// Parsed envelope fields returned to JavaScript for decryption.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParsedEnvelope {
    inner_type: String,
    keyring_rkey: String,
    iv: String,
    ciphertext: String,
}

/// Build a vault.sealed envelope JSON from encrypted components.
pub fn build(
    inner_type: &str,
    keyring_rkey: &str,
    iv_base64: &str,
    ciphertext_base64: &str,
) -> Result<String, String> {
    let now = js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default();

    let env = SealedEnvelope {
        r#type: "com.minomobi.vault.sealed".into(),
        inner_type: inner_type.into(),
        keyring_rkey: keyring_rkey.into(),
        iv: iv_base64.into(),
        ciphertext: ciphertext_base64.into(),
        created_at: now,
        updated_at: None,
    };

    serde_json::to_string(&env).map_err(|e| format!("Envelope serialize error: {e}"))
}

/// Parse a vault.sealed envelope JSON, returning fields needed for decryption.
pub fn parse(envelope_json: &str) -> Result<String, String> {
    let env: SealedEnvelope =
        serde_json::from_str(envelope_json).map_err(|e| format!("Envelope parse error: {e}"))?;

    let parsed = ParsedEnvelope {
        inner_type: env.inner_type,
        keyring_rkey: env.keyring_rkey,
        iv: env.iv,
        ciphertext: env.ciphertext,
    };

    serde_json::to_string(&parsed).map_err(|e| format!("Serialize error: {e}"))
}
