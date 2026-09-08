import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Bitacora } from '../../../../core/services/bitacora';

@Component({
  selector: 'app-bitacora',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bitacora.html',
  styleUrl: './bitacora.css',
})
export class BitacoraComponent implements OnInit {
  listaMovimientos: any[] = [];
  movimientosFiltrados: any[] = [];

  criterioBusqueda = '';
  cargando = false;

  constructor(
    private bitacoraService: Bitacora,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarBitacora();
  }

  cargarBitacora() {
    this.cargando = true;
    this.bitacoraService.listar().subscribe({
      next: (data) => {
        this.listaMovimientos = data.sort(
          (a, b) => b.idBitacora - a.idBitacora
        );
        this.movimientosFiltrados = this.listaMovimientos;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  filtrarMovimientos() {
    const busqueda = this.criterioBusqueda.toLowerCase().trim();
    if (!busqueda) {
      this.movimientosFiltrados = this.listaMovimientos;
    } else {
      this.movimientosFiltrados = this.listaMovimientos.filter(
        (m) =>
          m.tablaAfectada?.toLowerCase().includes(busqueda) ||
          m.accion?.toLowerCase().includes(busqueda) ||
          m.descripcion?.toLowerCase().includes(busqueda) ||
          m.usuario?.nombreUsuario?.toLowerCase().includes(busqueda)
      );
    }
  }

  claseAccion(accion: string): string {
    switch (accion) {
      case 'CREAR':
        return 'bg-success';
      case 'EDITAR':
        return 'bg-warning text-dark';
      case 'ELIMINAR':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }
}





