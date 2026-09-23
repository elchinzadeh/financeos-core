import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3001'],
    credentials: false,
  });

  const config = new DocumentBuilder()
    .setTitle('FinanceOS Core API')
    .setDescription(
      'Fərdi maliyyə platformasının core API-si — bütün client-lər (mobile, web, ai_chat) bu command-ları çağırır.',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // '::' dual-stack-dir: Railway-in daxili şəbəkəsi IPv6-dır, '0.0.0.0' isə yalnız IPv4 dinləyir.
  await app.listen(process.env.PORT ?? 3000, '::');
  Logger.log(`Dinlənilir: ${await app.getUrl()}`, 'Bootstrap');
}
await bootstrap();
