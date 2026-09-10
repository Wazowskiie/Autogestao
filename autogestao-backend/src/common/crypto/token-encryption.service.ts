import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Criptografa/descriptografa segredos (tokens de API de terceiros, etc.)
 * antes de salvar no banco. Usa AES-256-GCM.
 *
 * Requer a variável de ambiente TOKEN_ENCRYPTION_KEY — uma string longa e
 * aleatória (ex: `openssl rand -hex 32`). Guarde essa chave fora do
 * repositório (variável de ambiente do servidor / secrets manager), nunca
 * no código ou no .env versionado.
 *
 * Formato salvo no banco: "iv:authTag:ciphertext" (tudo em hex)
 */
@Injectable()
export class TokenEncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret = config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!secret) {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY não configurada. Defina uma chave forte no ambiente do servidor.'
      );
    }
    // Deriva uma chave de 32 bytes (AES-256) a partir do segredo configurado.
    this.key = scryptSync(secret, 'focus-nfe-token-salt', 32);
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12); // recomendado para GCM
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(stored: string): string {
    const [ivHex, authTagHex, encryptedHex] = stored.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Formato inválido do token criptografado.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
