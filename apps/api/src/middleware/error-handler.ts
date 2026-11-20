import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';

/** Uniform error body: { error: { code, message, fields? } }. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    const fields = Object.fromEntries(error.issues.map((issue) => [issue.path.join('.') || '_', issue.message]));
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Some fields are invalid.', fields } });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, fields: error.fields } });
    return;
  }
  // Body parser errors (malformed JSON, body over the size limit, bad charset) are client mistakes.
  const parserError = bodyParserError(error);
  if (parserError) {
    const { status, ...body } = parserError;
    res.status(status).json({ error: body });
    return;
  }
  req.log.error({ err: safeError(error) }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
};

/**
 * What gets logged for an unexpected error. Prisma's messages quote the query's
 * arguments, which can include email bodies, so for those keep only the code,
 * the model and the stack, never the message.
 */
export function safeError(error: unknown): unknown {
  if (error instanceof Error && error.name.startsWith('PrismaClient')) {
    const { code, meta } = error as Error & { code?: string; meta?: { modelName?: string; target?: unknown } };
    return {
      type: error.name,
      code,
      model: meta?.modelName,
      target: meta?.target,
      stack: error.stack
        ?.split('\n')
        .filter((line) => line.trimStart().startsWith('at '))
        .join('\n')
    };
  }
  return error;
}

const PARSER_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  'entity.parse.failed': { status: 400, code: 'MALFORMED_BODY', message: 'The request body is not valid JSON.' },
  'entity.too.large': { status: 413, code: 'BODY_TOO_LARGE', message: 'The request body is too large.' },
  'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_ENCODING', message: 'Unsupported content encoding.' },
  'charset.unsupported': { status: 415, code: 'UNSUPPORTED_CHARSET', message: 'Unsupported character set.' }
};

function bodyParserError(error: unknown) {
  const type = (error as { type?: unknown } | null)?.type;
  return typeof type === 'string' ? PARSER_ERRORS[type] : undefined;
}
