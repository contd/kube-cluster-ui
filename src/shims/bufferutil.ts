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

const unmask = (buffer: Uint8Array, mask: Uint8Array): void => {
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] ^= mask[index & 3];
  }
};

export { mask, unmask };
export default { mask, unmask };
