import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [FilesModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
