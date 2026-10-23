// lib/pdfPassword.js — password-protected bank-statement PDFs.
// Decryption via @muhammara/native (recrypt with no new encryption = strip it). The password is
// remembered per bank label in app_settings, encrypted the same way as the OpenRouter key
// (lib/secrets.js) — so the overlay in the Bank tab only needs to ask once per bank.
import { queryOne, execute } from './db';
import { encryptSecret, decryptSecret } from './secrets';
import { nowIST } from './assistant';
import { recrypt, createReader, PDFRStreamForBuffer, PDFWStreamForBuffer } from '@muhammara/native';

const settingsKey = (bankName) => `bank_pdf_pw:${String(bankName || '').trim().toLowerCase()}`;

export async function getSavedPassword(bankName) {
  if (!bankName) return null;
  const row = await queryOne('SELECT value FROM app_settings WHERE key = ?', [settingsKey(bankName)]);
  return row?.value ? decryptSecret(row.value) : null;
}

export async function savePassword(bankName, password, user) {
  if (!bankName || !password) return;
  await execute(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [settingsKey(bankName), await encryptSecret(password), user || null, nowIST()]);
}

// Decrypts `buffer` with `password`. If the PDF isn't encrypted, `password` is ignored and the
// bytes pass through unchanged. Throws if it's encrypted and the password is missing or wrong.
export function decryptPdf(buffer, password) {
  const dst = new PDFWStreamForBuffer();
  recrypt(new PDFRStreamForBuffer(buffer), dst, password ? { password } : null);
  return dst.buffer;
}

// The real page count of an already-decrypted PDF — so extraction loops exactly that many times
// instead of a hardcoded guess (lib/extract.js).
export function getPageCount(buffer) {
  const reader = createReader(new PDFRStreamForBuffer(buffer));
  try { return reader.getPagesCount(); } finally { reader.end(); }
}
