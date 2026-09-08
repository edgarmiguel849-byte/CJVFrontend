import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Contrato } from '../../../../core/services/contrato';

@Component({
  selector: 'app-buscar-alumno',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './buscar-alumno.html',
  styleUrl: './buscar-alumno.css',
})
export class BuscarAlumno {
  criterio = '';
  resultados: any[] = [];
  buscando = false;
  yaBusco = false;

  // Meses para marcar "Vencido" (mismo número en todo el sistema).
  private readonly MESES_PARA_VENCER = 4;

  private busqueda$ = new Subject<string>();

  constructor(
    private contratoService: Contrato,
    private cdr: ChangeDetectorRef
  ) {
    // Espera 300ms tras dejar de teclear antes de buscar (evita una consulta por letra)
    this.busqueda$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((texto) => this.ejecutarBusqueda(texto));
  }

  alEscribir() {
    this.busqueda$.next(this.criterio);
  }

  ejecutarBusqueda(texto: string) {
    const t = texto.trim();
    if (t.length < 2) {
      this.resultados = [];
      this.yaBusco = false;
      this.cdr.detectChanges();
      return;
    }

    this.buscando = true;
    this.yaBusco = true;
    this.contratoService.buscarAlumno(t).subscribe({
      next: (data) => {
        this.resultados = data;
        this.buscando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.resultados = [];
        this.buscando = false;
        this.cdr.detectChanges();
      },
    });
  }

  nombreCompleto(c: any): string {
    // El nombre ahora vive directo en el contrato (nombre_alumno).
    if (c?.nombreAlumno && c.nombreAlumno.trim()) {
      return c.nombreAlumno.trim();
    }
    // Respaldo por si algún contrato viejo todavía tuviera cliente.
    const cl = c?.cliente;
    if (cl) {
      return `${cl.nombre ?? ''} ${cl.apellidoPaterno ?? ''} ${cl.apellidoMaterno ?? ''}`.trim();
    }
    return 'Sin nombre';
  }

  // "44/26" o "Adicional"
  formatearOT(ot: any): string {
    if (!ot || !ot.numero || !ot.anio) return 'Adicional';
    return `${ot.numero}/${String(ot.anio).slice(-2)}`;
  }

  textoResta(resta: number): string {
    if (resta > 0) return 'Le resta';
    if (resta < 0) return 'A favor';
    return 'Pagado';
  }

  claseResta(resta: number): string {
    if (resta > 0) return 'text-danger';
    if (resta < 0) return 'text-primary';
    return 'text-success';
  }

  // ===================== ETIQUETA "VENCIDO" =====================
  // OJO: NO cambia nada en la base. El contrato sigue "Activo" y se le puede
  // cobrar y entregar igual. Es puro letrero informativo.
  //
  // Esta pantalla mezcla los dos mundos, así que el reloj depende del tipo:
  //   - Contrato de GRUPO (tiene O.T.) -> cierre de ciclo de la O.T.
  //   - ADICIONAL (sin O.T.)           -> fecha de entrega del contrato
  // Sin fecha capturada no vence nunca (sin fecha no hay reloj).

  /** De dónde arranca el reloj, según sea de grupo o adicional. */
  private fechaInicioVencimiento(item: any): Date | null {
    const contrato = item?.contrato;
    if (!contrato) {
      return null;
    }

    const texto = contrato.ordenTrabajo
      ? contrato.ordenTrabajo.fechaCierreCiclo   // grupo
      : contrato.fechaEntrega;                   // adicional

    if (!texto) {
      return null;
    }
    const fecha = new Date(String(texto).substring(0, 10) + 'T00:00:00');
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  /** ¿Este contrato ya está vencido? */
  estaVencido(item: any): boolean {
    if (this.estaCancelado(item)) {
      return false;
    }

    const resta = Number(item?.resta ?? 0);
    if (resta <= 0) {
      return false;
    }

    const inicio = this.fechaInicioVencimiento(item);
    if (!inicio) {
      return false;
    }

    const limite = new Date(inicio);
    limite.setMonth(limite.getMonth() + this.MESES_PARA_VENCER);
    return new Date() > limite;
  }

  estaCancelado(item: any): boolean {
    const nombre = item?.contrato?.estadoContrato?.nombreEstado ?? '';
    return nombre.toLowerCase().includes('cancel');
  }

  /** El texto del badge de estado. */
  textoEstado(item: any): string {
    if (this.estaCancelado(item)) {
      return item?.contrato?.estadoContrato?.nombreEstado ?? 'Cancelado';
    }
    if (this.estaVencido(item)) {
      return 'Vencido';
    }
    return item?.contrato?.estadoContrato?.nombreEstado ?? '—';
  }

  /** El color del badge. */
  claseEstado(item: any): string {
    if (this.estaCancelado(item)) {
      return 'bg-danger';
    }
    if (this.estaVencido(item)) {
      return 'bg-warning text-dark';
    }
    return 'bg-success';
  }

  /** Explicación al pasar el mouse. */
  tituloEstado(item: any): string {
    if (!this.estaVencido(item)) {
      return '';
    }
    const inicio = this.fechaInicioVencimiento(item);
    if (!inicio) {
      return '';
    }
    const limite = new Date(inicio);
    limite.setMonth(limite.getMonth() + this.MESES_PARA_VENCER);

    const origen = item?.contrato?.ordenTrabajo
      ? 'del cierre de ciclo'
      : 'de la fecha de entrega';

    return (
      'Pasaron ' + this.MESES_PARA_VENCER + ' meses ' + origen +
      ' (venció el ' + limite.toLocaleDateString('es-MX') +
      ') y aún tiene saldo. El contrato sigue funcionando normal.'
    );
  }
}