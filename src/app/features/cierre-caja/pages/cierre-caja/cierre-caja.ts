import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CorteDia } from '../../../../core/services/corte-dia';
import { CierreCaja as CierreCajaService } from '../../../../core/services/cierre-caja';

@Component({
  selector: 'app-cierre-caja',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cierre-caja.html',
  styleUrl: './cierre-caja.css',
})
export class CierreCaja implements OnInit {
  fecha = '';
  corte: any = null;

  /** El acta guardada de ese día. Null = ese día todavía no se cierra. */
  cierreGuardado: any = null;

  esJefe: boolean = localStorage.getItem('rolUsuario') === 'Jefe';

  cargando = false;
  guardando = false;
  error = '';
  yaConsulto = false;

  // Conteo físico del cajón (lo teclea el mostrador para comparar)
  conteoFisico: number | null = null;
  comentarioCierre = '';

  constructor(
    private corteService: CorteDia,
    private cierreService: CierreCajaService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.fecha = new Date().toISOString().split('T')[0];
    this.generar();
  }

  irHoy() {
    this.fecha = new Date().toISOString().split('T')[0];
    this.generar();
  }

  generar() {
    if (!this.fecha) {
      this.error = 'Selecciona una fecha.';
      return;
    }

    this.cargando = true;
    this.error = '';
    this.corte = null;
    this.cierreGuardado = null;
    this.conteoFisico = null;
    this.comentarioCierre = '';

    this.corteService.obtener(this.fecha).subscribe({
      next: (data) => {
        this.corte = data;
        this.cargando = false;
        this.yaConsulto = true;
        this.cdr.detectChanges();
        // Ya que tenemos el corte, revisamos si ese día ya se cerró.
        this.consultarCierreGuardado();
      },
      error: (err) => {
        this.cargando = false;
        this.yaConsulto = true;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo generar el corte del día.';
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Pregunta si ese día ya tiene acta guardada.
   * Si no la tiene, el backend responde 204 y aquí llega null.
   */
  consultarCierreGuardado() {
    this.cierreService.buscarPorFecha(this.fecha).subscribe({
      next: (data) => {
        this.cierreGuardado = data ?? null;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cierreGuardado = null;
        this.cdr.detectChanges();
      },
    });
  }

  // ---------- Estados de la pantalla ----------

  estaCerrado(): boolean {
    return this.cierreGuardado !== null;
  }

  estaAutorizado(): boolean {
    return this.cierreGuardado?.estado === 'AUTORIZADO';
  }

  estaEnviado(): boolean {
    return this.cierreGuardado?.estado === 'ENVIADO';
  }

  // ---------- Acciones ----------

  /** True cuando la caja no cuadra (y por tanto el comentario es obligatorio). */
  hayDiferencia(): boolean {
    const dif = this.diferencia();
    return dif !== null && Math.abs(dif) >= 0.01;
  }

  puedeEnviar(): boolean {
    if (this.estaCerrado() || this.guardando) {
      return false;
    }
    if (this.conteoFisico === null || this.conteoFisico < 0) {
      return false;
    }
    // Si no cuadra, el comentario es obligatorio.
    if (this.hayDiferencia() && !this.comentarioCierre.trim()) {
      return false;
    }
    return true;
  }

  enviarCierre() {
    if (!this.puedeEnviar()) {
      return;
    }

    const dif = this.diferencia();
    const mensaje = this.hayDiferencia() && dif !== null
      ? `La caja no cuadra por $${Math.abs(dif).toFixed(2)}. ¿Enviar el cierre de todos modos?`
      : '¿Enviar el cierre de este día? Después solo el jefe puede modificarlo.';

    if (!confirm(mensaje)) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.cierreService
      .enviar(this.fecha, Number(this.conteoFisico), this.comentarioCierre.trim())
      .subscribe({
        next: (data) => {
          this.guardando = false;
          this.cierreGuardado = data;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.error = err.error && typeof err.error === 'string'
            ? err.error
            : 'No se pudo enviar el cierre.';
          this.cdr.detectChanges();
        },
      });
  }

  autorizarCierre() {
    if (!this.cierreGuardado || !this.esJefe) {
      return;
    }
    if (!confirm('¿Autorizar este cierre? Queda como acta cerrada del día.')) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.cierreService.autorizar(this.cierreGuardado.idCierreCaja).subscribe({
      next: (data) => {
        this.guardando = false;
        this.cierreGuardado = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardando = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo autorizar el cierre.';
        this.cdr.detectChanges();
      },
    });
  }

  reabrirCierre() {
    if (!this.cierreGuardado || !this.esJefe) {
      return;
    }
    if (!confirm('¿Reabrir este cierre? Va a volver a quedar pendiente de autorizar.')) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.cierreService.reabrir(this.cierreGuardado.idCierreCaja).subscribe({
      next: (data) => {
        this.guardando = false;
        this.cierreGuardado = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardando = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo reabrir el cierre.';
        this.cdr.detectChanges();
      },
    });
  }

  eliminarCierre() {
    if (!this.cierreGuardado || !this.esJefe) {
      return;
    }
    if (!confirm('¿Eliminar este cierre para poder rehacerlo desde cero?')) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.cierreService.eliminar(this.cierreGuardado.idCierreCaja).subscribe({
      next: () => {
        this.guardando = false;
        this.cierreGuardado = null;
        this.conteoFisico = null;
        this.comentarioCierre = '';
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardando = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo eliminar el cierre.';
        this.cdr.detectChanges();
      },
    });
  }

  // ---------- La hoja del corte ----------

  esOficina(fila: any): boolean {
    return fila?.idUsuario === null || fila?.idUsuario === undefined;
  }

  // Las columnas del papel: una por cada destinatario con movimiento ese día
  columnas(): any[] {
    return this.corte?.ingresos?.filas || [];
  }

  // El monto solo aparece en la columna de su destinatario (como el papel)
  // El monto solo aparece en la columna de su destinatario (como el papel).
  // Las cortesías NO van en ninguna columna de destinatario: tienen la suya
  // al final. Sin este primer if caerían en Oficina, porque las dos usan
  // idDestinatario null.
  montoEnColumna(renglon: any, columna: any): number | null {
    if (renglon?.esCortesia) {
      return null;
    }
    const mismoDestinatario =
      (renglon.idDestinatario === null && columna.idUsuario === null) ||
      (renglon.idDestinatario === columna.idUsuario);
    return mismoDestinatario ? renglon.monto : null;
  }

  // ¿Hubo cortesías este día? Si no, la columna ni se dibuja.
  hayCortesias(): boolean {
    return Number(this.corte?.ingresos?.totalCortesias ?? 0) > 0;
  }

  // Total regalado del día (lo calcula el backend).
  totalCortesias(): number {
    return Number(this.corte?.ingresos?.totalCortesias ?? 0);
  }

  // El monto solo se dibuja en la columna de Cortesías si el renglón lo es.
  montoCortesia(renglon: any): number | null {
    return renglon?.esCortesia ? renglon.monto : null;
  }
  // ---------- Impresión ----------

  /**
   * Solo se puede imprimir un cierre ya guardado. Si los números todavía
   * se pueden mover, no debe existir una hoja firmable de ellos.
   */
  puedeImprimir(): boolean {
    return this.estaCerrado();
  }

  imprimir() {
    if (!this.puedeImprimir()) {
      return;
    }
    window.print();
  }

  /** Suma de todos los egresos del día (para el pie de la hoja). */
  totalEgresos(): number {
    return Number(this.corte?.totalEgresos ?? 0);
  }

  /** Lo que entró en efectivo, antes de restar egresos. */
  totalEfectivo(): number {
    return Number(this.corte?.ingresos?.totalEfectivo ?? 0);
  }

  totalNoEfectivo(): number {
    return Number(this.corte?.ingresos?.totalNoEfectivo ?? 0);
  }

  totalIngresos(): number {
    return Number(this.corte?.ingresos?.totalCobrado ?? 0);
  }

  totalComisiones(): number {
    return Number(this.corte?.ingresos?.totalComisiones ?? 0);
  }

  /** Fecha del corte en formato largo para el encabezado impreso. */
  fechaLarga(): string {
    if (!this.fecha) return '';
    const [anio, mes, dia] = this.fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }
  // Diferencia entre lo que se contó a mano y lo que el sistema espera
  diferencia(): number | null {
    if (this.conteoFisico === null || !this.corte) {
      return null;
    }
    return Number(this.conteoFisico) - Number(this.corte.efectivoEnCaja);
  }

  claseDiferencia(): string {
    const dif = this.diferencia();
    if (dif === null) return '';
    if (Math.abs(dif) < 0.01) return 'text-success';
    return 'text-danger';
  }

  textoDiferencia(): string {
    const dif = this.diferencia();
    if (dif === null) return '';
    if (Math.abs(dif) < 0.01) return 'Cuadra exacto';
    if (dif > 0) return 'Sobra dinero en caja';
    return 'Falta dinero en caja';
  }
}