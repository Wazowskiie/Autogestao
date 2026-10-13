import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PortugueseExceptionFilter } from './common/filters/portuguese-exception.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
   import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

     app.useStaticAssets(join(process.cwd(), 'storage', 'public'), {
     prefix: '/files/',
     setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
   });

  app.use(helmet());
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