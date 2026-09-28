import { ErrorCode } from '@anderp/shared';
import { DomainError } from '../../../shared/errors/domain-error';

export const authErrors = {
  invalidCredentials: () => new DomainError(ErrorCode.INVALID_CREDENTIALS, 401),
  accountLocked: () => new DomainError(ErrorCode.ACCOUNT_LOCKED, 423),
  accountDisabled: (status: 401 | 403 = 403) => new DomainError(ErrorCode.ACCOUNT_DISABLED, status),
  sessionRevoked: () => new DomainError(ErrorCode.SESSION_REVOKED, 401),
  invalidCurrentPassword: () => new DomainError(ErrorCode.INVALID_CURRENT_PASSWORD, 422),
  invalidResetToken: () => new DomainError(ErrorCode.INVALID_RESET_TOKEN, 422),
};
