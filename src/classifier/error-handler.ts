export interface ErrorResult {
  exitCode: number | null;
  stderr: string;
  shouldSkipFragment: boolean;
}

export interface ErrorHandlerOptions {
  failOpen: boolean;
}

const ALWAYS_HARD_FAIL = ['Integrity check failed'];

export function handleClassifierError(error: Error, options: ErrorHandlerOptions): ErrorResult {
  const msg = error.message;

  if (ALWAYS_HARD_FAIL.some(k => msg.includes(k))) {
    return { exitCode: 2, stderr: `Error: ${msg}`, shouldSkipFragment: false };
  }

  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return { exitCode: null, stderr: `Warning: ${msg}, skipping fragment`, shouldSkipFragment: true };
  }

  if (msg.includes('OOM') || msg.includes('out of memory')) {
    const exitCode = options.failOpen ? 0 : 2;
    const prefix = options.failOpen ? 'Warning' : 'Error';
    return { exitCode, stderr: `${prefix}: ${msg}. Try reducing --concurrency.`, shouldSkipFragment: false };
  }

  const exitCode = options.failOpen ? 0 : 2;
  const prefix = options.failOpen ? 'Warning' : 'Error';
  return { exitCode, stderr: `${prefix}: ${msg}`, shouldSkipFragment: false };
}