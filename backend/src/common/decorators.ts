import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/** Shape attached to `request.user` by JwtStrategy. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  role: 'admin' | 'user';
  allowed_modules: string[];
  can_upload_pdf: boolean;
  is_active: boolean;
}

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the listed roles. */
export const Roles = (...roles: Array<'admin' | 'user'>) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
