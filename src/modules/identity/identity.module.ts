import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { IdentityController } from './identity.controller.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import { IdentityService } from './identity.service.js';

@Module({
  imports: [EmailModule],
  controllers: [IdentityController],
  providers: [IdentityService, SessionAuthGuard],
  exports: [IdentityService, SessionAuthGuard],
})
export class IdentityModule {}
