import crypto from 'crypto';

export type EncryptedField = {
  ciphertext: string | null;
  iv: string | null;
  authTag: string | null;
};

function getKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('APP_ENCRYPTION_KEY is required.');
  }

  const maybeBase64 = Buffer.from(raw, 'base64');
  if (maybeBase64.length === 32) return maybeBase64;

  const maybeHex = Buffer.from(raw, 'hex');
  if (maybeHex.length === 32) return maybeHex;

  throw new Error('APP_ENCRYPTION_KEY must decode to 32 bytes. Use: openssl rand -base64 32');
}

export function encryptString(value: string | null | undefined): EncryptedField {
  if (!value) return { ciphertext: null, iv: null, authTag: null };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

export function decryptString(field: EncryptedField): string | null {
  if (!field.ciphertext || !field.iv || !field.authTag) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(field.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(field.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(field.ciphertext, 'base64')),
    decipher.final()
  ]);
  return plaintext.toString('utf8');
}
