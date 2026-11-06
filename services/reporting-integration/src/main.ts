import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  // Dev-only allowlist for the three local frontend apps - never a wildcard,
  // since this API issues/accepts bearer tokens that a malicious origin
  // shouldn't be able to ride along with via a browser-made request.
  app.enableCors({
    origin: (
      process.env.CORS_ORIGINS ?? 'http://localhost:3005,http://localhost:3006,http://localhost:3007'
    ).split(','),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BATA POS - Reporting & Integration Service')
    .setDescription(
      'Sales/inventory reporting, analytics, audit trail and external integration adapters',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document);

  const port = config.get<number>('port') ?? 3003;
  await app.listen(port);
}

bootstrap();
