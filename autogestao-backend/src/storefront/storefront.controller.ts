import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicLeadDto } from '../crm/crm-extras.dto';
import { Public } from '../common/decorators/public.decorator';
import { StorefrontService } from './storefront.service';

@Public()
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get(':slug')
  getDealership(@Param('slug') slug: string) {
    return this.storefrontService.getDealership(slug);
  }

  @Get(':slug/vehicles')
  listVehicles(
    @Param('slug') slug: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.storefrontService.listVehicles(slug, {
      search,
      type,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /** Formulário "Tenho interesse" do site: vira lead no CRM */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':slug/leads')
  createLead(@Param('slug') slug: string, @Body() dto: PublicLeadDto) {
    if (dto.website) throw new BadRequestException('Não foi possível enviar.');
    return this.storefrontService.createLead(slug, dto);
  }

  @Get(':slug/vehicles/:vehicleId')
  getVehicle(@Param('slug') slug: string, @Param('vehicleId') vehicleId: string) {
    return this.storefrontService.getVehicle(slug, vehicleId);
  }
}
