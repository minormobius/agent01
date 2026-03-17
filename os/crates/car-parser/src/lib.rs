mod car;
mod cbor;
mod cid;
mod mst;
mod varint;

use serde::Serialize;
use wasm_bindgen::prelude::*;

/// A single extracted record, ready for NDJSON / DuckDB ingestion
#[derive(Serialize)]
struct RecordRow {
    collection: String,
    rkey: String,
    uri: String,
    cid: String,
    size_bytes: usize,
    value: serde_json::Value,
}

/// Parse a CAR file (from getRepo) and return NDJSON string.
/// Each line is a JSON object with: collection, rkey, uri, cid, size_bytes, value
#[wasm_bindgen(js_name = "parseCarToNdjson")]
pub fn parse_car_to_ndjson(data: &[u8], did: &str) -> Result<String, JsValue> {
    let car_file = car::parse(data).map_err(|e| JsValue::from_str(&e))?;

    // Find the root MST node
    if car_file.roots.is_empty() {
        return Err(JsValue::from_str("no roots in CAR file"));
    }

    let root_cid = &car_file.roots[0];

    // The root block is a commit object, which contains a 'data' field pointing to the MST root
    let commit = car_file
        .decoded_blocks
        .get(&root_cid.hash)
        .ok_or_else(|| JsValue::from_str("root block not found"))?;

    let commit_map = commit
        .as_map()
        .ok_or_else(|| JsValue::from_str("root block is not a map"))?;

    let mst_root_cid = commit_map
        .get("data")
        .and_then(|v| v.as_link())
        .ok_or_else(|| JsValue::from_str("commit missing 'data' CID"))?;

    let mst_root = car_file
        .decoded_blocks
        .get(&mst_root_cid.hash)
        .ok_or_else(|| JsValue::from_str("MST root block not found"))?;

    // Walk the MST to get all entries
    let entries =
        mst::walk_mst(mst_root, &car_file.decoded_blocks).map_err(|e| JsValue::from_str(&e))?;

    // Build NDJSON output
    let mut output = String::new();
    let mut record_count = 0;

    for entry in &entries {
        let (collection, rkey) = entry.split_key();

        // Look up the record block
        let value_json = match car_file.decoded_blocks.get(&entry.value_cid.hash) {
            Some(cbor_val) => cbor_val.to_json(),
            None => {
                // Raw block — encode as bytes
                match car_file.raw_blocks.get(&entry.value_cid.hash) {
                    Some(raw) => serde_json::json!({ "$raw": raw.len() }),
                    None => serde_json::Value::Null,
                }
            }
        };

        let size = car_file
            .raw_blocks
            .get(&entry.value_cid.hash)
            .map(|b| b.len())
            .unwrap_or(0);

        let row = RecordRow {
            collection: collection.to_string(),
            rkey: rkey.to_string(),
            uri: format!("at://{}/{}/{}", did, collection, rkey),
            cid: entry.value_cid.to_hex(),
            size_bytes: size,
            value: value_json,
        };

        if let Ok(line) = serde_json::to_string(&row) {
            output.push_str(&line);
            output.push('\n');
            record_count += 1;
        }
    }

    // Log summary
    web_sys::console::log_1(&format!(
        "CAR parsed: {} blocks, {} MST entries, {} records extracted",
        car_file.decoded_blocks.len(),
        entries.len(),
        record_count
    ).into());

    Ok(output)
}

/// Quick stats from a CAR file without full record extraction
#[wasm_bindgen(js_name = "carStats")]
pub fn car_stats(data: &[u8]) -> Result<JsValue, JsValue> {
    let car_file = car::parse(data).map_err(|e| JsValue::from_str(&e))?;

    let root_cid = car_file.roots.first()
        .ok_or_else(|| JsValue::from_str("no roots"))?;

    let commit = car_file.decoded_blocks.get(&root_cid.hash)
        .ok_or_else(|| JsValue::from_str("root block not found"))?;

    let mst_root_cid = commit.as_map()
        .and_then(|m| m.get("data"))
        .and_then(|v| v.as_link())
        .ok_or_else(|| JsValue::from_str("commit missing 'data'"))?;

    let mst_root = car_file.decoded_blocks.get(&mst_root_cid.hash)
        .ok_or_else(|| JsValue::from_str("MST root not found"))?;

    let entries = mst::walk_mst(mst_root, &car_file.decoded_blocks)
        .map_err(|e| JsValue::from_str(&e))?;

    // Count per collection
    let mut collections: std::collections::HashMap<String, (usize, usize)> = std::collections::HashMap::new();
    for entry in &entries {
        let (collection, _) = entry.split_key();
        let size = car_file.raw_blocks.get(&entry.value_cid.hash)
            .map(|b| b.len()).unwrap_or(0);
        let e = collections.entry(collection.to_string()).or_insert((0, 0));
        e.0 += 1;
        e.1 += size;
    }

    let stats = serde_json::json!({
        "totalBlocks": car_file.raw_blocks.len(),
        "totalRecords": entries.len(),
        "totalBytes": data.len(),
        "collections": collections.iter().map(|(k, (count, size))| {
            serde_json::json!({ "name": k, "records": count, "bytes": size })
        }).collect::<Vec<_>>()
    });

    let json_str = serde_json::to_string(&stats)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(JsValue::from_str(&json_str))
}
