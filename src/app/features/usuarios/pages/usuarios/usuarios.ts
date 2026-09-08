import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Usuario } from '../../../../core/services/usuario';
import { Rol } from '../../../../core/services/rol';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.css',
})
export class Usuarios implements OnInit {
  listaUsuarios: any[] = [];
  usuariosFiltrados: any[] = [];
  listaRoles: any[] = [];

  criterioBusqueda = '';
  cargando = false;
  guardando = false;

  mostrarModal = false;
  editando = false;
  idUsuarioSeleccionado: number | null = null;

  nuevoUsuario = {
    nombreUsuario: '',
    correo: '',
    contrasena: '',
    porcentajeComision: 0,
    esVendedora: false,
    idRol: null as number | null,
    activo: true,
  };

  constructor(
    private usuarioService: Usuario,
    private rolService: Rol,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.obtenerUsuarios();
    this.obtenerRoles();
  }

  // Cierra el modal con la tecla Escape
  @HostListener('document:keydown.escape')
  cerrarConEscape() {
    if (this.mostrarModal) {
      this.cerrarModal();
    }
  }

  obtenerUsuarios() {
    this.cargando = true;
    this.usuarioService.listar().subscribe({
      next: (data) => {
        this.listaUsuarios = data;
        this.usuariosFiltrados = data;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
      },
    });
  }

  obtenerRoles() {
    this.rolService.listar().subscribe({
      next: (data) => (this.listaRoles = data),
    });
  }

  filtrarUsuarios() {
    const busqueda = this.criterioBusqueda.toLowerCase().trim();
    if (!busqueda) {
      this.usuariosFiltrados = this.listaUsuarios;
    } else {
      this.usuariosFiltrados = this.listaUsuarios.filter(
        (u) =>
          u.nombreUsuario?.toLowerCase().includes(busqueda) ||
          u.correo?.toLowerCase().includes(busqueda) ||
          u.rol?.nombreRol?.toLowerCase().includes(busqueda)
      );
    }
  }

  trackByUsuario(_indice: number, usuario: any): number {
    return usuario.idUsuario;
  }

  abrirFormulario() {
    this.editando = false;
    this.idUsuarioSeleccionado = null;
    this.nuevoUsuario = {
      nombreUsuario: '',
      correo: '',
      contrasena: '',
      porcentajeComision: 0,
      esVendedora: false,
      idRol: null,
      activo: true,
    };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idUsuarioSeleccionado = null;
  }

  guardarUsuario() {
    const u = this.nuevoUsuario;

    if (!u.nombreUsuario.trim()) {
      alert('El nombre de usuario es obligatorio.');
      return;
    }
    if (!u.correo.trim()) {
      alert('El correo es obligatorio.');
      return;
    }
    if (!u.idRol) {
      alert('Selecciona un rol.');
      return;
    }
    if (!this.editando && !u.contrasena.trim()) {
      alert('La contraseña es obligatoria al crear un usuario.');
      return;
    }
    if (u.porcentajeComision < 0 || u.porcentajeComision > 100) {
      alert('El porcentaje de comisión debe estar entre 0 y 100.');
      return;
    }

    const usuarioParaEnviar: any = {
      nombreUsuario: u.nombreUsuario.trim(),
      correo: u.correo.trim(),
      porcentajeComision: u.porcentajeComision,
      esVendedora: u.esVendedora,
      rol: { idRol: u.idRol },
      activo: u.activo,
    };

    if (u.contrasena.trim()) {
      usuarioParaEnviar.contrasena = u.contrasena;
    }

    this.guardando = true;

    if (this.editando && this.idUsuarioSeleccionado) {
      this.usuarioService.actualizar(this.idUsuarioSeleccionado, usuarioParaEnviar).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.obtenerUsuarios();
        },
        error: () => {
          this.guardando = false;
          alert('Error al actualizar el usuario.');
        },
      });
    } else {
      this.usuarioService.crear(usuarioParaEnviar).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.obtenerUsuarios();
        },
        error: () => {
          this.guardando = false;
          alert('Error al registrar el usuario. Verifica que el nombre no esté repetido.');
        },
      });
    }
  }

  prepararEdicion(usuario: any) {
    this.editando = true;
    this.idUsuarioSeleccionado = usuario.idUsuario;
    this.nuevoUsuario = {
      nombreUsuario: usuario.nombreUsuario,
      correo: usuario.correo ?? '',
      contrasena: '',
      porcentajeComision: usuario.porcentajeComision ?? 0,
      esVendedora: usuario.esVendedora ?? false,
      idRol: usuario.rol?.idRol ?? null,
      activo: usuario.activo ?? true,
    };
    this.mostrarModal = true;
  }

  eliminarUsuario(id: number) {
    if (confirm('¿Estás seguro de eliminar este usuario?')) {
      this.usuarioService.eliminar(id).subscribe({
        next: () => this.obtenerUsuarios(),
        error: () =>
          alert('No se puede eliminar este usuario porque tiene contratos o pagos asociados.'),
      });
    }
  }
}