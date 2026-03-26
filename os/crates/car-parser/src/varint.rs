/// Unsigned LEB128 varint decoding (used by CAR format and CID)

pub fn read_uvarint(data: &[u8], offset: usize) -> Result<(u64, usize), &'static str> {
    let mut result: u64 = 0;
    let mut shift = 0u32;
    let mut pos = offset;

    loop {
        if pos >= data.len() {
            return Err("unexpected end of varint");
        }
        let byte = data[pos];
        pos += 1;

        result |= ((byte & 0x7f) as u64) << shift;

        if byte & 0x80 == 0 {
            return Ok((result, pos));
        }

        shift += 7;
        if shift >= 64 {
            return Err("varint too large");
        }
    }
}
