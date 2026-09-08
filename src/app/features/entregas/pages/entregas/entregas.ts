import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Entrega as EntregaService } from '../../../../core/services/entrega';
import { OrdenTrabajo } from '../../../../core/services/orden-trabajo';

@Component({
  selector: 'app-entregas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entregas.html',
  styleUrl: './entregas.css',
})
export class Entregas implements OnInit {
  listaOrdenes: any[] = [];
  idOrdenSeleccionada: number | null = null;

  /** Los alumnos de la O.T. con su saldo y si ya se les entregó. */
  renglones: any[] = [];

  esJefe: boolean = localStorage.getItem('rolUsuario') === 'Jefe';

  criterioBusqueda = '';
  soloPendientes = false;

  cargando = false;
  guardando = false;
  error = '';

  // Modal de entrega
  mostrarModal = false;
  renglonSeleccionado: any = null;
  comentarioEntrega = '';

  constructor(
    private entregaService: EntregaService,
    private ordenService: OrdenTrabajo,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.obtenerOrdenes();
  }

  obtenerOrdenes() {
    this.ordenService.listar().subscribe({
      next: (data) => {
        this.listaOrdenes = data;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'No se pudieron cargar las órdenes de trabajo.';
        this.cdr.detectChanges();
      },
    });
  }

  /** Se dispara al elegir una O.T. del selector. */
  alCambiarOrden() {
    this.renglones = [];
    this.criterioBusqueda = '';
    if (this.idOrdenSeleccionada) {
      this.cargarRenglones();
    }
  }

  cargarRenglones() {
    if (!this.idOrdenSeleccionada) {
      return;
    }

    this.cargando = true;
    this.error = '';

    this.entregaService.listarRenglones(this.idOrdenSeleccionada).subscribe({
      next: (data) => {
        this.renglones = data ?? [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargando = false;
        this.renglones = [];
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo cargar la lista de alumnos.';
        this.cdr.detectChanges();
      },
    });
  }

  // ---------- Filtros de la tabla ----------

  renglonesFiltrados(): any[] {
    const busqueda = this.criterioBusqueda.toLowerCase().trim();

    return this.renglones.filter((r) => {
      if (this.soloPendientes && r.entregado) {
        return false;
      }
      if (!busqueda) {
        return true;
      }
      const nombre = r.contrato?.cliente?.nombreCompleto?.toLowerCase() ?? '';
      const folio = r.contrato?.folio?.toLowerCase() ?? '';
      return nombre.includes(busqueda) || folio.includes(busqueda);
    });
  }

  // ---------- Contadores del encabezado ----------

  totalAlumnos(): number {
    return this.renglones.length;
  }

  totalEntregados(): number {
    return this.renglones.filter((r) => r.entregado).length;
  }

  totalPendientes(): number {
    return this.renglones.filter((r) => !r.entregado && !this.estaCancelado(r)).length;
  }

  totalConAdeudo(): number {
    return this.renglones.filter(
      (r) => r.entregado && Number(r.entrega?.saldoAlEntregar ?? 0) > 0
    ).length;
  }

  // ---------- Estado de cada renglón ----------

  estaCancelado(renglon: any): boolean {
    const estado = renglon?.contrato?.estadoContrato?.nombreEstado ?? '';
    return estado.toLowerCase().includes('cancel');
  }

  debe(renglon: any): boolean {
    return Number(renglon?.resta ?? 0) > 0;
  }

  puedeEntregar(renglon: any): boolean {
    return !renglon.entregado && !this.estaCancelado(renglon);
  }

  // ---------- Modal de entrega ----------

  abrirModal(renglon: any) {
    if (!this.puedeEntregar(renglon)) {
      return;
    }
    this.renglonSeleccionado = renglon;
    this.comentarioEntrega = '';
    this.error = '';
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.renglonSeleccionado = null;
    this.comentarioEntrega = '';
  }

  /** Si el alumno debe, el comentario es obligatorio. */
  puedeConfirmar(): boolean {
    if (!this.renglonSeleccionado || this.guardando) {
      return false;
    }
    if (this.debe(this.renglonSeleccionado) && !this.comentarioEntrega.trim()) {
      return false;
    }
    return true;
  }

  confirmarEntrega() {
    if (!this.puedeConfirmar()) {
      return;
    }

    const idContrato = this.renglonSeleccionado.contrato.idContrato;

    this.guardando = true;
    this.error = '';

    this.entregaService
      .entregar(idContrato, this.comentarioEntrega.trim())
      .subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.cargarRenglones();
        },
        error: (err) => {
          this.guardando = false;
          this.error = err.error && typeof err.error === 'string'
            ? err.error
            : 'No se pudo registrar la entrega.';
          this.cdr.detectChanges();
        },
      });
  }

  /** Solo Jefe: deshace una entrega registrada por error. */
  deshacerEntrega(renglon: any) {
    if (!this.esJefe || !renglon.entrega) {
      return;
    }
    const nombre = renglon.contrato?.cliente?.nombreCompleto ?? 'este alumno';
    if (!confirm(`¿Deshacer la entrega de ${nombre}?`)) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.entregaService.eliminar(renglon.entrega.idEntrega).subscribe({
      next: () => {
        this.guardando = false;
        this.cargarRenglones();
      },
      error: (err) => {
        this.guardando = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo deshacer la entrega.';
        this.cdr.detectChanges();
      },
    });
  }

  // ---------- Apoyo ----------

  formatearOT(ot: any): string {
    if (!ot || !ot.numero || !ot.anio) return 'Adicional';
    return `${ot.numero}/${String(ot.anio).slice(-2)}`;
  }

  trackByRenglon(_indice: number, renglon: any): number {
    return renglon.contrato?.idContrato;
  }
}


//