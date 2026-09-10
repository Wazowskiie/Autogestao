import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

// Traduções para mensagens padrão que o Nest (e seus guards/estratégias)
// lançam automaticamente em inglês, ex: AuthGuard('jwt') lança 'Unauthorized'.
const MENSAGENS_PADRAO: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Requisição inválida',
  [HttpStatus.UNAUTHORIZED]: 'Sessão expirada ou inválida. Faça login novamente',
  [HttpStatus.FORBIDDEN]: 'Você não tem permissão para fazer isso',
  [HttpStatus.NOT_FOUND]: 'Recurso não encontrado',
  [HttpStatus.CONFLICT]: 'Este registro já existe',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Dados inválidos',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Muitas tentativas. Tente novamente em instantes',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Erro interno. Tente novamente mais tarde',
};

// Mensagens específicas do Nest/Passport que vêm sempre em inglês,
// mesmo com status já mapeado acima — cobrimos os textos exatos aqui.
const MENSAGENS_CONHECIDAS: Record<string, string> = {
  Unauthorized: 'Sessão expirada ou inválida. Faça login novamente',
  Forbidden: 'Você não tem permissão para fazer isso',
  'Not Found': 'Recurso não encontrado',
  'Bad Request': 'Requisição inválida',
  'Internal Server Error': 'Erro interno. Tente novamente mais tarde',
};

@Catch(HttpException)
export class PortugueseExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    let message: string | string[];

    if (typeof body === 'string') {
      message = MENSAGENS_CONHECIDAS[body] ?? body;
    } else if (typeof body === 'object' && body !== null && 'message' in body) {
      const original = (body as { message: string | string[] }).message;

      if (Array.isArray(original)) {
        // Erros de validação: já vêm em português (definidos nas DTOs)
        message = original;
      } else {
        message = MENSAGENS_CONHECIDAS[original] ?? original;
      }
    } else {
      message = MENSAGENS_PADRAO[status] ?? 'Ocorreu um erro inesperado';
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: ctx.getRequest().url,
    });
  }
}
