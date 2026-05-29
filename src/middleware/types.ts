import { Request } from 'express';

export interface AuthContext {
  tenantId: string;
  userId?: string; // present for JWT auth
  role?: string; // profile role for JWT auth
  authType: 'jwt' | 'api_key';
  apiKeyId?: string; // present for API-key auth
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
