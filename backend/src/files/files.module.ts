import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FileSessionGuard } from './file-session.guard';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [FilesController],
  providers: [FilesService, FileSessionGuard],
  exports: [FilesService],
})
export class FilesModule {}
