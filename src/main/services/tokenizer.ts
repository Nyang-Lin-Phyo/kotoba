/** Offline kuromoji tokenizer. Loaded lazily and bounded; never fetches assets. */

import { existsSync } from 'node:fs';
import kuromoji, { type IpadicFeatures, type Tokenizer } from 'kuromoji';
import { AppError } from '../../shared/errors';

export const MAX_TOKENIZE_CHARS = 20_000;
export const MAX_TOKENS = 2_000;

export type RawToken = {
  readonly position: number;
  readonly surface: string;
  readonly basicForm: string;
  readonly reading: string;
  readonly pos: string;
  readonly wordType: string;
};

type TokenizerFactory = (dictPath: string) => Promise<Tokenizer<IpadicFeatures>>;

function defaultFactory(dictPath: string): Promise<Tokenizer<IpadicFeatures>> {
  if (!existsSync(dictPath) || !existsSync(`${dictPath}/base.dat.gz`)) {
    throw AppError.dataMissing('The offline tokenizer dictionary is not installed.');
  }
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: dictPath }).build((error, tokenizer) => {
      if (error !== null && error !== undefined) {
        reject(AppError.dataMissing('The offline tokenizer could not be loaded.'));
        return;
      }
      resolve(tokenizer);
    });
  });
}

export class TokenizerService {
  #promise: Promise<Tokenizer<IpadicFeatures>> | null = null;

  constructor(
    private readonly dictPath: string,
    private readonly factory: TokenizerFactory = defaultFactory,
  ) {}

  #tokenizer(): Promise<Tokenizer<IpadicFeatures>> {
    this.#promise ??= this.factory(this.dictPath);
    return this.#promise;
  }

  /** Clears a failed load so a later request can retry. */
  reset(): void {
    this.#promise = null;
  }

  async tokenize(text: string): Promise<readonly RawToken[]> {
    if (text.length === 0) return [];
    if (text.length > MAX_TOKENIZE_CHARS) {
      throw AppError.validation(`Text must be at most ${MAX_TOKENIZE_CHARS} characters.`, 'text');
    }
    const tokenizer = await this.#tokenizer();
    const features = tokenizer.tokenize(text);
    if (features.length > MAX_TOKENS) {
      throw AppError.validation(`Text produced too many tokens (maximum ${MAX_TOKENS}).`, 'text');
    }
    return features.map((feature, position) => ({
      surface: feature.surface_form,
      basicForm: feature.basic_form === '*' ? feature.surface_form : feature.basic_form,
      reading: feature.reading === '*' || feature.reading === undefined ? '' : feature.reading,
      pos: feature.pos,
      wordType: feature.word_type,
      position,
    }));
  }
}
