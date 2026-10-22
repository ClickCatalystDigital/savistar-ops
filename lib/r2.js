// lib/r2.js — Cloudflare R2 via the S3 SDK. Same pattern as ls_crm, new account/bucket.
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

let r2 = null;
function client() {
  if (!r2) {
    r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return r2;
}

// Public demo (DEMO_MODE=1): files go to the shared demo bucket through the Worker binding DEMO_FILES,
// under interiors/ (SB Ops' demo uses the same bucket). Only the owner-pass browser may upload or
// delete; files are served back by /api/demo-files/<key> since the bucket has no public address.
const DEMO_PREFIX = 'interiors/';
const DEMO_URL = '/api/demo-files/';
export function demoBucket() {
  if (process.env.DEMO_MODE !== '1') return null;
  return globalThis[Symbol.for('__cloudflare-context__')]?.env?.DEMO_FILES || null;
}
async function requireDemoOwner() {
  const [{ cookies }, { isOwnerPass }] = await Promise.all([import('next/headers'), import('./demo-leads.js')]);
  if (!isOwnerPass((await cookies()).get('demo_lead')?.value)) {
    throw Object.assign(new Error('Uploads are turned off in the public demo'), { status: 403 });
  }
}
export const isDemoFileKey = key => key.startsWith(DEMO_PREFIX) && !key.includes('..');

export function isR2Configured() {
  if (demoBucket()) return true;
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}

// Uploads a Buffer, returns the public URL.
export async function uploadToR2(buffer, filename, contentType) {
  const key = `${Date.now()}-${filename.replace(/\s+/g, '_')}`;
  const demo = demoBucket();
  if (demo) {
    await requireDemoOwner();
    await demo.put(DEMO_PREFIX + key, buffer, { httpMetadata: { contentType: contentType || 'application/octet-stream' } });
    return DEMO_URL + DEMO_PREFIX + key;
  }
  await client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  const domain = (process.env.R2_PUBLIC_DOMAIN_URL || '').trim().replace(/^https?:\/\//i, '');
  return `https://${domain}/${key}`;
}

export async function deleteFromR2(fileUrl) {
  const demo = demoBucket();
  if (demo) {
    if (!fileUrl.startsWith(DEMO_URL)) return; // a seeded/static picture, nothing stored
    await requireDemoOwner();
    await demo.delete(fileUrl.slice(DEMO_URL.length));
    return;
  }
  const key = fileUrl.split('/').pop();
  await client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
}
