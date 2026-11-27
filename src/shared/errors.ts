/**
 * Structured error contract for every main-process operation that the renderer
 * can call. Errors cross the IPC boundary as data, never as thrown objects with
 * stack traces.
 */

export const ERROR_CODES = [
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'DB_IO',
  'DATA_MISSING',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type AppErrorPayload = {
  readonly code: ErrorCode;
  readonly message: string;
  /** Optional field name for form-level validation feedback. */
  readonly field?: string;
  /** Structured data for recovery, e.g. the refreshed card after a CONFLICT. */
  readonly data?: unknown;
};

export type Ok<T> = { readonly ok: true; readonly data: T };
export type Err = { readonly ok: false; readonly error: AppErrorPayload };
export type Result<T> = Ok<T> | Err;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function err(code: ErrorCode, message: string, field?: string): Err {
  return { ok: false, error: field === undefined ? { code, message } : { code, message, field } };
}

/**
 * An expected, user-meaningful failure. Anything else thrown in the main process
 * is treated as INTERNAL and its details are logged, not sent to the renderer.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly field: string | undefined;
  readonly data: unknown;

  constructor(code: ErrorCode, message: string, field?: string, data?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.field = field;
    this.data = data;
  }

  static validation(message: string, field?: string): AppError {
    return new AppError('VALIDATION', message, field);
  }

  static notFound(message: string): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message: string, field?: string): AppError {
    return new AppError('CONFLICT', message, field);
  }

  static dbIo(message: string): AppError {
    return new AppError('DB_IO', message);
  }

  static dataMissing(message: string): AppError {
    return new AppError('DATA_MISSING', message);
  }

  toPayload(): AppErrorPayload {
    return {
      code: this.code,
      message: this.message,
      ...(this.field === undefined ? {} : { field: this.field }),
      ...(this.data === undefined ? {} : { data: this.data }),
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
