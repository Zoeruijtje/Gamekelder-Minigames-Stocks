import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readBackground() {
  const parts = Array.from({ length: 9 }, (_, index) => {
    const suffix = String(index).padStart(2, '0');
    return fs.readFileSync(path.join(root, 'assets', 'background', `desktop.${suffix}.b64`), 'utf8').replace(/\s+/g, '');
  });
  return Buffer.from(parts.join(''), 'base64');
}

function parseLossyWebpDimensions(bytes) {
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8 ');
  assert.deepEqual([...bytes.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff,
  };
}

test('high-quality background chunks reconstruct the approved WebP', () => {
  const bytes = readBackground();
  assert.ok(bytes.length >= 70_000, `Expected at least 70000 bytes, received ${bytes.length}`);
  assert.deepEqual(parseLossyWebpDimensions(bytes), { width: 1536, height: 864 });
});
