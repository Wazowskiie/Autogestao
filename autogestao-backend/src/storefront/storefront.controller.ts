import { Controller, Get, Param, Query } from '@nestjs/common';
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

  @Get(':slug/vehicles/:vehicleId')
  getVehicle(@Param('slug') slug: string, @Param('vehicleId') vehicleId: string) {
    return this.storefrontService.getVehicle(slug, vehicleId);
  }
}
