import { Module } from '@nestjs/common';
import { ACQUIRER_PROVIDER } from '@pg-system/shared';
import { SecurityModule } from '../security/security.module';
import { ApiKeyController } from './controllers/api-key.controller';
import { ApiKeyService } from './services/api-key.service';
import { PaymentController } from './controllers/payment.controller';
import { WebhookController } from './controllers/webhook.controller';
import { MerchantWebhookController } from './controllers/merchant-webhook.controller';
import { PaymentOrderService } from './services/payment-order.service';
import { PaymentConfirmService } from './services/payment-confirm.service';
import { PgFeeCalculatorService } from './services/pg-fee-calculator.service';
import { WebhookService } from './services/webhook.service';
import { WebhookCryptoService } from './services/webhook-crypto.service';
import { WebhookHttpService } from './services/webhook-http.service';
import { WebhookRetryService } from './services/webhook-retry.service';
import { FdsRuleEngineService } from './services/fds-rule-engine.service';
import { CardProcessor } from './mock-acquirer/card-processor';
import { BankProcessor } from './mock-acquirer/bank-processor';
import { MockAcquirerService } from './mock-acquirer/mock-acquirer.service';
import { PaymentCancelService } from './services/payment-cancel.service';
import { VirtualAccountService } from './services/virtual-account.service';
import { VirtualAccountController } from './controllers/virtual-account.controller';
import { IpWhitelistGuard } from './guards/ip-whitelist.guard';
import { CardTokenizationService } from './services/card-tokenization.service';
import { CheckoutController } from './controllers/checkout.controller';
import { CheckoutVerifyService } from './services/checkout-verify.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import vanConfig from '../../config/van.config';
import { NiceAcquirerAdapter } from './adapters/nice-acquirer.adapter';
import { KisAcquirerAdapter } from './adapters/kis-acquirer.adapter';

/**
 * Acquirer Factory Provider.
 * VAN_PROVIDER 환경변수로 Mock ↔ 실제 VAN 전환.
 * MOCK(기본) | NICE | KIS | KICC
 */
const acquirerFactory = {
  provide: ACQUIRER_PROVIDER,
  useFactory: (
    config: ConfigService,
    mock: MockAcquirerService,
    nice: NiceAcquirerAdapter,
    kis: KisAcquirerAdapter,
  ) => {
    const provider = config.get<string>('van.provider', 'MOCK');
    switch (provider) {
      case 'NICE': return nice;
      case 'KIS': return kis;
      default: return mock;
    }
  },
  inject: [ConfigService, MockAcquirerService, NiceAcquirerAdapter, KisAcquirerAdapter],
};

@Module({
  imports: [SecurityModule, ConfigModule.forFeature(vanConfig)],
  controllers: [ApiKeyController, PaymentController, WebhookController, MerchantWebhookController, VirtualAccountController, CheckoutController],
  providers: [
    ApiKeyService,
    IpWhitelistGuard,
    PaymentOrderService,
    PaymentConfirmService,
    PaymentCancelService,
    VirtualAccountService,
    PgFeeCalculatorService,
    WebhookService,
    WebhookCryptoService,
    WebhookHttpService,
    WebhookRetryService,
    FdsRuleEngineService,
    CardProcessor,
    BankProcessor,
    MockAcquirerService,
    NiceAcquirerAdapter,
    KisAcquirerAdapter,
    acquirerFactory,
    CardTokenizationService,
    CheckoutVerifyService,
  ],
  exports: [ApiKeyService, PaymentOrderService, WebhookService, ACQUIRER_PROVIDER, CardTokenizationService],
})
export class PgGatewayModule {}
