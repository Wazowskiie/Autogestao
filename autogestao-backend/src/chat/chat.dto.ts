import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, Matches } from 'class-validator';

export class SendChatDto {
  @IsString() @MinLength(1) @MaxLength(2000) content: string;
  @IsUUID() clientMessageId: string;
}
export class ChatContactDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsString() @Matches(/^\d{10,13}$/, { message: 'Informe telefone com DDD (somente números)' }) phone: string;
  @IsBoolean() consent: boolean;
  @IsOptional() @IsUUID() vehicleId?: string;
}
export class ChatModeDto {
  @IsIn(['bot', 'human', 'closed']) mode: 'bot' | 'human' | 'closed';
}
