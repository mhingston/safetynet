export interface FragmentChunk {
  lines: string[];
  offsetLine: number;
}

export function chunkIntoFragments(
  lines: string[],
  windowSize: number = 250,
  overlap: number = 50,
): FragmentChunk[] {
  const chunks: FragmentChunk[] = [];
  const step = windowSize - overlap;
  for (let i = 0; i < lines.length; i += step) {
    const chunk = lines.slice(i, i + windowSize);
    chunks.push({ lines: chunk, offsetLine: i + 1 });
    if (i + windowSize >= lines.length) break;
  }
  return chunks;
}

export function isBinaryFile(filePath: string): boolean {
  const binaryExts = /\.(?:jpg|jpeg|png|gif|bmp|svg|ico|tif|tiff|eot|ttf|woff|woff2|otf|dll|exe|pdb|bin|pdf|doc|docx|xls|xlsx|so|dylib|a|lib|o|pyc|class|jar|war|wasm)$/i;
  return binaryExts.test(filePath);
}