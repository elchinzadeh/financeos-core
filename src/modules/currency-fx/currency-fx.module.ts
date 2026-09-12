import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { CurrencyFxController } from './currency-fx.controller.js';
import { CurrencyFxService } from './currency-fx.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [CurrencyFxController],
  providers: [CurrencyFxService],
  exports: [CurrencyFxService],
})
export class CurrencyFxModule {}
