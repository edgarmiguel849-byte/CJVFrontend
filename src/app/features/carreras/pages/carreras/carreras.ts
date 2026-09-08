import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Carrera } from '../../../../core/services/carrera';
import { Escuela } from '../../../../core/services/escuela';

@Component({
  selector: 'app-carreras',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './carreras.html',
  styleUrl: './carreras.css',
})
export class Carreras implements OnInit {
  listaCarreras: any[] = [];
  carrerasFiltradas: any[] = [];
  listaEscuelas: any[] = [];
  criterioBusqueda = '';
  cargando = false;

  mostrarModal = false;
  editando = false;
  idCarreraSeleccionada: number | null = null;

  nuevaCarrera = {
    nombreCarrera: '',
    idEscuela: null as number | null,
  };

  constructor(
    private carreraService: Carrera,
    private escuelaService: Escuela,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.obtenerCarreras();
    this.obtenerEscuelas();
  }

  obtenerCarreras() {
    this.cargando = true;
    this.carreraService.listar().subscribe({
      next: (data) => {
        this.listaCarreras = data;
        this.carrerasFiltradas = data;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
      },
    });
  }

  obtenerEscuelas() {
    this.escuelaService.listar().subscribe({
      next: (data) => {
        this.listaEscuelas = data;
      },
    });
  }

  filtrarCarreras() {
    const busqueda = this.criterioBusqueda.toLowerCase().trim();
    if (!busqueda) {
      this.carrerasFiltradas = this.listaCarreras;
    } else {
      this.carrerasFiltradas = this.listaCarreras.filter(
        (c) =>
          c.nombreCarrera?.toLowerCase().includes(busqueda) ||
          c.escuela?.nombreEscuela?.toLowerCase().includes(busqueda)
      );
    }
  }

  abrirFormulario() {
    this.editando = false;
    this.idCarreraSeleccionada = null;
    this.nuevaCarrera = { nombreCarrera: '', idEscuela: null };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idCarreraSeleccionada = null;
    this.nuevaCarrera = { nombreCarrera: '', idEscuela: null };
  }

  guardarCarrera() {
    if (!this.nuevaCarrera.nombreCarrera.trim()) {
      alert('Por favor, escribe el nombre de la carrera.');
      return;
    }
    if (!this.nuevaCarrera.idEscuela) {
      alert('Por favor, selecciona una escuela.');
      return;
    }

    const carreraParaEnviar = {
      nombreCarrera: this.nuevaCarrera.nombreCarrera,
      escuela: { idEscuela: this.nuevaCarrera.idEscuela },
      activo: true,
    };

    if (this.editando && this.idCarreraSeleccionada) {
      this.carreraService.actualizar(this.idCarreraSeleccionada, carreraParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerCarreras();
        },
        error: () => alert('Error al actualizar la carrera.'),
      });
    } else {
      this.carreraService.crear(carreraParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerCarreras();
        },
        error: () => alert('Error al registrar la carrera.'),
      });
    }
  }

  prepararEdicion(carrera: any) {
    this.editando = true;
    this.idCarreraSeleccionada = carrera.idCarrera;
    this.nuevaCarrera = {
      nombreCarrera: carrera.nombreCarrera,
      idEscuela: carrera.escuela?.idEscuela ?? null,
    };
    this.mostrarModal = true;
  }

  eliminarCarrera(id: number) {
    if (confirm('¿Estás seguro de eliminar esta carrera?')) {
      this.carreraService.eliminar(id).subscribe({
        next: () => this.obtenerCarreras(),
        error: () => alert('No se pudo eliminar la carrera.'),
      });
    }
  }
}


