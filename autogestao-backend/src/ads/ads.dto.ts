import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
export class CreateAdDto {
  @IsUUID() vehicleId!: string;
  @IsIn(['olx', 'instagram']) channel!: string;
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
}
export class UpdateAdDto {
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
}
