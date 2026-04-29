import { Module } from "@nestjs/common";
import { SecurityModule } from "../security/security.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { RolesController, PermissionsController } from "./roles.controller";
import { RolesService } from "./roles.service";

@Module({
  imports: [SecurityModule],
  controllers: [UsersController, RolesController, PermissionsController],
  providers: [UsersService, RolesService],
  exports: [UsersService],
})
export class UsersModule {}
