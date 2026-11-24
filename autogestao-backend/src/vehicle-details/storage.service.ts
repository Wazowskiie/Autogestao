import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, extname, join, resolve, sep } from 'path';

// Arquivo recebido pelo upload (formato do multer, sem precisar do @types/multer)
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Pasta onde os arquivos ficam no servidor:
//   storage/public  -> fotos (aparecem no site, abrem direto pelo link)
//   storage/private -> documentos (CRLV, NF-e...), só baixam com login
const ROOT = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), 'storage'));
const PUBLIC_DIR = join(ROOT, 'public');
const PRIVATE_DIR = join(ROOT, 'private');

// Endereço público dos arquivos (fotos, logo).
// Lido na hora de salvar (não na importação do arquivo, quando o .env pode ainda não ter sido carregado).
// Se PUBLIC_API_URL estiver como localhost (valor do .env.example) e houver o domínio do site em
// PUBLIC_APP_URL, usa o domínio do site, que serve /files pelo mesmo endereço.
const isLocal = (u: string) => /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(u);
export function publicFilesBase() {
  const api = (process.env.PUBLIC_API_URL || '').trim();
  const app = (process.env.PUBLIC_APP_URL || '').trim();
  const base = api && !(isLocal(api) && app && !isLocal(app)) ? api : app || api || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/files`;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/xml',
  'application/xml',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MB = 1024 * 1024;

function safeExtension(name: string) {
  const ext = extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.length > 1 && ext.length <= 6 ? ext : '';
}

@Injectable()
export class StorageService {
  assertImage(file?: UploadedFileLike) {
    if (!file) throw new BadRequestException('Nenhuma foto enviada.');
    if (!IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`"${file.originalname}" não é uma foto válida. Use JPG, PNG ou WEBP.`);
    }
    if (file.size > 10 * MB) {
      throw new BadRequestException(`"${file.originalname}" passa de 10 MB.`);
    }
  }

  assertDocument(file?: UploadedFileLike) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    if (!DOCUMENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de arquivo não aceito. Envie PDF, imagem, XML, Word ou Excel.');
    }
    if (file.size > 20 * MB) {
      throw new BadRequestException('O arquivo passa de 20 MB.');
    }
  }

  /** Salva uma foto e devolve o link público dela */
  async savePublic(folder: string, file: UploadedFileLike) {
    const key = `${folder}/${randomUUID()}${safeExtension(file.originalname) || '.jpg'}`;
    await this.write(PUBLIC_DIR, key, file.buffer);
    return { key, url: `${publicFilesBase()}/${key}` };
  }

  /** Salva um documento privado e devolve a chave dele */
  async savePrivate(folder: string, file: UploadedFileLike) {
    const key = `${folder}/${randomUUID()}${safeExtension(file.originalname)}`;
    await this.write(PRIVATE_DIR, key, file.buffer);
    return key;
  }

  /** Caminho completo de um documento privado (para download) */
  privatePath(key: string) {
    const path = this.inside(PRIVATE_DIR, key);
    if (!existsSync(path)) throw new NotFoundException('Arquivo não encontrado no servidor.');
    return path;
  }

  async removePrivate(key?: string | null) {
    if (key) await unlink(this.inside(PRIVATE_DIR, key)).catch(() => undefined);
  }

  /** Apaga uma foto a partir do link dela (só se for uma foto salva aqui) */
  async removePublicByUrl(url?: string | null) {
    // Aceita qualquer domínio: o que importa é a parte depois de /files/
    const i = url ? url.indexOf('/files/') : -1;
    if (!url || i < 0) return;
    const key = decodeURIComponent(url.slice(i + '/files/'.length));
    await unlink(this.inside(PUBLIC_DIR, key)).catch(() => undefined);
  }

  private async write(base: string, key: string, data: Buffer) {
    const path = this.inside(base, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  // Impede caminhos do tipo "../../etc" saírem da pasta de arquivos
  private inside(base: string, key: string) {
    const path = resolve(base, key);
    if (!path.startsWith(base + sep)) throw new BadRequestException('Caminho de arquivo inválido.');
    return path;
  }
}