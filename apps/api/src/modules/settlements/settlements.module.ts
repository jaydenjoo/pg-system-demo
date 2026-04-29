import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SecurityModule } from '../security/security.module';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { SettlementSchedulerService } from './settlement-scheduler.service';
import { SettlementAutoExecutionService } from './settlement-auto-execution.service';
import { SettlementProcessor, SETTLEMENT_QUEUE } from './settlement.processor';
import { BankingApiService } from './banking-api.service';

@Module({
  imports: [
    SecurityModule,
    BullModule.registerQueue({ name: SETTLEMENT_QUEUE }),
  ],
  controllers: [SettlementsController],
  providers: [
    SettlementsService,
    SettlementSchedulerService,
    SettlementAutoExecutionService,
    SettlementProcessor,
    BankingApiService,
  ],
  exports: [SettlementsService],
})
export class SettlementsModule {}
