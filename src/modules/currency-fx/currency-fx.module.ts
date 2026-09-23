import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { CurrencyFxController } from './currency-fx.controller.js';
import { CurrencyFxService } from './currency-fx.service.js';
import { FxSyncService } from './fx-sync.service.js';
import { FrankfurterClient } from './frankfurter-client.js';

@Module({
  imports: [IdentityModule],
  controllers: [CurrencyFxController],
  providers: [CurrencyFxService, FxSyncService, FrankfurterClient],
  exports: [CurrencyFxService],
})
export class CurrencyFxModule {}
