/** Validates a byte array as strict UTF-8 without accepting malformed sequences. */
/**
 * @param value - Bytes to decode as UTF-8.
 * @returns `true` when decoding succeeds, otherwise `false`.
 */
const isValidUTF8 = (value: Uint8Array): boolean => {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(value);
    return true;
  } catch {
    return false;
  }
};

/** UTF-8 validation function matching the optional `utf-8-validate` package API. */
export { isValidUTF8 };
/** Default export matching the optional `utf-8-validate` package shape. */
export default { isValidUTF8 };
