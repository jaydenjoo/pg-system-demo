import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";
import { ERROR_CODES } from "@pg-system/shared";
import { JwtPayload } from "../../../common/decorators/current-user.decorator";

const VALID_USER_TYPES = new Set(["ADMIN", "AGENT", "MERCHANT"]);

function extractFromCookie(req: Request): string | null {
  return req?.cookies?.accessToken ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("jwt.accessSecret"),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (
      !payload.sub ||
      !payload.loginId ||
      !payload.userType ||
      !VALID_USER_TYPES.has(payload.userType) ||
      !Array.isArray(payload.roles) ||
      !Array.isArray(payload.permissions)
    ) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_001,
        message: "인증이 필요합니다",
      });
    }
    return payload;
  }
}
