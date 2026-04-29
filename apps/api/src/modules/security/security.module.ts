import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";
import { IntegrityMonitorService } from "./integrity-monitor.service";
import { IntegrityMonitorScheduler } from "./integrity-monitor.scheduler";
import { AuditHashChainService } from "./audit-hash-chain.service";
import { KeyRotationService } from "./key-rotation.service";
import { KeyRotationScheduler } from "./key-rotation.scheduler";
import { LocalKmsService } from "./kms/local-kms.service";
import { KMS_SERVICE } from "./kms/kms.interface";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SecurityController],
  providers: [
    SecurityService,
    IntegrityMonitorService,
    IntegrityMonitorScheduler,
    AuditHashChainService,
    KeyRotationService,
    KeyRotationScheduler,
    {
      provide: KMS_SERVICE,
      useClass: LocalKmsService,
    },
  ],
  exports: [
    SecurityService,
    IntegrityMonitorService,
    AuditHashChainService,
    KeyRotationService,
    KMS_SERVICE,
  ],
})
export class SecurityModule {}
