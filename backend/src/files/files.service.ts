import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators';

export interface UploadResult {
  /** Stored in Grant.pdf_url / DocumentUploadLog.file_url. Same-origin path. */
  file_url: string;
  file_id: string;
  file_name: string;
  file_hash: string;
  size_bytes: number;
  /** True when a file with identical contents was already uploaded. */
  is_duplicate: boolean;
  duplicate_of_file_id?: string;
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.uploadRoot = resolve(this.config.get<string>('uploads.dir') ?? './storage/uploads');
  }

  async ensureStorageReady(): Promise<void> {
    await mkdir(this.uploadRoot, { recursive: true });
  }

  async save(
    file: Express.Multer.File,
    user: AuthenticatedUser,
    meta: { entity_type?: string; entity_id?: string },
  ): Promise<UploadResult> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('No file was received');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: PDF, images, Office documents, text.`,
      );
    }

    await this.ensureStorageReady();

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // Content-addressed storage: identical uploads share one file on disk,
    // and the hash gives the UI its duplicate detection for free.
    const existing = await this.prisma.storedFile.findFirst({
      where: { sha256 },
      orderBy: { created_date: 'asc' },
    });

    const safeName = this.sanitizeFileName(file.originalname);
    const shard = sha256.slice(0, 2);
    const storagePath = join(shard, `${sha256}`);
    const absolutePath = join(this.uploadRoot, storagePath);

    if (!existing) {
      await mkdir(join(this.uploadRoot, shard), { recursive: true });
      await writeFile(absolutePath, file.buffer);
    }

    const record = await this.prisma.storedFile.create({
      data: {
        original_name: safeName,
        storage_path: storagePath,
        mime_type: file.mimetype,
        size_bytes: file.size,
        sha256,
        entity_type: (meta.entity_type as any) ?? null,
        entity_id: meta.entity_id ?? null,
        uploaded_by: user.email,
        created_by: user.email,
      },
    });

    this.logger.log(
      `Stored ${safeName} (${file.size} bytes) as ${record.id} for ${user.email}`,
    );

    return {
      file_url: `/api/files/${record.id}/download`,
      file_id: record.id,
      file_name: safeName,
      file_hash: sha256,
      size_bytes: file.size,
      is_duplicate: Boolean(existing),
      duplicate_of_file_id: existing?.id,
    };
  }

  /** Strips path separators and control characters from a client-supplied name. */
  private sanitizeFileName(name: string): string {
    const base = (name ?? 'document').split(/[\\/]/).pop() ?? 'document';
    return base.replace(/[\x00-\x1f<>:"|?*]/g, '_').slice(0, 200) || 'document';
  }

  async getMetadata(id: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  /**
   * Resolves a stored file to an absolute path, refusing anything that escapes
   * the upload root even if the database row were tampered with.
   */
  async openStream(id: string) {
    const file = await this.getMetadata(id);

    const absolute = resolve(this.uploadRoot, file.storage_path);
    if (absolute !== this.uploadRoot && !absolute.startsWith(this.uploadRoot + sep)) {
      this.logger.error(`Refusing path traversal for file ${id}: ${file.storage_path}`);
      throw new NotFoundException('File not found');
    }

    try {
      await stat(absolute);
    } catch {
      throw new NotFoundException(
        'The stored file is missing from disk. It may have been removed by a cleanup run.',
      );
    }

    return { file, stream: createReadStream(absolute), absolute };
  }

  /** Reads a stored file into memory — used by PDF text extraction. */
  async readBuffer(id: string): Promise<{ buffer: Buffer; mime: string; name: string }> {
    const { file, stream } = await this.openStream(id);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return { buffer: Buffer.concat(chunks), mime: file.mime_type, name: file.original_name };
  }

  /**
   * Deletes the database row, and the blob on disk once no other row
   * references the same content hash.
   */
  async remove(id: string): Promise<{ deleted_blob: boolean }> {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) return { deleted_blob: false };

    await this.prisma.storedFile.delete({ where: { id } });

    const stillReferenced = await this.prisma.storedFile.count({
      where: { sha256: file.sha256 },
    });
    if (stillReferenced > 0) return { deleted_blob: false };

    const absolute = resolve(this.uploadRoot, file.storage_path);
    if (absolute.startsWith(this.uploadRoot + sep)) {
      await unlink(absolute).catch(() => undefined);
      return { deleted_blob: true };
    }
    return { deleted_blob: false };
  }

  /** Extracts a stored-file id from a `/api/files/<id>/download` URL. */
  static idFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const match = /\/api\/files\/([0-9a-fA-F-]{36})\/download/.exec(url);
    return match ? match[1] : null;
  }
}
