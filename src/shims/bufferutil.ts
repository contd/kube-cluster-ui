/** Applies the WebSocket masking key to a byte range. */
/**
 * @param source - Source bytes to mask.
 * @param mask - Four-byte WebSocket masking key.
 * @param output - Destination buffer for the transformed bytes.
 * @param offset - Destination offset at which to write.
 * @param length - Number of bytes to transform.
 * @returns Nothing; writes masked bytes into `output`.
 */
const mask = (
  source: Uint8Array,
  mask: Uint8Array,
  output: Uint8Array,
  offset: number,
  length: number,
): void => {
  for (let index = 0; index < length; index += 1) {
    output[offset + index] = source[index] ^ mask[index & 3];
  }
};

/** Reverses WebSocket masking in place using the four-byte masking key. */
/**
 * @param buffer - Buffer whose masked contents should be restored in place.
 * @param mask - Four-byte WebSocket masking key.
 * @returns Nothing; mutates `buffer`.
 */
const unmask = (buffer: Uint8Array, mask: Uint8Array): void => {
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] ^= mask[index & 3];
  }
};

/** Browser-compatible WebSocket masking operations. */
export { mask, unmask };
/** Default export matching the optional `bufferutil` package shape. */
export default { mask, unmask };
