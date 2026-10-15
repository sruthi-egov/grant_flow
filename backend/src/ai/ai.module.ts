import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ExtractionService } from './extraction.service';
import { PdfTextService } from './pdf-text.service';

@Module({
  imports: [FilesModule],
  controllers: [AiController],
  providers: [AiService, PdfTextService, ExtractionService],
  exports: [AiService, ExtractionService],
})
export class AiModule {}
