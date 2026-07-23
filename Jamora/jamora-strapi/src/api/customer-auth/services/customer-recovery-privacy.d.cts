export const RECOVERY_PRIVACY_FLOOR_MS: number;
export function createRecoveryTokenWork(): {
  token: string;
  tokenHash: string;
};
export function waitForRecoveryPrivacyFloor(
  startedAt: number,
  options?: {
    minimumMs?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<unknown>;
  },
): Promise<void>;
export function runRecoveryPrivacyWork<T>(
  operation: (work: { token: string; tokenHash: string }) => Promise<T>,
  dependencies?: {
    now?: () => number;
    createTokenWork?: () => { token: string; tokenHash: string };
    waitForFloor?: (startedAt: number) => Promise<unknown>;
  },
): Promise<T>;
