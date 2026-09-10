import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// ⚠️ AJUSTE o caminho conforme onde o PrismaModule/PrismaService vive no seu projeto
import { PrismaModule } from '../../prisma/prisma.module';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { FocusNfeService } from './focus-nfe.service';
import { FocusNfeController } from './focus-nfe.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [FocusNfeController],
  providers: [FocusNfeService, TokenEncryptionService],
  exports: [FocusNfeService],
})
export class FocusNfeModule {}
