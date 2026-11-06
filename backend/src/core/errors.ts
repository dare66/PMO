export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = 'Record') => new AppError(404, 'not_found', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to perform this action') => new AppError(403, 'forbidden', msg);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'validation_error', msg, details);
export const conflict = (msg: string, details?: unknown) => new AppError(409, 'conflict', msg, details);
export const unprocessable = (msg: string, details?: unknown) => new AppError(422, 'business_rule', msg, details);
