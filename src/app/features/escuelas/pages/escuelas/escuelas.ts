import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Escuela } from '../../../../core/services/escuela';

@Component({
  selector: 'app-escuelas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './escuelas.html',
  styleUrl: './escuelas.css',
})
export class Escuelas implements OnInit {
  listaEscuelas: any[] = [];
  escuelasFiltradas: any[] = [];
  criterioBusqueda = '';
  cargando = false;

  mostrarModal = false;
  editando = false;
  idEscuelaSeleccionada: number | null = null;

  nuevaEscuela = {
    nombreEscuela: '',
  };

  constructor(private escuelaService: Escuela, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.obtenerEscuelas();
  }

  obtenerEscuelas() {
    this.cargando = true;
    this.escuelaService.listar().subscribe({
      next: (data) => {
        this.listaEscuelas = data;
        this.escuelasFiltradas = data;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
      },
    });
  }

  filtrarEscuelas() {
    const busqueda = this.criterioBusqueda.toLowerCase().trim();
    if (!busqueda) {
      this.escuelasFiltradas = this.listaEscuelas;
    } else {
      this.escuelasFiltradas = this.listaEscuelas.filter(
        (e) =>
          e.nombreEscuela?.toLowerCase().includes(busqueda) ||
          e.idEscuela?.toString() === busqueda
      );
    }
  }

  abrirFormulario() {
    this.editando = false;
    this.idEscuelaSeleccionada = null;
    this.nuevaEscuela.nombreEscuela = '';
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idEscuelaSeleccionada = null;
    this.nuevaEscuela.nombreEscuela = '';
  }

  guardarEscuela() {
    if (!this.nuevaEscuela.nombreEscuela.trim()) {
      alert('Por favor, escribe el nombre de la escuela.');
      return;
    }

    if (this.editando && this.idEscuelaSeleccionada) {
      this.escuelaService.actualizar(this.idEscuelaSeleccionada, this.nuevaEscuela).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerEscuelas();
        },
        error: () => alert('Error al actualizar la escuela.'),
      });
    } else {
      this.escuelaService.crear(this.nuevaEscuela).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerEscuelas();
        },
        error: () => alert('Error al registrar la escuela.'),
      });
    }
  }

  prepararEdicion(escuela: any) {
    this.editando = true;
    this.idEscuelaSeleccionada = escuela.idEscuela;
    this.nuevaEscuela.nombreEscuela = escuela.nombreEscuela;
    this.mostrarModal = true;
  }

  eliminarEscuela(id: number) {
    if (confirm('¿Estás seguro de eliminar esta escuela?')) {
      this.escuelaService.eliminar(id).subscribe({
        next: () => this.obtenerEscuelas(),
        error: () => alert('No se pudo eliminar. Verifica que no tenga carreras asociadas.'),
      });
    }
  }
}







