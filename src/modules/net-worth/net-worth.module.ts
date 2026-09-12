import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CurrencyFxModule } from '../currency-fx/currency-fx.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NetWorthController } from './net-worth.controller.js';
import { NetWorthService } from './net-worth.service.js';

@Module({
  imports: [IdentityModule, AccountsModule, CurrencyFxModule],
  controllers: [NetWorthController],
  providers: [NetWorthService],
})
export class NetWorthModule {}
