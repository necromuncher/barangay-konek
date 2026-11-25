import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const path = state.url.split(/[?#]/, 1)[0];
  if (path === '/community' || path === '/marketplace' || path.startsWith('/marketplace/')) return true;
  return auth.ready.then(() => auth.account() ? true : router.createUrlTree(['/']));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ready.then(() => {
    const role = auth.account()?.role;
    return role === 'officer' || role === 'captain' || role === 'superuser'
      ? true
      : router.createUrlTree(['/dashboard']);
  });
};

export const superuserGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ready.then(() => auth.account()?.role === 'superuser'
    ? true
    : router.createUrlTree(['/dashboard']));
};
