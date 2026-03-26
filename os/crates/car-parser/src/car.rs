/// CAR (Content Addressable aRchive) v1 parser
/// Format: header_varint + header_cbor + (block_varint + block_cid + block_data)*
///
/// Each block is: varint(len) + CID + data
/// where len = CID bytes + data bytes

use crate::cbor::{self, CborValue};
use crate::cid::Cid;
use crate::varint;
use std::collections::HashMap;

/// Parsed CAR file
pub struct CarFile {
    pub roots: Vec<Cid>,
    /// Map from CID hash → raw block bytes
    pub raw_blocks: HashMap<Vec<u8>, Vec<u8>>,
    /// Map from CID hash → decoded CBOR value (for dag-cbor blocks)
    pub decoded_blocks: HashMap<Vec<u8>, CborValue>,
}

/// Parse a CAR v1 file from bytes
pub fn parse(data: &[u8]) -> Result<CarFile, String> {
    let mut pos = 0;

    // Read header
    let (header_len, next) = varint::read_uvarint(data, pos)
        .map_err(|e| format!("CAR header varint: {}", e))?;
    pos = next;

    let header_end = pos + header_len as usize;
    if header_end > data.len() {
        return Err("CAR header truncated".into());
    }

    let (header_cbor, _) = cbor::decode(data, pos)
        .map_err(|e| format!("CAR header CBOR: {}", e))?;
    pos = header_end;

    // Extract roots from header
    let header_map = header_cbor.as_map().ok_or("CAR header is not a map")?;

    // Check version
    if let Some(version) = header_map.get("version") {
        if let Some(v) = version.as_integer() {
            if v != 1 {
                return Err(format!("unsupported CAR version: {}", v));
            }
        }
    }

    let roots = match header_map.get("roots") {
        Some(CborValue::Array(arr)) => {
            arr.iter()
                .filter_map(|v| v.as_link().cloned())
                .collect()
        }
        _ => return Err("CAR header missing 'roots' array".into()),
    };

    // Parse blocks
    let mut raw_blocks = HashMap::new();
    let mut decoded_blocks = HashMap::new();

    while pos < data.len() {
        // Block: varint(length) + CID + data
        let (block_len, next) = varint::read_uvarint(data, pos)
            .map_err(|e| format!("block varint at {}: {}", pos, e))?;
        pos = next;

        let block_end = pos + block_len as usize;
        if block_end > data.len() {
            // Truncated last block — tolerate this
            break;
        }

        // Parse CID
        let (cid, cid_end) = Cid::read(data, pos)
            .map_err(|e| format!("block CID at {}: {}", pos, e))?;

        let block_data = &data[cid_end..block_end];

        // Store raw bytes
        raw_blocks.insert(cid.hash.clone(), block_data.to_vec());

        // Try to decode as DAG-CBOR (codec 0x71) or plain CBOR (codec 0x55 for raw)
        if cid.codec == 0x71 {
            match cbor::decode(block_data, 0) {
                Ok((value, _)) => {
                    decoded_blocks.insert(cid.hash.clone(), value);
                }
                Err(_) => {
                    // Not valid CBOR — skip decoding, keep raw
                }
            }
        }

        pos = block_end;
    }

    Ok(CarFile {
        roots,
        raw_blocks,
        decoded_blocks,
    })
}
