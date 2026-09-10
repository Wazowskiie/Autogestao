import { Module } from '@nestjs/common';
import { InterestRatesController } from './interest-rates.controller';
import { InterestRatesService } from './interest-rates.service';

@Module({
  controllers: [InterestRatesController],
  providers: [InterestRatesService],
  exports: [InterestRatesService],
})
export class InterestRatesModule {}
