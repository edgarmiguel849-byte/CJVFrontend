import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const rol = localStorage.getItem('rolUsuario');

  if (rol) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};