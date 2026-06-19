import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TimingInterceptor } from './common/timing.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Raise the JSON body limit (default 100kb) so inline assets like a base64
  // school logo fit in a profile update.
  app.useBodyParser('json', { limit: '6mb' });

  app.setGlobalPrefix('api');

  // Per-request timing log (set TIMING_LOG=off to disable) — diagnostic for slowness.
  app.useGlobalInterceptors(new TimingInterceptor());

  // Allow the configured origins plus any subdomain of the root domain
  // (schools are served at <slug>.<root>), so the X-School-Slug login flow works.
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',');
  const rootDomain = process.env.CORS_ROOT_DOMAIN; // e.g. "schoolops.app" or "localhost:3000"
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // non-browser / same-origin
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (rootDomain) {
        const host = origin.replace(/^https?:\/\//, '');
        if (host === rootDomain || host.endsWith(`.${rootDomain}`)) return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SchoolOps API')
    .setDescription('SchoolOps SaaS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Most hosts (Render/Railway/Fly/etc.) inject the port to bind via $PORT.
  const port = process.env.PORT ?? process.env.API_PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on port ${port} (prefix /api)`);
}

bootstrap();
