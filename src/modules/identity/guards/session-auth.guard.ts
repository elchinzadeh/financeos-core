import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityService } from '../identity.service.js';
import type { AuthenticatedRequest } from '../identity.types.js';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly identityService: IdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = extractBearerToken(request.headers.authorization);
    if (!rawToken) {
      throw new UnauthorizedException('Authorization başlığı yoxdur');
    }

    const sessionContext = await this.identityService.validateSession(rawToken);
    if (!sessionContext) {
      throw new UnauthorizedException('Sessiya keçərsizdir və ya bitib');
    }

    request.user = sessionContext.user;
    request.client = sessionContext.client;
    request.sessionId = sessionContext.session.id;
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}
