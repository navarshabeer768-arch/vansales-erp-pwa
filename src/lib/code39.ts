/**
 * Code 39 barcode: each character maps to a fixed pattern of 9 bars/spaces
 * (5 wide, 4 narrow — or vice versa), separated by a narrow gap. This is a
 * real, standard encoding table — Code 39 is deliberately simple enough to
 * implement directly, unlike Code 128 or QR which need more machinery.
 */
const CODE39_PATTERNS: Record<string, string> = {
  '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
  '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
  '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
  'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
  'G': '101010011011', 'H': '110101010011', 'I': '101101010011', 'J': '101011010011',
  'K': '110101001101', 'L': '101101001101', 'M': '110110100011', 'N': '101011100101',
  'O': '110101110001', 'P': '101101110001', 'Q': '101010001101', 'R': '110101000101',
  'S': '101101000101', 'T': '101011000101', 'U': '110010101011', 'V': '100110101011',
  'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
  '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101',
};

function sanitizeForCode39(value: string): string {
  // Code 39 only supports 0-9, A-Z, space, and - . $ / + %. Uppercase and
  // strip anything else so arbitrary SKUs/barcodes still render sensibly.
  return value.toUpperCase().replace(/[^0-9A-Z\-. ]/g, '');
}

/** Returns an SVG string for a Code 39 barcode of the given value. */
export function renderCode39Svg(value: string, opts?: { width?: number; height?: number; showText?: boolean }): string {
  const width = opts?.width ?? 200;
  const height = opts?.height ?? 60;
  const showText = opts?.showText ?? true;
  const clean = sanitizeForCode39(value);
  const withGuards = `*${clean}*`;

  const narrow = 2;
  const wide = narrow * 2.5;
  let x = 0;
  const bars: string[] = [];

  for (const char of withGuards) {
    const pattern = CODE39_PATTERNS[char];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i++) {
      const isBar = i % 2 === 0;
      const barWidth = pattern[i] === '1' ? wide : narrow;
      if (isBar) bars.push(`<rect x="${x}" y="0" width="${barWidth}" height="${showText ? height - 14 : height}" fill="black"/>`);
      x += barWidth;
    }
    x += narrow; // inter-character gap
  }

  const totalWidth = x;
  const scale = width / totalWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <g transform="scale(${scale},1)">${bars.join('')}</g>
    ${showText ? `<text x="${width / 2}" y="${height - 2}" font-family="monospace" font-size="11" text-anchor="middle">${clean}</text>` : ''}
  </svg>`;
}
