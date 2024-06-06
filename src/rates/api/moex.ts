import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@nestjs/common';

import axios from 'axios';

import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

type MoexData = [
  string,
  string, // "CETS"
  string, // "EUR_TODTOM"
  number,
  string,
  number,
  number,
  string,
  number,
  string,
  string,
  null,
  string,
  string,
  number | null, // 63
  number | null, // 61.5155
  string,
  string,
  number,
];

export interface MoexResponseDto {
  securities: {
    data: MoexData[];
  };
}

export class MoexApi extends BaseApi {
  static resourceName = 'MOEX';

  private codes = this.config.get<Record<string, string>>('moex.codes') || {};

  public pairs: string[] = Object.keys(this.codes);

  public enabled =
    this.config.get<boolean>('moex.enabled') !== false && !!this.pairs.length;

  public weight = this.config.get<number>('moex.weight') || 10;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();
  }

  async fetch(): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    const url = this.config.get('moex.url') as string;

    const rates: Record<string, number> = {};

    const response = await axios.get<MoexResponseDto>(url);

    const data = response.data.securities.data.filter(
      (ticker) => ticker[1] === 'CETS',
    );

    const decimals = this.config.get<number>('decimals');

    for (const [pair, code] of Object.entries(this.codes)) {
      const ticker = data.find((ticker) => ticker[2] === code);

      if (!ticker) {
        continue;
      }

      const price1 = ticker[14];
      const price2 = ticker[15];

      if (!price1 || !price2) {
        continue;
      }

      let price = (price1 + price2) / 2;

      if (pair === 'JPY/RUB') {
        price /= 100;
      }

      rates[pair] = Number(price.toFixed(decimals));

      if (pair === 'USD/RUB') {
        rates['RUB/USD'] = Number((1 / rates['USD/RUB']).toFixed(decimals));
      } else {
        const market = `USD/${pair.replace('/RUB', '')}`;
        const price = rates['USD/RUB'] / rates[pair];
        rates[market] = Number(price.toFixed(decimals));
      }
    }

    this.logger.log(`${this.resourceName} rates updated successfully`);

    return rates;
  }
}
