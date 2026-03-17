/// CID (Content Identifier) parsing
/// ATProto uses CIDv1 with dag-cbor (0x71) codec and sha-256 (0x12) hash
use crate::varint;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Cid {
    pub version: u64,
    pub codec: u64,
    pub hash: Vec<u8>,
}

impl Cid {
    /// Parse a CID from bytes, returns (Cid, bytes_consumed)
    pub fn read(data: &[u8], offset: usize) -> Result<(Cid, usize), &'static str> {
        let mut pos = offset;

        // CIDv1: version + codec + multihash
        let (version, next) = varint::read_uvarint(data, pos)?;
        pos = next;

        if version == 0x12 {
            // This looks like a CIDv0 (starts with sha2-256 hash function code)
            // CIDv0 = raw multihash (0x12 = sha2-256, then length, then digest)
            let hash_len = 32; // sha2-256
            let (_, next) = varint::read_uvarint(data, pos)?;
            pos = next;
            if pos + hash_len > data.len() {
                return Err("CIDv0 hash truncated");
            }
            let hash = data[pos..pos + hash_len].to_vec();
            pos += hash_len;
            return Ok((
                Cid {
                    version: 0,
                    codec: 0x55, // raw
                    hash,
                },
                pos,
            ));
        }

        if version != 1 {
            return Err("unsupported CID version");
        }

        let (codec, next) = varint::read_uvarint(data, pos)?;
        pos = next;

        // Multihash: hash_func_code + digest_size + digest
        let (hash_func, next) = varint::read_uvarint(data, pos)?;
        pos = next;
        let _ = hash_func; // typically 0x12 (sha2-256)

        let (digest_size, next) = varint::read_uvarint(data, pos)?;
        pos = next;

        if pos + digest_size as usize > data.len() {
            return Err("CID hash truncated");
        }
        let hash = data[pos..pos + digest_size as usize].to_vec();
        pos += digest_size as usize;

        Ok((Cid { version, codec, hash }, pos))
    }

    pub fn to_hex(&self) -> String {
        self.hash.iter().map(|b| format!("{:02x}", b)).collect()
    }
}
