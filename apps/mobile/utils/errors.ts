import { showToast } from "@/utils/toast";

export enum ErrorCode {
  AUTH_FAILED = "AUTH_FAILED",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  INVALID_NAME = "INVALID_NAME",
  INVALID_ADDRESS = "INVALID_ADDRESS",
  INVALID_LABEL = "INVALID_LABEL",
  INVALID_AMOUNT = "INVALID_AMOUNT",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  ACCOUNT_HAS_BALANCE = "ACCOUNT_HAS_BALANCE",
  PASSKEY_CANCELLED = "PASSKEY_CANCELLED",
  PASSKEY_UNSUPPORTED = "PASSKEY_UNSUPPORTED",
  PASSKEY_MISMATCH = "PASSKEY_MISMATCH",
  PASSKEY_ACCOUNT_NOT_FOUND = "PASSKEY_ACCOUNT_NOT_FOUND",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_FAILED]: "Sign in didn't finish. Try again.",
  [ErrorCode.SESSION_EXPIRED]: "Your session expired. Sign in again.",
  [ErrorCode.INVALID_NAME]: "That name isn't valid.",
  [ErrorCode.INVALID_ADDRESS]: "That address isn't valid.",
  [ErrorCode.INVALID_LABEL]: "That label isn't valid.",
  [ErrorCode.INVALID_AMOUNT]: "Minimum amount is $1.",
  [ErrorCode.INSUFFICIENT_BALANCE]: "Insufficient balance.",
  [ErrorCode.ACCOUNT_HAS_BALANCE]:
    "Send or cash out your full balance before deleting your account.",
  [ErrorCode.PASSKEY_CANCELLED]: "Face ID was cancelled.",
  [ErrorCode.PASSKEY_UNSUPPORTED]:
    "This phone's passkeys can't open a Ferry account. iOS 18.4 or newer is needed.",
  [ErrorCode.PASSKEY_MISMATCH]:
    "That passkey belongs to a different Ferry account. Sign out to switch accounts.",
  [ErrorCode.PASSKEY_ACCOUNT_NOT_FOUND]:
    "That passkey does not open an existing Ferry account on this device. Try another passkey or use the original device.",
  [ErrorCode.UNKNOWN_ERROR]: "Something went wrong. Try again.",
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public shouldLog: boolean = true,
    public shouldDisplay: boolean = true
  ) {
    super(ErrorMessages[code] || ErrorMessages[ErrorCode.UNKNOWN_ERROR]);
    this.name = "AppError";
  }

  showToast() {
    if (this.shouldDisplay) showToast(ErrorMessages[this.code]);
    if (this.shouldLog)
      console.error(`AppError: ${this.code} - ${this.message}`);
  }
}

export function handleError(
  error: ErrorCode,
  shouldLog: boolean,
  shouldDisplay: boolean
): AppError {
  const appError = new AppError(error, shouldLog, shouldDisplay);
  appError.showToast();
  return appError;
}
