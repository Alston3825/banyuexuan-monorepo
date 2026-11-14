import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  // 生产：浏览器 → 宿主机 nginx → web 容器 nginx → api，共两层代理。不告诉 Express 信任它们，req.ip 就永远是内部代理地址：
  // 全体用户共用同一份限流额度、操作日志/签字证据里的 IP 也不是真实 IP。TRUST_PROXY_HOPS 可覆盖（本机开发没有代理，默认 0）。
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? (isProduction ? 2 : 0));
  if (hops > 0) (app.getHttpAdapter().getInstance() as { set: (k: string, v: number) => void }).set('trust proxy', hops);

  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 默认不开启CORS：生产架构是 web 容器nginx同源反代到api，浏览器视角是同源请求。
  // 只有当前端被部署到与api不同的域名/端口时才需要配置 CORS_ALLOWED_ORIGINS（逗号分隔）。
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length > 0) {
    app.enableCors({ origin: allowedOrigins, credentials: true });
  }

  // Swagger 接口文档只在非生产环境暴露，避免把完整API结构（含内部管理接口）公开给未认证访问者
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('伴月轩月子中心管理系统 API')
      .setDescription('P0 平台底座：多门店组织账号体系 / RBAC / 工作流引擎骨架')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
