// Cloudflare Workers build of lib/pdfPassword.js. Bank-statement AI extraction is already switched
// off in the demo (lib/demo-features.js), and @muhammara/native is a compiled Node addon that can't
// load in a Workers isolate — swapped out here (next.config.js) so the import itself stays safe.
export async function getSavedPassword() { return null; }
export async function savePassword() {}
export function decryptPdf() { throw new Error('PDF password handling is not available in this demo'); }
