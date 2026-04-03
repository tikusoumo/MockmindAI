import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  // Swagger Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('AI Voice Agent Config API')
    .setDescription('NestJS API for managing users, reports, and platform configurations.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app as any, config);
  SwaggerModule.setup('api/docs', app as any, documentFactory);

  // Enable CORS for frontend access
  app.enableCors({
    origin: (process.env.CORS_ALLOW_ORIGINS || 'http://localhost:3000,http://localhost:3001')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 8000;
  await app.listen(port);
  console.log(`NestJS API running on http://localhost:${port}`);
  console.log(`Swagger Docs mapped to http://localhost:${port}/api/docs`);
}
bootstrap();
