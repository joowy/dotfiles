// ABOUTME: Encodes and decodes variable-length unsigned integers for on-page storage.
// ABOUTME: Reports truncation and overflow when byte sequences cannot be decoded safely.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VarintError {
    Truncated,
    Overflow,
}
/**
Encodes a 64-bit number into a compressed, variable-length sequence of bytes.

Breaks the number into 7-bit chunks and packs them into bytes. Bytes with
the high bit set (0x80) indicate more data follows; the last byte has the
high bit clear. Small numbers use fewer bytes — `0..=127` fits in one byte,
`128..=16383` uses two.
*/
pub fn encode_u64(mut value: u64) -> Vec<u8> {
    let mut bytes = Vec::new();

    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;

        if value != 0 {
            byte |= 0x80;
        }

        bytes.push(byte);

        if value == 0 {
            break;
        }
    }

    bytes
}

/**
Decodes a variable-length encoded unsigned integer from a byte slice.

Reads bytes sequentially, extracting 7 payload bits from each. Returns the
decoded value and the number of bytes consumed. Returns [`VarintError::Overflow`]
if the sequence exceeds 10 bytes or the payload would exceed `u64::MAX`,
and [`VarintError::Truncated`] if the slice ends before a terminating byte
(high bit clear) is found.
*/
pub fn decode_u64(bytes: &[u8]) -> Result<(u64, usize), VarintError> {
    let mut value = 0_u64;

    for (index, byte) in bytes.iter().copied().enumerate() {
        if index == 10 {
            return Err(VarintError::Overflow);
        }

        let shift = (index * 7) as u32;
        let payload = (byte & 0x7f) as u64;

        if shift == 63 && payload > 1 {
            return Err(VarintError::Overflow);
        }

        value |= payload << shift;

        if byte & 0x80 == 0 {
            return Ok((value, index + 1));
        }
    }

    if bytes.len() >= 10 {
        return Err(VarintError::Overflow);
    }

    Err(VarintError::Truncated)
}

#[cfg(test)]
mod tests {
    use super::{VarintError, decode_u64, encode_u64};

    #[test]
    fn round_trips_boundary_values() {
        let cases = [
            0,
            1,
            127,
            128,
            255,
            16_383,
            16_384,
            1 << 20,
            1 << 32,
            u64::MAX,
        ];

        for value in cases {
            let encoded = encode_u64(value);
            let (decoded, consumed) = decode_u64(&encoded).unwrap();

            assert_eq!(decoded, value);
            assert_eq!(consumed, encoded.len());
        }
    }

    #[test]
    fn rejects_truncated_sequences() {
        let encoded = encode_u64(16_384);

        for prefix_len in 0..encoded.len() {
            let error = decode_u64(&encoded[..prefix_len]).unwrap_err();
            assert_eq!(error, VarintError::Truncated);
        }
    }

    #[test]
    fn rejects_overflow_sequences() {
        let bytes = [0x81; 10];
        let error = decode_u64(&bytes).unwrap_err();

        assert_eq!(error, VarintError::Overflow);
    }
}
