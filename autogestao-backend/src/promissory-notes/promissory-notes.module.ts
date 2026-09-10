import { Module } from '@nestjs/common';
import { PromissoryNotesController } from './promissory-notes.controller';
import { PromissoryNotesService } from './promissory-notes.service';

@Module({
  controllers: [PromissoryNotesController],
  providers: [PromissoryNotesService],
  exports: [PromissoryNotesService],
})
export class PromissoryNotesModule {}
