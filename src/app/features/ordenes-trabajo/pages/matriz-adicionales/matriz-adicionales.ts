import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Contrato, MatrizAdicionales, FilaAdicional } from '../../../../core/services/contrato';

/**
 * Pantalla de la matriz de adicionales "0/AA": la réplica del Excel.
 *
 * NO es una O.T. de verdad. Es una consulta de todos los adicionales de
 * un año, acomodados por PAGOS (no por meses, como la matriz de grupos).
 *
 * Los totales del pie se recalculan sobre las filas VISIBLES, para que
 * al filtrar el pie siempre cuadre con lo que se está viendo.
 */
@Component({
  selector: 'app-matriz-adicionales',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './matriz-adicionales.html',
  styleUrl: './matriz-adicionales.css',
})
export class MatrizAdicionalesComponent implements OnInit {

  anio: number = new Date().getFullYear();
  matriz: MatrizAdicionales | null = null;

  cargando = false;
  error = '';

  criterio = '';
  ocultarCancelados = false;

  // Lo que se pinta en la tabla
  filasVisibles: FilaAdicional[] = [];
  columnas: number[] = [];          // [0,1,2...] una por cada columna FOLIO+PAGO

  // Totales del pie, calculados sobre filasVisibles
  totalRecibosAnteriores = 0;
  totalAnticipos = 0;
  totalesPorColumna: number[] = [];
  totalGeneral = 0;
  abonadoGeneral = 0;
  restaGeneral = 0;
  canceladosVisibles = 0;
  vencidosVisibles = 0;
  rolUsuario: string = localStorage.getItem('rolUsuario') ?? '';

  constructor(
    private ruta: ActivatedRoute,
    private router: Router,
    private contratoService: Contrato,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Si cambias de 0/26 a 0/25 sin salir de la pantalla, esto se entera.
    this.ruta.paramMap.subscribe((params) => {
      const valor = Number(params.get('anio'));
      this.anio = valor > 0 ? valor : new Date().getFullYear();
      this.cargar();
    });
  }

  cargar() {
    this.cargando = true;
    this.error = '';

    this.contratoService.obtenerMatrizAdicionales(this.anio).subscribe({
      next: (data) => {
        this.matriz = data;

        // Una entrada por cada columna FOLIO+PAGO que trajo el backend
        this.columnas = [];
        for (let i = 0; i < (data?.columnasPago ?? 0); i++) {
          this.columnas.push(i);
        }

        this.aplicarFiltro();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'No se pudo cargar la matriz de adicionales.';
        this.matriz = null;
        this.filasVisibles = [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  /** Filtra por texto (nombre, adicional, folio, carrera, escuela) y por cancelados. */
  aplicarFiltro() {
    const todas = this.matriz?.filas ?? [];
    const busqueda = this.criterio.trim().toLowerCase();

    this.filasVisibles = todas.filter((f) => {
      if (this.ocultarCancelados && f.cancelado) {
        return false;
      }
      if (!busqueda) {
        return true;
      }
      return (
        (f.nombreAlumno ?? '').toLowerCase().includes(busqueda) ||
        (f.ad ?? '').toLowerCase().includes(busqueda) ||
        (f.folioContrato ?? '').toLowerCase().includes(busqueda) ||
        (f.carrera ?? '').toLowerCase().includes(busqueda) ||
        (f.escuela ?? '').toLowerCase().includes(busqueda) ||
        (f.generacion ?? '').toLowerCase().includes(busqueda) ||
        (f.concepto ?? '').toLowerCase().includes(busqueda)
      );
    });

    this.recalcularTotales();
  }

  /** Suma el pie con lo que está visible en este momento. */
  private recalcularTotales() {
    this.totalRecibosAnteriores = 0;
    this.totalAnticipos = 0;
    this.totalGeneral = 0;
    this.abonadoGeneral = 0;
    this.restaGeneral = 0;
    this.canceladosVisibles = 0;
    this.vencidosVisibles = 0;
    this.totalesPorColumna = this.columnas.map(() => 0);

    for (const f of this.filasVisibles) {
      this.totalRecibosAnteriores += f.recibosAnteriores ?? 0;
      this.totalAnticipos += f.anticipo ?? 0;
      this.totalGeneral += f.total ?? 0;
      this.abonadoGeneral += f.abonado ?? 0;

    if (f.cancelado) {
        this.canceladosVisibles++;
      }
      if (f.vencido) {
        this.vencidosVisibles++;
      }

      for (const i of this.columnas) {
        const celda = f.pagos ? f.pagos[i] : null;
        if (celda) {
          this.totalesPorColumna[i] += celda.monto ?? 0;
        }
      }
    }

    this.restaGeneral = this.totalGeneral - this.abonadoGeneral;
  }

  limpiarFiltro() {
    this.criterio = '';
    this.ocultarCancelados = false;
    this.aplicarFiltro();
  }

  hayFiltroActivo(): boolean {
    return this.criterio.trim() !== '' || this.ocultarCancelados;
  }

  /** Abre el contrato de ese renglón en la pantalla de adicionales. */
  abrirContrato(fila: FilaAdicional) {
    this.router.navigate(['/contratos-adicionales'], {
      queryParams: { texto: fila.folioContrato },
    });
  }

  volver() {
    this.router.navigate(['/ordenes-trabajo']);
  }

  imprimir() {
    window.print();
  }
}