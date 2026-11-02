import { ValidationError, ValidationPipe } from '@nestjs/common';

/** Junta as mensagens de validação (inclusive as de listas e objetos dentro do corpo) */
export function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((erro) => [
    ...(erro.constraints ? Object.values(erro.constraints) : []),
    ...(erro.children?.length ? validationMessages(erro.children) : []),
  ]);
}

export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      // Mensagens já em português, definidas nas DTOs com class-validator
      const mensagens = [...new Set(validationMessages(errors))];
      return {
        statusCode: 400,
        message: mensagens.length ? mensagens : ['Dados inválidos'],
        error: 'Requisição inválida',
      };
    },
  });
}
