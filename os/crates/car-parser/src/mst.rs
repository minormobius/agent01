/// ATProto Merkle Search Tree (MST) walker
/// The MST maps collection/rkey paths to record CIDs.
/// Each node has optional left subtree + entries with key suffixes and right subtrees.

use crate::cbor::CborValue;
use crate::cid::Cid;
use std::collections::HashMap;

/// A record entry extracted from the MST
#[derive(Debug, Clone)]
pub struct MstEntry {
    pub key: String,       // "collection/rkey"
    pub value_cid: Cid,    // CID pointing to the record block
}

impl MstEntry {
    /// Split key into (collection, rkey)
    pub fn split_key(&self) -> (&str, &str) {
        match self.key.find('/') {
            Some(i) => (&self.key[..i], &self.key[i + 1..]),
            None => (&self.key, ""),
        }
    }
}

/// Walk an MST node (decoded from DAG-CBOR) and collect all record entries.
/// `blocks` is the map of CID → decoded CBOR for resolving subtree pointers.
pub fn walk_mst(
    node: &CborValue,
    blocks: &HashMap<Vec<u8>, CborValue>,
) -> Result<Vec<MstEntry>, String> {
    let mut entries = Vec::new();
    walk_mst_inner(node, blocks, &mut entries, &mut Vec::new())?;
    Ok(entries)
}

fn walk_mst_inner(
    node: &CborValue,
    blocks: &HashMap<Vec<u8>, CborValue>,
    entries: &mut Vec<MstEntry>,
    _depth: &mut Vec<u8>, // for cycle detection
) -> Result<(), String> {
    let map = node.as_map().ok_or("MST node is not a map")?;

    // Process left subtree first (if present)
    if let Some(left) = map.get("l") {
        if let Some(cid) = left.as_link() {
            if let Some(subtree) = blocks.get(&cid.hash) {
                walk_mst_inner(subtree, blocks, entries, _depth)?;
            }
        }
    }

    // Process entries
    let tree_entries = match map.get("e") {
        Some(e) => e.as_array().ok_or("MST 'e' is not an array")?,
        None => return Ok(()), // leaf with no entries
    };

    let mut last_key = String::new();

    for entry in tree_entries {
        let entry_map = entry.as_map().ok_or("MST entry is not a map")?;

        // p = prefix length (reuse from previous key)
        let prefix_len = entry_map
            .get("p")
            .and_then(|v| v.as_integer())
            .unwrap_or(0) as usize;

        // k = key suffix bytes
        let key_suffix = entry_map
            .get("k")
            .and_then(|v| v.as_bytes())
            .ok_or("MST entry missing 'k'")?;

        // Reconstruct full key
        let key = if prefix_len > 0 && prefix_len <= last_key.len() {
            let mut k = last_key[..prefix_len].to_string();
            k.push_str(&String::from_utf8_lossy(key_suffix));
            k
        } else {
            String::from_utf8_lossy(key_suffix).to_string()
        };

        // v = CID of the record
        let value_cid = entry_map
            .get("v")
            .and_then(|v| v.as_link())
            .ok_or("MST entry missing 'v'")?
            .clone();

        entries.push(MstEntry {
            key: key.clone(),
            value_cid,
        });

        last_key = key;

        // t = optional right subtree
        if let Some(right) = entry_map.get("t") {
            if let Some(cid) = right.as_link() {
                if let Some(subtree) = blocks.get(&cid.hash) {
                    walk_mst_inner(subtree, blocks, entries, _depth)?;
                }
            }
        }
    }

    Ok(())
}
