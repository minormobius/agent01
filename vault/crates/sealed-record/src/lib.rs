mod envelope;
mod records;

use wasm_bindgen::prelude::*;

/// Serialize an inner record (JSON string → DAG-CBOR bytes).
///
/// `inner_type` is the NSID (e.g., "com.minomobi.crm.deal").
/// `record_json` is the JSON representation of the inner record.
/// Returns DAG-CBOR bytes ready for AES-GCM encryption.
#[wasm_bindgen(js_name = "serializeRecord")]
pub fn serialize_record(inner_type: &str, record_json: &str) -> Result<Vec<u8>, String> {
    let value: ciborium::Value =
        json_to_cbor(record_json).map_err(|e| format!("JSON parse error: {e}"))?;
    records::validate(inner_type, &value)?;
    let mut buf = Vec::new();
    ciborium::into_writer(&value, &mut buf).map_err(|e| format!("CBOR encode error: {e}"))?;
    Ok(buf)
}

/// Deserialize an inner record (DAG-CBOR bytes → JSON string).
///
/// Returns a JSON string suitable for passing to JavaScript.
#[wasm_bindgen(js_name = "deserializeRecord")]
pub fn deserialize_record(inner_type: &str, cbor_bytes: &[u8]) -> Result<String, String> {
    let value: ciborium::Value =
        ciborium::from_reader(cbor_bytes).map_err(|e| format!("CBOR decode error: {e}"))?;
    records::validate(inner_type, &value)?;
    let json = cbor_to_json(&value)?;
    Ok(json)
}

/// Build a vault.sealed envelope (after JS has done AES-GCM encryption).
///
/// Returns a JSON string ready for putRecord to the PDS.
#[wasm_bindgen(js_name = "buildEnvelope")]
pub fn build_envelope(
    inner_type: &str,
    keyring_rkey: &str,
    iv_base64: &str,
    ciphertext_base64: &str,
) -> Result<String, String> {
    envelope::build(inner_type, keyring_rkey, iv_base64, ciphertext_base64)
}

/// Parse a vault.sealed envelope (before JS does AES-GCM decryption).
///
/// Returns a JSON object with { innerType, keyringRkey, iv, ciphertext }.
#[wasm_bindgen(js_name = "parseEnvelope")]
pub fn parse_envelope(envelope_json: &str) -> Result<String, String> {
    envelope::parse(envelope_json)
}

/// Batch deserialize: NDJSON of sealed envelopes → NDJSON of parsed envelopes.
///
/// Each line is independently parsed. Errors on individual lines are included
/// as JSON error objects rather than failing the whole batch.
#[wasm_bindgen(js_name = "parseBatch")]
pub fn parse_batch(envelopes_ndjson: &str) -> String {
    envelopes_ndjson
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| match envelope::parse(line) {
            Ok(parsed) => parsed,
            Err(e) => format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\"")),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// --- Internal helpers ---

fn json_to_cbor(json: &str) -> Result<ciborium::Value, String> {
    let serde_val: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("{e}"))?;
    Ok(serde_value_to_cbor(&serde_val))
}

fn serde_value_to_cbor(val: &serde_json::Value) -> ciborium::Value {
    match val {
        serde_json::Value::Null => ciborium::Value::Null,
        serde_json::Value::Bool(b) => ciborium::Value::Bool(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                ciborium::Value::Integer(i.into())
            } else if let Some(f) = n.as_f64() {
                ciborium::Value::Float(f)
            } else {
                ciborium::Value::Null
            }
        }
        serde_json::Value::String(s) => ciborium::Value::Text(s.clone()),
        serde_json::Value::Array(arr) => {
            ciborium::Value::Array(arr.iter().map(serde_value_to_cbor).collect())
        }
        serde_json::Value::Object(obj) => {
            let entries = obj
                .iter()
                .map(|(k, v)| (ciborium::Value::Text(k.clone()), serde_value_to_cbor(v)))
                .collect();
            ciborium::Value::Map(entries)
        }
    }
}

fn cbor_to_json(val: &ciborium::Value) -> Result<String, String> {
    let serde_val = cbor_to_serde_value(val)?;
    serde_json::to_string(&serde_val).map_err(|e| format!("JSON serialize error: {e}"))
}

fn cbor_to_serde_value(val: &ciborium::Value) -> Result<serde_json::Value, String> {
    match val {
        ciborium::Value::Null => Ok(serde_json::Value::Null),
        ciborium::Value::Bool(b) => Ok(serde_json::Value::Bool(*b)),
        ciborium::Value::Integer(i) => {
            let n: i128 = (*i).into();
            Ok(serde_json::Value::Number(
                serde_json::Number::from(n as i64),
            ))
        }
        ciborium::Value::Float(f) => serde_json::Number::from_f64(*f)
            .map(serde_json::Value::Number)
            .ok_or_else(|| "Invalid float".to_string()),
        ciborium::Value::Text(s) => Ok(serde_json::Value::String(s.clone())),
        ciborium::Value::Bytes(b) => {
            use base64::Engine;
            Ok(serde_json::Value::String(
                base64::engine::general_purpose::STANDARD.encode(b),
            ))
        }
        ciborium::Value::Array(arr) => {
            let items: Result<Vec<_>, _> = arr.iter().map(cbor_to_serde_value).collect();
            Ok(serde_json::Value::Array(items?))
        }
        ciborium::Value::Map(entries) => {
            let mut map = serde_json::Map::new();
            for (k, v) in entries {
                let key = match k {
                    ciborium::Value::Text(s) => s.clone(),
                    _ => return Err("Non-string map key".to_string()),
                };
                map.insert(key, cbor_to_serde_value(v)?);
            }
            Ok(serde_json::Value::Object(map))
        }
        ciborium::Value::Tag(_, inner) => cbor_to_serde_value(inner),
        _ => Err(format!("Unsupported CBOR type")),
    }
}
