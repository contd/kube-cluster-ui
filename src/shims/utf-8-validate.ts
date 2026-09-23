const isValidUTF8 = (value: Uint8Array): boolean => {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(value);
    return true;
  } catch {
    return false;
  }
};

export { isValidUTF8 };
export default { isValidUTF8 };
