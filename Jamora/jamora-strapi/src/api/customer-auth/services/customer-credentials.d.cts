export function hashPassword(password: string): Promise<string>;
export function verifyPassword(password: string, stored: string): Promise<boolean>;
export function issueOpaqueToken(): string;
export function hashOpaqueToken(token: string): string;
