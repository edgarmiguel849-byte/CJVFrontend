import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  nombreUsuario = localStorage.getItem('usuarioLogueado') ?? 'Usuario';

  constructor(private router: Router) {}

  cerrarSesion() {
    localStorage.removeItem('usuarioLogueado');
    localStorage.removeItem('rolUsuario');
    this.router.navigate(['/login']);
  }
}