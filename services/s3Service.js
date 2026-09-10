/**
 * S3-compatible object storage (Railway Bucket, AWS S3, MinIO).
 */
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const config = require('../config');
const s3Config = require('../config/s3');

// ==========================================
// Client
// ==========================================

let client = null;

const getClient = () => {
  if (!s3Config.isEnabled()) {
    throw new Error('S3 storage is not configured');
  }
  if (!client) {
    client = new S3Client({
      region: s3Config.region,
      endpoint: s3Config.endpoint || undefined,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      forcePathStyle: Boolean(s3Config.endpoint),
    });
  }
  return client;
};

// ==========================================
// Key helpers
// ==========================================

/** Build full S3 object key with optional prefix. */
const buildObjectKey = (relativePath) => {
  const normalized = String(relativePath || '').replace(/^\/+/, '');
  if (!s3Config.keyPrefix) return normalized;
  return `${s3Config.keyPrefix}/${normalized}`;
};

/** Strip configured prefix from a stored key (for DB round-trip). */
const stripObjectKeyPrefix = (key) => {
  if (!key || !s3Config.keyPrefix) return key;
  const prefix = `${s3Config.keyPrefix}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
};

// ==========================================
// Public API
// ==========================================

/**
 * Upload a file buffer to S3.
 * @returns {Promise<string>} Relative path stored in DB (without bucket prefix in keyPrefix logic)
 */
const uploadBuffer = async (relativePath, buffer, contentType) => {
  const objectKey = buildObjectKey(relativePath);
  await getClient().send(
    new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
  return relativePath;
};

/** Delete an object from S3 (accepts relative path or full URL). */
const deleteObject = async (storedValue) => {
  if (!storedValue || /^https?:\/\//i.test(storedValue)) {
    if (!storedValue || !s3Config.isEnabled()) return;
    const keyFromUrl = extractKeyFromUrl(storedValue);
    if (!keyFromUrl) return;
    storedValue = keyFromUrl;
  }

  const objectKey = buildObjectKey(stripObjectKeyPrefix(storedValue));
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: s3Config.bucket,
        Key: objectKey,
      }),
    );
  } catch (err) {
    if (err.name !== 'NoSuchKey') throw err;
  }
};

/** Resolve a DB-stored relative path to a browser-accessible URL. */
const getPublicUrl = (relativePath) => {
  if (!relativePath) return null;

  const normalized = String(relativePath).replace(/^\/+/, '');

  // Use direct bucket URL only when a dedicated public CDN/base URL is configured.
  if (s3Config.publicUrl) {
    const objectKey = buildObjectKey(normalized);
    let pub = s3Config.publicUrl.replace(/\/$/, '');
    if (!/^https?:\/\//i.test(pub)) pub = `https://${pub}`;
    return `${pub}/${objectKey}`;
  }

  // Always serve through public live backend media proxy.
  return `https://tradenexabackend-dev.up.railway.app/media/${normalized}`;
};

/** Fetch an object from S3 for streaming through the media proxy. */
const getObject = async (relativePath) => {
  const clean = String(relativePath || '').replace(/^\/+/, '');
  const candidateKeys = Array.from(
    new Set(
      [
        buildObjectKey(stripObjectKeyPrefix(clean)),
        `tradenexa/${clean}`,
        `tradenexa/${clean.replace(/^uploads\//, '')}`,
        clean,
        clean.replace(/^uploads\//, ''),
      ].filter(Boolean),
    ),
  );

  for (const key of candidateKeys) {
    try {
      const response = await getClient().send(
        new GetObjectCommand({
          Bucket: s3Config.bucket,
          Key: key,
        }),
      );
      if (response) return response;
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw err;
    }
  }

  const notFoundErr = new Error('File not found in S3');
  notFoundErr.name = 'NoSuchKey';
  throw notFoundErr;
};

/** Try to extract relative storage path from a full URL (S3, proxy, or legacy). */
const extractKeyFromUrl = (url) => {
  try {
    let raw = String(url || '').trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }
    const parsed = new URL(raw);

    const mediaMatch = parsed.pathname.match(/^\/(?:media|uploads|api\/media|api\/uploads)\/(.+)$/);
    if (mediaMatch) {
      return stripObjectKeyPrefix(mediaMatch[1]);
    }

    const pathParts = parsed.pathname.replace(/^\/+/, '').split('/');
    if (pathParts[0] === s3Config.bucket) {
      pathParts.shift();
    }
    const key = pathParts.join('/');
    return stripObjectKeyPrefix(key);
  } catch {
    return null;
  }
};

/** Normalize any stored value to a relative path for DB/API use. */
const normalizeStoredPath = (storedValue) => {
  if (!storedValue) return null;
  const str = String(storedValue).trim();
  if (/^https?:\/\//i.test(str) || /^(?:tradenexabackend|localhost|127\.0\.0\.1)/i.test(str)) {
    return extractKeyFromUrl(str) || str.replace(/^\/+/, '');
  }
  return str.replace(/^\/+/, '');
};

module.exports = {
  isEnabled: s3Config.isEnabled,
  uploadBuffer,
  deleteObject,
  getObject,
  getPublicUrl,
  buildObjectKey,
  extractKeyFromUrl,
  normalizeStoredPath,
};
