import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [SecurityModule],
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
