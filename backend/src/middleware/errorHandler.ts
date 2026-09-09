import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Log error details (never expose stack to client)
  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && status < 500 ? {} : {}),
  });
}

export class AppError extends Error {
  constructor(public message: string, public status: number = 400) {
    super(message);
    this.name = 'AppError';
  }
}
