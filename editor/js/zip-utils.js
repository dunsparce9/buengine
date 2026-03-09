/**
 * Minimal ZIP creation and extraction — no dependencies.
 * Uses STORE method (no compression) for simplicity.
 */

/* ── ZIP creation ──────────────────────────────── */

/**
 * Create a ZIP file from an array of { path: string, data: Uint8Array }.
 * Returns a Blob.
 */
export function createZip(files) {
  const entries = [];
  let offset = 0;

  // Build local file headers + data
  const localParts = [];
  for (const { path, data } of files) {
    const nameBytes = new TextEncoder().encode(path);
    const crc = crc32(data);

    // Local file header (30 + name length)
    const header = new ArrayBuffer(30);
    const hv = new DataView(header);
    hv.setUint32(0, 0x04034b50, true);   // signature
    hv.setUint16(4, 20, true);            // version needed
    hv.setUint16(6, 0, true);             // flags
    hv.setUint16(8, 0, true);             // compression: STORE
    hv.setUint16(10, 0, true);            // mod time
    hv.setUint16(12, 0, true);            // mod date
    hv.setUint32(14, crc, true);          // crc-32
    hv.setUint32(18, data.length, true);  // compressed size
    hv.setUint32(22, data.length, true);  // uncompressed size
    hv.setUint16(26, nameBytes.length, true); // filename length
    hv.setUint16(28, 0, true);            // extra field length

    entries.push({ nameBytes, crc, size: data.length, offset });
    localParts.push(new Uint8Array(header), nameBytes, data);
    offset += 30 + nameBytes.length + data.length;
  }

  // Central directory
  const centralParts = [];
  let centralSize = 0;
  for (const { nameBytes, crc, size, offset: localOffset } of entries) {
    const cd = new ArrayBuffer(46);
    const cv = new DataView(cd);
    cv.setUint32(0, 0x02014b50, true);   // signature
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // compression: STORE
    cv.setUint16(12, 0, true);            // mod time
    cv.setUint16(14, 0, true);            // mod date
    cv.setUint32(16, crc, true);          // crc-32
    cv.setUint32(20, size, true);         // compressed size
    cv.setUint32(24, size, true);         // uncompressed size
    cv.setUint16(28, nameBytes.length, true); // filename length
    cv.setUint16(30, 0, true);            // extra field length
    cv.setUint16(32, 0, true);            // comment length
    cv.setUint16(34, 0, true);            // disk number start
    cv.setUint16(36, 0, true);            // internal attrs
    cv.setUint32(38, 0, true);            // external attrs
    cv.setUint32(42, localOffset, true);  // local header offset

    centralParts.push(new Uint8Array(cd), nameBytes);
    centralSize += 46 + nameBytes.length;
  }

  // End of central directory
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);    // signature
  ev.setUint16(4, 0, true);              // disk number
  ev.setUint16(6, 0, true);              // disk with central dir
  ev.setUint16(8, entries.length, true);  // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, centralSize, true);    // central dir size
  ev.setUint32(16, offset, true);         // central dir offset
  ev.setUint16(20, 0, true);             // comment length

  return new Blob([...localParts, ...centralParts, new Uint8Array(eocd)], { type: 'application/zip' });
}

/* ── ZIP extraction ────────────────────────────── */

/**
 * Extract files from a ZIP ArrayBuffer.
 * Returns an array of { path: string, data: Uint8Array }.
 */
export function readZip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Find End of Central Directory (search backwards)
  let eocdOffset = -1;
  for (let i = buffer.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid ZIP: EOCD not found');

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);

  const files = [];
  let pos = cdOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;

    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);

    const nameBytes = bytes.slice(pos + 46, pos + 46 + nameLen);
    const path = new TextDecoder().decode(nameBytes);

    // Read data from local file header
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const compSize = view.getUint32(localOffset + 18, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.slice(dataStart, dataStart + compSize);

    // Skip directory entries
    if (!path.endsWith('/')) {
      files.push({ path, data: new Uint8Array(data) });
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}

/* ── CRC-32 ────────────────────────────────────── */

const _crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  _crcTable[i] = c;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = _crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
