import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restringe uma rota a determinados papéis. Quando omitido, qualquer
 * usuário autenticado pode acessar a rota — o RolesGuard só age quando
 * este decorator está presente.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
