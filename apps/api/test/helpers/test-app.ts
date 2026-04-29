import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { AppModule } from "../../src/app.module";

class NoopThrottlerStorage {
  async increment(): Promise<{ totalHits: number; timeToExpire: number }> {
    return { totalHits: 0, timeToExpire: 0 };
  }
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  server: ReturnType<INestApplication["getHttpServer"]>;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ThrottlerStorage)
    .useClass(NoopThrottlerStorage)
    .compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  const server = app.getHttpServer() as ReturnType<
    INestApplication["getHttpServer"]
  >;
  return { app, server };
}

export async function closeTestApp(testApp: INestApplication): Promise<void> {
  await testApp.close();
}
