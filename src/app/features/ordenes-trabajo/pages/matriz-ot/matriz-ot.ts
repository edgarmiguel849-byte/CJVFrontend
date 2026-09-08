import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OrdenTrabajo } from '../../../../core/services/orden-trabajo';

@Component({
  selector: 'app-matriz-ot',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './matriz-ot.html',
  styleUrl: './matriz-ot.css',
})
export class MatrizOt implements OnInit {
  matriz: any = null;
  cargando = false;
  error = '';

  /**
   * Momento en que se mandó imprimir. Sale al pie de la hoja.
   *
   * Una matriz de pagos cambia cada semana: sin esta marca, dentro de tres
   * meses nadie sabe si el papel que trae la vendedora es de hoy o de agosto.
   * Se llena justo antes de imprimir, no al cargar la pantalla, para que
   * diga cuándo se imprimió y no cuándo se abrió.
   */
  fechaImpresion: Date | null = null;

  constructor(
    private route: ActivatedRoute,
    private ordenService: OrdenTrabajo,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.cargarMatriz(id);
    }
  }

  cargarMatriz(id: number) {
    this.cargando = true;
    this.error = '';
    this.ordenService.matriz(id).subscribe({
      next: (data) => {
        this.matriz = data;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error || 'No se pudo cargar la matriz.';
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Manda la matriz a la impresora.
   *
   * El acomodo de la hoja (oficio horizontal, sin menú, sin botones) vive
   * en el bloque @media print de matriz-ot.css. Aquí solo se pone la
   * marca de tiempo y se abre el diálogo del navegador.
   *
   * El setTimeout no es capricho: window.print() congela la página, y sin
   * él se dispararía ANTES de que Angular alcance a pintar la fecha en el
   * pie. Saldría la hoja con el pie en blanco.
   *
   * OJO al usarlo: aunque el CSS pide oficio, el diálogo de impresión
   * manda. Si el desplegable de tamaño dice "Carta", hay que cambiarlo a
   * "Oficio" ahí mismo la primera vez.
   */
  imprimir() {
    this.fechaImpresion = new Date();
    this.cdr.detectChanges();
    setTimeout(() => window.print(), 0);
  }

   /**
   * El ciclo se considera CERRADO solo cuando la fecha ya pasó.
   * Una fecha futura es una cita agendada, no un hecho consumado.
   */
  cicloCerrado(): boolean {
    const texto = this.matriz?.ordenTrabajo?.fechaCierreCiclo;
    if (!texto) {
      return false;
    }
    const fecha = new Date(String(texto).substring(0, 10) + 'T00:00:00');
    if (isNaN(fecha.getTime())) {
      return false;
    }
    return new Date() >= fecha;
  }

  // "44/26" a partir de numero y anio
  numeroOT(): string {
    const ot = this.matriz?.ordenTrabajo;
    if (!ot) return '';
    return `${ot.numero}/${String(ot.anio).slice(-2)}`;
  }

  // Mes corto para el encabezado: "Julio 2026" -> "Jul 26"
  mesCorto(etiqueta: string): string {
    const partes = etiqueta.split(' ');
    if (partes.length < 2) return etiqueta;
    const mes = partes[0].slice(0, 3);
    const anio = partes[1].slice(-2);
    return `${mes} ${anio}`;
  }

  // Texto de la columna Resta según el signo (RN-09)
  textoResta(resta: number): string {
    if (resta > 0) return 'Le resta';
    if (resta < 0) return 'A favor';
    return 'Pagado';
  }

  claseResta(resta: number): string {
    if (resta > 0) return 'text-danger fw-bold';
    if (resta < 0) return 'text-primary fw-bold';
    return 'text-success fw-bold';
  }

  // Suma de montos de una celda (por si hay varios pagos el mismo mes)
  totalCelda(celda: any[]): number {
    if (!celda || celda.length === 0) return 0;
    return celda.reduce((sum, c) => sum + Number(c.monto), 0);
  }

  nombreCompleto(fila: any): string {
    return `${fila.nombre} ${fila.apellidoPaterno} ${fila.apellidoMaterno}`.trim();
  }
}