import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Express-in default JSON limiti 100 KB-dır; ~1000 sətirlik bank çıxarışının `statement-import/commit` sorğusu
 * (~300 KB) 413 verirdi. `NestFactory.create(..., { bodyParser: false })` ilə yaradılan tətbiqə tətbiq olunur.
 */
export const BODY_LIMIT = '5mb';

export function configureBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });
}
