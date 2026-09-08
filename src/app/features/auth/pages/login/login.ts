import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  usuario = '';
  password = '';
  mensajeError = '';

  constructor(private authService: Auth, private router: Router) {}

  ingresar() {
    this.mensajeError = '';

    this.authService.login(this.usuario, this.password).subscribe({
      next: (response) => {
        const usuario = response?.usuario;
        const token = response?.token;

        if (usuario && token) {
          localStorage.setItem('token', token);
          localStorage.setItem('usuarioLogueado', usuario.nombreUsuario ?? 'Usuario');
          localStorage.setItem('rolUsuario', usuario.rol?.nombreRol ?? 'Sin rol');
          this.router.navigate(['/']);
        } else {
          this.mensajeError = 'Respuesta inesperada del servidor';
        }
      },
      error: (err) => {
        this.mensajeError = err.error?.mensaje || 'Ocurrió un error al conectar con el servidor';
      },
    });
  }
}


