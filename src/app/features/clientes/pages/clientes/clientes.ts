import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Cliente } from '../../../../core/services/cliente';
import { Carrera } from '../../../../core/services/carrera';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class Clientes implements OnInit {
  listaClientes: any[] = [];
  clientesFiltrados: any[] = [];
  listaCarreras: any[] = [];
  criterioBusqueda = '';
  cargando = false;

  mostrarModal = false;
  editando = false;
  idClienteSeleccionado: number | null = null;

  nuevoCliente = {
    nombre: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    telefono: '',
    telefono2: '',
    correo: '',
    idCarrera: null as number | null,
  };

  constructor(
    private clienteService: Cliente,
    private carreraService: Carrera,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.obtenerClientes();
    this.obtenerCarreras();
  }

  obtenerClientes() {
    this.cargando = true;
    this.clienteService.listar().subscribe({
      next: (data) => {
        this.listaClientes = data;
        this.clientesFiltrados = data;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
      },
    });
  }

  obtenerCarreras() {
    this.carreraService.listar().subscribe({
      next: (data) => {
        this.listaCarreras = data;
      },
    });
  }

  filtrarClientes() {
    const busqueda = this.criterioBusqueda.toLowerCase().trim();
    if (!busqueda) {
      this.clientesFiltrados = this.listaClientes;
    } else {
      this.clientesFiltrados = this.listaClientes.filter(
        (c) =>
          c.nombreCompleto?.toLowerCase().includes(busqueda) ||
          c.telefono?.toLowerCase().includes(busqueda) ||
          c.telefono2?.toLowerCase().includes(busqueda) ||
          c.carrera?.nombreCarrera?.toLowerCase().includes(busqueda)
      );
    }
  }

  abrirFormulario() {
    this.editando = false;
    this.idClienteSeleccionado = null;
    this.nuevoCliente = {
      nombre: '',
      apellidoPaterno: '',
      apellidoMaterno: '',
      telefono: '',
      telefono2: '',
      correo: '',
      idCarrera: null,
    };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idClienteSeleccionado = null;
  }

  guardarCliente() {
    if (!this.nuevoCliente.nombre.trim() || !this.nuevoCliente.apellidoPaterno.trim()) {
      alert('El nombre y el apellido paterno son obligatorios.');
      return;
    }
    if (!this.nuevoCliente.idCarrera) {
      alert('Por favor, selecciona una carrera.');
      return;
    }

    const clienteParaEnviar = {
      nombre: this.nuevoCliente.nombre,
      apellidoPaterno: this.nuevoCliente.apellidoPaterno,
      apellidoMaterno: this.nuevoCliente.apellidoMaterno,
      telefono: this.nuevoCliente.telefono,
      telefono2: this.nuevoCliente.telefono2,
      correo: this.nuevoCliente.correo,
      carrera: { idCarrera: this.nuevoCliente.idCarrera },
      activo: true,
    };

    if (this.editando && this.idClienteSeleccionado) {
      this.clienteService.actualizar(this.idClienteSeleccionado, clienteParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerClientes();
        },
        error: () => alert('Error al actualizar el cliente.'),
      });
    } else {
      this.clienteService.crear(clienteParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerClientes();
        },
        error: () => alert('Error al registrar el cliente.'),
      });
    }
  }

  prepararEdicion(cliente: any) {
    this.editando = true;
    this.idClienteSeleccionado = cliente.idCliente;
    this.nuevoCliente = {
      nombre: cliente.nombre,
      apellidoPaterno: cliente.apellidoPaterno,
      apellidoMaterno: cliente.apellidoMaterno ?? '',
      telefono: cliente.telefono ?? '',
      telefono2: cliente.telefono2 ?? '',
      correo: cliente.correo ?? '',
      idCarrera: cliente.carrera?.idCarrera ?? null,
    };
    this.mostrarModal = true;
  }

  eliminarCliente(id: number) {
    if (confirm('¿Estás seguro de eliminar este cliente?')) {
      this.clienteService.eliminar(id).subscribe({
        next: () => this.obtenerClientes(),
        error: () => alert('No se pudo eliminar el cliente.'),
      });
    }
  }
}