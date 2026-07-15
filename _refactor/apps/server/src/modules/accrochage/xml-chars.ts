/**
 * XML 1.0 character validation shared by the CDC producer and CRT parser.
 * JavaScript strings can contain lone UTF-16 surrogates, which are not valid
 * XML characters even though most serializers will accept the string.
 */
export function isXml10Text(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (
      codeUnit === 0x09 ||
      codeUnit === 0x0a ||
      codeUnit === 0x0d ||
      (codeUnit >= 0x20 && codeUnit <= 0xd7ff) ||
      (codeUnit >= 0xe000 && codeUnit <= 0xfffd)
    ) {
      continue;
    }

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
    }

    return false;
  }

  return true;
}

export function assertXml10Text(value: string): void {
  if (!isXml10Text(value)) {
    throw new TypeError("Invalid XML 1.0 character");
  }
}
