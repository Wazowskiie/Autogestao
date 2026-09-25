import { InterestRatesModule } from './interest-rates/interest-rates.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CustomersModule } from './customers/customers.module';
import { FinancialModule } from './financial/financial.module';
import { FocusNfeModule } from './fiscal/focus-nfe/focus-nfe.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LeadsModule } from './leads/leads.module';
import { PartsModule } from './parts/parts.module';
import { PrismaModule } from './prisma/prisma.module';
import { PromissoryNotesModule } from './promissory-notes/promissory-notes.module';
import { SalesModule } from './sales/sales.module';
import { SellersModule } from './sellers/sellers.module';
import { StorefrontModule } from './storefront/storefront.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { RenaveModule } from './renave/renave.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    InterestRatesModule,
    PrismaModule,
    AuthModule,
    VehiclesModule,
    RenaveModule, 
    CustomersModule,
    LeadsModule,
    SalesModule,
    SellersModule,
    FinancialModule,
    PromissoryNotesModule,
    PartsModule,
    StorefrontModule,
    BillingModule,
    FocusNfeModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}