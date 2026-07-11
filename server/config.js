import os from 'node:os';
import path from 'node:path';

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  tempRoot: path.resolve(process.env.METADATA_LAB_TMP || path.join(os.tmpdir(), 'metadata-lab')),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 100 * 1024 * 1024),
  expirationMs: Number(process.env.FILE_EXPIRATION_MS || 15 * 60 * 1000),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 60),
  exiftoolPath: process.env.EXIFTOOL_PATH || 'exiftool',
};
