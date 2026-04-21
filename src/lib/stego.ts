/**
 * Steganography + AES-GCM encryption helpers.
 *
 * Layout embedded in image LSBs (R,G,B channels, alpha untouched):
 *   [ MAGIC (4 bytes) | SALT (16) | IV (12) | LEN (4, big-endian) | CIPHERTEXT (LEN) ]
 *
 * Each byte is split across 8 LSB slots — one bit per RGB channel of consecutive pixels.
 */

const MAGIC = new Uint8Array([0x53, 0x54, 0x47, 0x31]); // "STG1"
const SALT_LEN = 16;
const IV_LEN = 12;
const LEN_FIELD = 4;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN + LEN_FIELD; // 36 bytes

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------------- Crypto ---------------- */

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMessage(message: string, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(message)),
  );
  return { salt, iv, ciphertext };
}

export async function decryptMessage(
  ciphertext: Uint8Array,
  passphrase: string,
  salt: Uint8Array,
  iv: Uint8Array,
): Promise<string> {
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return dec.decode(plain);
}

/* ---------------- Bit helpers ---------------- */

function bytesToBits(bytes: Uint8Array): Uint8Array {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    for (let j = 0; j < 8; j++) bits[i * 8 + j] = (b >> (7 - j)) & 1;
  }
  return bits;
}

function bitsToBytes(bits: Uint8Array): Uint8Array {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    out[i] = b;
  }
  return out;
}

/** Capacity in bytes — 3 bits per pixel (R,G,B), 8 bits per byte. */
export function capacityBytes(width: number, height: number) {
  return Math.floor((width * height * 3) / 8);
}

/* ---------------- Embed / Extract ---------------- */

export function embedIntoImageData(
  imageData: ImageData,
  payload: Uint8Array,
): ImageData {
  const data = imageData.data;
  const cap = capacityBytes(imageData.width, imageData.height);
  if (payload.length > cap) {
    throw new Error(
      `Payload too large: needs ${payload.length} B, image fits ${cap} B. Use a larger image.`,
    );
  }
  const bits = bytesToBits(payload);

  let bitIdx = 0;
  for (let i = 0; i < data.length && bitIdx < bits.length; i += 4) {
    for (let c = 0; c < 3 && bitIdx < bits.length; c++) {
      data[i + c] = (data[i + c] & 0xfe) | bits[bitIdx++];
    }
    // alpha channel (i+3) untouched
  }
  return imageData;
}

function readBytesFromImage(imageData: ImageData, byteCount: number, startBit = 0): Uint8Array {
  const data = imageData.data;
  const totalBits = byteCount * 8;
  const bits = new Uint8Array(totalBits);
  let bitIdx = 0;
  let globalBit = 0;
  for (let i = 0; i < data.length && bitIdx < totalBits; i += 4) {
    for (let c = 0; c < 3 && bitIdx < totalBits; c++) {
      if (globalBit >= startBit) {
        bits[bitIdx++] = data[i + c] & 1;
      }
      globalBit++;
    }
  }
  if (bitIdx < totalBits) throw new Error("Image too small to contain hidden data.");
  return bitsToBytes(bits);
}

export function buildPayload(salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER_LEN + ciphertext.length);
  let o = 0;
  out.set(MAGIC, o); o += MAGIC.length;
  out.set(salt, o); o += SALT_LEN;
  out.set(iv, o); o += IV_LEN;
  // big-endian length
  out[o++] = (ciphertext.length >>> 24) & 0xff;
  out[o++] = (ciphertext.length >>> 16) & 0xff;
  out[o++] = (ciphertext.length >>> 8) & 0xff;
  out[o++] = ciphertext.length & 0xff;
  out.set(ciphertext, o);
  return out;
}

export function extractFromImageData(imageData: ImageData) {
  // Read header first
  const header = readBytesFromImage(imageData, HEADER_LEN);
  for (let i = 0; i < MAGIC.length; i++) {
    if (header[i] !== MAGIC[i]) throw new Error("No hidden data found in this image.");
  }
  const salt = header.slice(4, 4 + SALT_LEN);
  const iv = header.slice(4 + SALT_LEN, 4 + SALT_LEN + IV_LEN);
  const len =
    (header[32] << 24) | (header[33] << 16) | (header[34] << 8) | header[35];
  if (len <= 0 || len > capacityBytes(imageData.width, imageData.height)) {
    throw new Error("Corrupted hidden data length.");
  }
  // Read full payload (header + ciphertext) in one pass
  const full = readBytesFromImage(imageData, HEADER_LEN + len);
  const ciphertext = full.slice(HEADER_LEN);
  return { salt, iv, ciphertext };
}

/* ---------------- Image IO ---------------- */

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image."));
    };
    img.src = url;
  });
}

export function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported.");
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode PNG."))),
      "image/png",
    );
  });
}
