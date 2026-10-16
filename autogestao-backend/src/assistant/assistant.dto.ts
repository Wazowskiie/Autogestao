import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class AssistantMessageDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MaxLength(8000, { message: 'Mensagem muito longa' }) content: string;
}

export class AssistantChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60, { message: 'Conversa muito longa. Comece uma nova.' })
  @ValidateNested({ each: true })
  @Type(() => AssistantMessageDto)
  messages: AssistantMessageDto[];

  // Tela em que a pessoa está (ajuda a assistente a explicar o sistema)
  @IsOptional() @IsString() @MaxLength(40) page?: string;
}

export class AssistantConfirmDto {
  @IsString() @MinLength(10) @MaxLength(20000) token: string;
}
