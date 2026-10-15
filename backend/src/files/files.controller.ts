import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { FileSessionGuard } from './file-session.guard';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Replaces `base44.integrations.Core.UploadFile`.
   * Only users with `can_upload_pdf` (or admins) may upload — the same gate the
   * Base44 `getMyPermissions` function enforced.
   */
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { entity_type?: string; entity_id?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role !== 'admin' && !user.can_upload_pdf) {
      throw new ForbiddenException(
        'Your account is not permitted to upload documents. Ask an administrator to enable PDF upload.',
      );
    }
    if (!file) {
      throw new BadRequestException('No file was received. Use multipart/form-data with a "file" field.');
    }
    return this.files.save(file, user, body ?? {});
  }

  /**
   * Authorised download.
   *
   * Accepts either a Bearer token (fetch/XHR) or the httpOnly `grantos_session`
   * cookie set at login, because the UI opens documents with a plain
   * `<a href target="_blank">` which cannot carry an Authorization header.
   */
  @UseGuards(FileSessionGuard)
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { file, stream } = await this.files.openStream(id);

    // Module gating: a user restricted to e.g. MOUs must not read SOW documents.
    this.assertModuleAccess(file.entity_type, user);

    const isInlineSafe = file.mime_type === 'application/pdf' || file.mime_type.startsWith('image/');
    const disposition = isInlineSafe ? 'inline' : 'attachment';
    const asciiName = file.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");

    res.set({
      'Content-Type': file.mime_type,
      'Content-Length': String(file.size_bytes),
      'Content-Disposition': `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      // Never let a browser or proxy cache another user's document.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Defuse any HTML/SVG that slipped through the MIME allow-list.
      'Content-Security-Policy': "default-src 'none'; object-src 'none'; sandbox",
    });

    return new StreamableFile(stream);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async metadata(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const file = await this.files.getMetadata(id);
    this.assertModuleAccess(file.entity_type, user);
    return {
      id: file.id,
      file_name: file.original_name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      file_hash: file.sha256,
      entity_type: file.entity_type,
      entity_id: file.entity_id,
      uploaded_by: file.uploaded_by,
      created_date: file.created_date,
      file_url: `/api/files/${file.id}/download`,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.files.remove(id);
  }

  private assertModuleAccess(
    entityType: string | null,
    user: AuthenticatedUser,
  ): void {
    if (!entityType || user.role === 'admin') return;
    const allowed = user.allowed_modules ?? [];
    if (allowed.length === 0) return; // empty = unrestricted

    const moduleFor: Record<string, string> = {
      Grant: 'Grants',
      SOW: 'SOWs',
      MSA: 'MSAs',
      MOU: 'MOUs',
    };
    const required = moduleFor[entityType];
    if (required && !allowed.includes(required)) {
      throw new ForbiddenException(
        `Your account does not have access to the ${required} module`,
      );
    }
  }
}
