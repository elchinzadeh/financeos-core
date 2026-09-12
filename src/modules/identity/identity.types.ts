import type { Request } from 'express';
import type { ClientType } from '../../generated/prisma/enums.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  baseCurrency: string;
  locale: string;
}

export interface AuthenticatedClient {
  id: string;
  type: ClientType;
  name: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  client: AuthenticatedClient;
  sessionId: string;
}
