import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';
import { LeadSource, LeadTemperature } from '../leads/dto/create-lead.dto';
const booleanQuery = ({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value;
export class CrmQueryDto {
  @IsOptional() @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsIn(['new','contacted','negotiating','won','lost']) stage?: string;
  @IsOptional() @IsIn(Object.values(LeadSource)) source?: string;
  @IsOptional() @IsIn(Object.values(LeadTemperature)) temperature?: string;
  @IsOptional() @IsUUID() assignedSellerId?: string;
  @IsOptional() @Transform(booleanQuery) @IsBoolean() unassigned?: boolean;
  @IsOptional() @Transform(booleanQuery) @IsBoolean() archived?: boolean;
  @IsOptional() @Transform(booleanQuery) @IsBoolean() overdue?: boolean;
  @IsOptional() @Transform(booleanQuery) @IsBoolean() unattended?: boolean;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 30;
}
export class CrmLeadDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) customerName?: string;
  @IsOptional() @IsString() @MaxLength(30) customerPhone?: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsOptional() @IsUUID() vehicleId?: string | null;
  @IsOptional() @IsUUID() assignedSellerId?: string | null;
  @IsOptional() @IsIn(['new','contacted','negotiating','won','lost']) stage?: 'new'|'contacted'|'negotiating'|'won'|'lost';
  @IsOptional() @IsIn(Object.values(LeadSource)) source?: string | null;
  @IsOptional() @IsIn(Object.values(LeadTemperature)) temperature?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999) budget?: number | null;
  @IsOptional() @IsString() @MaxLength(100) paymentIntent?: string | null;
  @IsOptional() @IsDateString() nextActionDate?: string | null;
  @IsOptional() @IsString() @MaxLength(200) nextActionNote?: string | null;
  @IsOptional() @IsString() @MaxLength(6000) notes?: string | null;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) lostReason?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
}
export class CrmContactDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
}
export class CrmActivityDto {
  @IsIn(['note','call','whatsapp','email','visit']) kind: string;
  @IsString() @MinLength(2) @MaxLength(4000) content: string;
  @IsOptional() @IsDateString() occurredAt?: string;
}
export class CrmTaskDto {
  @IsString() @MinLength(2) @MaxLength(150) title: string;
  @IsDateString() dueAt: string;
  @IsOptional() @IsDateString() remindAt?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsUUID() assignedUserId?: string | null;
  @IsOptional() @IsIn(['low','normal','high']) priority?: string;
}
export class CrmTaskQueryDto {
  @IsOptional() @IsIn(['open','done','canceled']) status?: string;
  @IsOptional() @IsIn(['all','today','overdue','upcoming']) period?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsDateString() dayStart?: string;
  @IsOptional() @IsDateString() dayEnd?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 30;
}
export class CrmTaskStatusDto { @IsIn(['open','done','canceled']) status: string; }
export class CrmArchiveDto { @IsBoolean() archived: boolean; }
export class CrmSaleDto { @IsUUID() saleId: string; }
