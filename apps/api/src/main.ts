import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { Logger as PinoLogger } from "nestjs-pino";

const logger = new Logger("Bootstrap");

function validateRequiredSecrets(): void {
  // 모든 환경에서 MFA 전용 시크릿은 필수 (폴백 제거됨 — PCI DSS 8.3.2)
  const alwaysRequired: string[] = [
    "JWT_MFA_SECRET",
    "MFA_ENCRYPTION_KEY",
  ];
  const productionOnly: string[] = [
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "ENCRYPTION_KEY",
  ];

  const required =
    process.env["NODE_ENV"] === "production"
      ? [...alwaysRequired, ...productionOnly]
      : alwaysRequired;

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required secrets: ${missing.join(", ")}. Set them in .env`,
    );
  }
}

async function bootstrap(): Promise<void> {
  validateRequiredSecrets();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  // Trust proxy — 리버스 프록시(nginx/LB) 뒤에서 req.ip가 실제 클라이언트 IP를 반환하도록 설정.
  // loopback(127.0.0.1) + Docker 내부 네트워크(172.16.0.0/12) 만 신뢰 (OWASP A05 방어)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set("trust proxy", ["loopback", "172.16.0.0/12"]);

  // Cookie parser — httpOnly 쿠키에서 JWT 추출용
  app.use(cookieParser());

  // Request body size limit (PCI DSS 보안 요구사항)
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));

  // Security headers — HSTS, CSP, Permissions-Policy 등 강화
  app.use(
    helmet({
      hsts: {
        maxAge: 31536000, // 1년
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
        },
      },
      frameguard: { action: "deny" },
    }),
  );

  // CORS — allowedOrigins from env (no wildcard)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Global validation pipe — whitelist strips unknown fields
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // SIGTERM/SIGINT 수신 시 진행 중인 요청 완료 후 종료
  app.enableShutdownHooks();

  // Swagger API 문서 — 프로덕션에서는 비활성화
  if (process.env["NODE_ENV"] !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("PG System API")
      .setDescription("PG 결제대행 시스템 REST API 문서")
      .setVersion("1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "JWT",
      )
      .addBasicAuth(
        { type: "http", scheme: "basic" },
        "PG-Basic",
      )
      .addTag("Auth", "인증/인가 (로그인, MFA, 토큰)")
      .addTag("Users", "사용자 관리")
      .addTag("Roles", "역할/권한 관리")
      .addTag("Merchants", "가맹점 관리")
      .addTag("Agents", "대리점 관리")
      .addTag("Transactions", "거래 관리")
      .addTag("Settlements", "정산 관리")
      .addTag("Commissions", "수수료 관리")
      .addTag("Deposits", "입금/대사 관리")
      .addTag("Security", "보안 (감사 로그, 키 로테이션, 무결성)")
      .addTag("System", "시스템 코드 관리")
      .addTag("Dashboard", "대시보드 통계")
      .addTag("Health", "헬스체크")
      .addTag("Metrics", "메트릭스")
      .addTag("PG-APIKey", "PG 게이트웨이 — API 키 관리")
      .addTag("PG-Payment", "PG 게이트웨이 — 결제")
      .addTag("PG-Webhook", "PG 게이트웨이 — 웹훅")
      .addTag("PG-VirtualAccount", "PG 게이트웨이 — 가상계좌")
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
        tagsSorter: "alpha",
      },
    });
    logger.log("Swagger docs available at /api/docs");
  }

  const port = parseInt(process.env.API_PORT ?? "4000", 10);
  await app.listen(port);
  logger.log(`API server running on port ${port}`);
}

bootstrap().catch((err: unknown) => {
  logger.error("Failed to start server:", err);
  process.exit(1);
});
