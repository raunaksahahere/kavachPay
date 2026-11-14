/** An expected failure with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toBody() {
    return { error: { code: this.code, message: this.message, ...(this.details ?? {}) } };
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} not found`);
