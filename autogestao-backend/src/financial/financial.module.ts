import { Module } from '@nestjs/common';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { ClosingService } from './closing.service';

@Module({
  controllers: [FinancialController],
  providers: [FinancialService, ClosingService],
  exports: [FinancialService],
})
export class FinancialModule {}
