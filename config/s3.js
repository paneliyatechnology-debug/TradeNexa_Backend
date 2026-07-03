/**
 * Railway / S3-compatible object storage configuration.
 *
 * Railway Bucket injects: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_ENDPOINT_URL, AWS_S3_BUCKET_NAME, AWS_DEFAULT_REGION
 */

// ==========================================
// S3 settings
// ==========================================

const bucket =
  process.env.AWS_S3_BUCKET_NAME ||
  process.env.S3_BUCKET_NAME ||
  process.env.S3_BUCKET ||
  '';

const endpoint =
  process.env.AWS_ENDPOINT_URL ||
  process.env.S3_ENDPOINT ||
  process.env.AWS_S3_ENDPOINT ||
  '';

const region =
  process.env.AWS_DEFAULT_REGION ||
  process.env.AWS_REGION ||
  process.env.S3_REGION ||
  'auto';

const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '';
const secretAccessKey =
  process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '';

/** Optional public URL base (e.g. Railway bucket public URL or CDN). */
const publicUrl =
  process.env.AWS_S3_PUBLIC_URL ||
  process.env.S3_PUBLIC_URL ||
  process.env.AWS_PUBLIC_URL ||
  '';

/** Optional key prefix inside the bucket (e.g. tradenexa). */
const keyPrefix = (process.env.AWS_S3_PREFIX || process.env.S3_PREFIX || '')
  .replace(/^\/+|\/+$/g, '');

const isEnabled = () => Boolean(bucket && accessKeyId && secretAccessKey);

module.exports = {
  bucket,
  endpoint,
  region,
  accessKeyId,
  secretAccessKey,
  publicUrl,
  keyPrefix,
  isEnabled,
};
