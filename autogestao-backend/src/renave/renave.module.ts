import { Module } from '@nestjs/common';
import { RenaveController } from './renave.controller';
import { RenaveService } from './renave.service';
import { PrismaModule } from '../prisma/prisma.module'; // ajuste o caminho se necessário

@Module({
  imports: [PrismaModule],
  controllers: [RenaveController],
  providers: [RenaveService],
})
export class RenaveModule {}