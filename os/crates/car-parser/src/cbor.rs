/// Minimal DAG-CBOR decoder
/// Decodes CBOR into a simple value tree, with CID link support.
/// ATProto MST nodes and records are encoded as DAG-CBOR.

use crate::cid::Cid;
use serde_json::Value as JsonValue;
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub enum CborValue {
    Null,
    Bool(bool),
    Integer(i64),
    Float(f64),
    Bytes(Vec<u8>),
    Text(String),
    Array(Vec<CborValue>),
    Map(BTreeMap<String, CborValue>),
    Link(Cid),
}

impl CborValue {
    pub fn as_map(&self) -> Option<&BTreeMap<String, CborValue>> {
        match self {
            CborValue::Map(m) => Some(m),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&Vec<CborValue>> {
        match self {
            CborValue::Array(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_bytes(&self) -> Option<&[u8]> {
        match self {
            CborValue::Bytes(b) => Some(b),
            _ => None,
        }
    }

    pub fn as_text(&self) -> Option<&str> {
        match self {
            CborValue::Text(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_integer(&self) -> Option<i64> {
        match self {
            CborValue::Integer(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_link(&self) -> Option<&Cid> {
        match self {
            CborValue::Link(c) => Some(c),
            _ => None,
        }
    }

    /// Convert to serde_json::Value for JSON output
    pub fn to_json(&self) -> JsonValue {
        match self {
            CborValue::Null => JsonValue::Null,
            CborValue::Bool(b) => JsonValue::Bool(*b),
            CborValue::Integer(n) => serde_json::json!(*n),
            CborValue::Float(f) => serde_json::json!(*f),
            CborValue::Bytes(b) => {
                use serde_json::json;
                json!({ "$bytes": base64_encode(b) })
            }
            CborValue::Text(s) => JsonValue::String(s.clone()),
            CborValue::Array(arr) => {
                JsonValue::Array(arr.iter().map(|v| v.to_json()).collect())
            }
            CborValue::Map(map) => {
                let obj: serde_json::Map<String, JsonValue> =
                    map.iter().map(|(k, v)| (k.clone(), v.to_json())).collect();
                JsonValue::Object(obj)
            }
            CborValue::Link(cid) => {
                serde_json::json!({ "$link": cid.to_hex() })
            }
        }
    }
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3f) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Decode DAG-CBOR from bytes
pub fn decode(data: &[u8], offset: usize) -> Result<(CborValue, usize), String> {
    if offset >= data.len() {
        return Err("unexpected end of CBOR data".into());
    }

    let initial = data[offset];
    let major = initial >> 5;
    let additional = initial & 0x1f;
    let mut pos = offset + 1;

    match major {
        // 0: Unsigned integer
        0 => {
            let (val, next) = read_argument(data, additional, pos)?;
            Ok((CborValue::Integer(val as i64), next))
        }
        // 1: Negative integer
        1 => {
            let (val, next) = read_argument(data, additional, pos)?;
            Ok((CborValue::Integer(-1 - val as i64), next))
        }
        // 2: Byte string
        2 => {
            let (len, next) = read_argument(data, additional, pos)?;
            pos = next;
            let len = len as usize;
            if pos + len > data.len() {
                return Err("byte string truncated".into());
            }
            let bytes = data[pos..pos + len].to_vec();
            pos += len;
            Ok((CborValue::Bytes(bytes), pos))
        }
        // 3: Text string
        3 => {
            let (len, next) = read_argument(data, additional, pos)?;
            pos = next;
            let len = len as usize;
            if pos + len > data.len() {
                return Err("text string truncated".into());
            }
            let text = String::from_utf8(data[pos..pos + len].to_vec())
                .map_err(|_| "invalid UTF-8 in text string")?;
            pos += len;
            Ok((CborValue::Text(text), pos))
        }
        // 4: Array
        4 => {
            let (count, next) = read_argument(data, additional, pos)?;
            pos = next;
            let mut arr = Vec::with_capacity(count as usize);
            for _ in 0..count {
                let (val, next) = decode(data, pos)?;
                pos = next;
                arr.push(val);
            }
            Ok((CborValue::Array(arr), pos))
        }
        // 5: Map
        5 => {
            let (count, next) = read_argument(data, additional, pos)?;
            pos = next;
            let mut map = BTreeMap::new();
            for _ in 0..count {
                let (key, next) = decode(data, pos)?;
                pos = next;
                let key_str = match key {
                    CborValue::Text(s) => s,
                    _ => return Err("non-string map key in DAG-CBOR".into()),
                };
                let (val, next) = decode(data, pos)?;
                pos = next;
                map.insert(key_str, val);
            }
            Ok((CborValue::Map(map), pos))
        }
        // 6: Tag
        6 => {
            let (tag, next) = read_argument(data, additional, pos)?;
            pos = next;
            if tag == 42 {
                // DAG-CBOR CID link — tag 42 wrapping a byte string
                // The byte string starts with 0x00 (identity multibase) then the CID
                let (inner, next) = decode(data, pos)?;
                pos = next;
                match inner {
                    CborValue::Bytes(bytes) => {
                        if bytes.is_empty() || bytes[0] != 0x00 {
                            return Err("CID link missing 0x00 prefix".into());
                        }
                        let (cid, _) = Cid::read(&bytes, 1)
                            .map_err(|e| format!("CID parse error: {}", e))?;
                        Ok((CborValue::Link(cid), pos))
                    }
                    _ => Err("tag 42 must wrap bytes".into()),
                }
            } else {
                // Unknown tag — just decode the inner value
                decode(data, pos)
            }
        }
        // 7: Simple values and floats
        7 => {
            match additional {
                20 => Ok((CborValue::Bool(false), pos)),
                21 => Ok((CborValue::Bool(true), pos)),
                22 => Ok((CborValue::Null, pos)),
                25 => {
                    // Float16 — convert to f64
                    if pos + 2 > data.len() {
                        return Err("float16 truncated".into());
                    }
                    let bits = u16::from_be_bytes([data[pos], data[pos + 1]]);
                    pos += 2;
                    Ok((CborValue::Float(f16_to_f64(bits)), pos))
                }
                26 => {
                    // Float32
                    if pos + 4 > data.len() {
                        return Err("float32 truncated".into());
                    }
                    let bits = u32::from_be_bytes([data[pos], data[pos+1], data[pos+2], data[pos+3]]);
                    pos += 4;
                    Ok((CborValue::Float(f32::from_bits(bits) as f64), pos))
                }
                27 => {
                    // Float64
                    if pos + 8 > data.len() {
                        return Err("float64 truncated".into());
                    }
                    let mut buf = [0u8; 8];
                    buf.copy_from_slice(&data[pos..pos + 8]);
                    pos += 8;
                    Ok((CborValue::Float(f64::from_bits(u64::from_be_bytes(buf))), pos))
                }
                _ => Err(format!("unsupported simple value: {}", additional)),
            }
        }
        _ => Err(format!("unsupported CBOR major type: {}", major)),
    }
}

fn read_argument(data: &[u8], additional: u8, pos: usize) -> Result<(u64, usize), String> {
    match additional {
        0..=23 => Ok((additional as u64, pos)),
        24 => {
            if pos >= data.len() { return Err("argument truncated".into()); }
            Ok((data[pos] as u64, pos + 1))
        }
        25 => {
            if pos + 2 > data.len() { return Err("argument truncated".into()); }
            Ok((u16::from_be_bytes([data[pos], data[pos + 1]]) as u64, pos + 2))
        }
        26 => {
            if pos + 4 > data.len() { return Err("argument truncated".into()); }
            Ok((u32::from_be_bytes([data[pos], data[pos+1], data[pos+2], data[pos+3]]) as u64, pos + 4))
        }
        27 => {
            if pos + 8 > data.len() { return Err("argument truncated".into()); }
            let mut buf = [0u8; 8];
            buf.copy_from_slice(&data[pos..pos + 8]);
            Ok((u64::from_be_bytes(buf), pos + 8))
        }
        _ => Err(format!("unsupported CBOR additional info: {}", additional)),
    }
}

fn f16_to_f64(bits: u16) -> f64 {
    let sign = ((bits >> 15) & 1) as u64;
    let exponent = ((bits >> 10) & 0x1f) as i32;
    let mantissa = (bits & 0x3ff) as f64;

    let val = if exponent == 0 {
        mantissa * 2.0f64.powi(-24)
    } else if exponent == 31 {
        if mantissa == 0.0 { f64::INFINITY } else { f64::NAN }
    } else {
        (1.0 + mantissa / 1024.0) * 2.0f64.powi(exponent - 15)
    };

    if sign == 1 { -val } else { val }
}
