import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PortugueseExceptionFilter } from './common/filters/portuguese-exception.filter';

async function bootstrap() {
  // rawBody: o webhook do WhatsApp confere a assinatura da Meta no corpo original
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Avisos da Meta podem ter até 3 MB
  app.useBodyParser('json', { limit: '5mb' });

  // Fotos dos veículos (pasta storage/public), abertas direto pelo link
  app.useStaticAssets(join(process.cwd(), 'storage', 'public'), {
    prefix: '/files/',
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        // Junta todas as mensagens de validação (já em português, definidas
        // nas DTOs com class-validator) num único array plano.
        const mensagens = errors.flatMap((erro) =>
          erro.constraints ? Object.values(erro.constraints) : [],
        );
        return {
          statusCode: 400,
          message: mensagens.length ? mensagens : ['Dados inválidos'],
          error: 'Requisição inválida',
        };
      },
    }),
  );

  app.useGlobalFilters(new PortugueseExceptionFilter());

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API rodando em http://localhost:${port}/api/v1`);
}

bootstrap();