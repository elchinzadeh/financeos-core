import { Injectable } from '@nestjs/common';

export interface FrankfurterRate {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

@Injectable()
export class FrankfurterClient {
  async getRates(base: string, quotes: string[]): Promise<FrankfurterRate[]> {
    const url = `https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quotes.join(',')}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Frankfurter xətası (base=${base}): ${res.status}`);
    }
    return res.json() as Promise<FrankfurterRate[]>;
  }
}
