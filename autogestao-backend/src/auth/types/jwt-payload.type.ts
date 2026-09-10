import { UserRole } from '../../generated/prisma/client';

export interface JwtPayload {
  sub: string;
  dealershipId: string;
  role: UserRole;
}

export interface AuthenticatedUser {
  userId: string;
  dealershipId: string;
  role: UserRole;
}
