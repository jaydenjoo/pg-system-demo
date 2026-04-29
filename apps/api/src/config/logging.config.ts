import { Params } from "nestjs-pino";
import { getCorrelationId } from "../common/context/correlation-id.context";

const SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "apiKey",
  "card_number",
  "cardNumber",
  "cvv",
  "pin",
  "encryption_key",
];

function redactPaths(): string[] {
  return [
    ...SENSITIVE_FIELDS.map((f) => `req.body.${f}`),
    "req.headers.authorization",
  ];
}

export function createLoggerConfig(): Params {
  const isProduction = process.env["NODE_ENV"] === "production";
  const isTest = process.env["NODE_ENV"] === "test";

  const baseOptions = {
    level: isTest ? "silent" : isProduction ? "info" : "debug",
    redact: { paths: redactPaths(), censor: "[REDACTED]" },
    genReqId: () => getCorrelationId(),
    serializers: {
      req: (req: { method: string; url: string }) => ({
        method: req.method,
        url: req.url,
        correlationId: getCorrelationId(),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customProps: () => ({ correlationId: getCorrelationId() }),
  };

  return {
    pinoHttp: isProduction
      ? baseOptions
      : {
          ...baseOptions,
          transport: { target: "pino-pretty", options: { colorize: true } },
        },
  };
}
