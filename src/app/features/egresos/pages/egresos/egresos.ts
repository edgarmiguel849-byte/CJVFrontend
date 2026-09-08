import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Egreso, ModoPantallaEgresos } from '../../../../core/services/egreso';

@Component({
  selector: 'app-egresos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './egresos.html',
  styleUrl: './egresos.css',
})
export class Egresos implements OnInit {
  // Solo los egresos de la página actual (ya vienen filtrados y ordenados del backend)
  listaEgresos: any[] = [];

  esJefe: boolean = localStorage.getItem('rolUsuario') === 'Jefe';

  // ---------- Modo de pantalla (lo decide el SERVIDOR) ----------
  //
  // Esto es SOLO para pintar. Los candados de verdad viven en
  // EgresoService: aunque alguien cambie estas variables desde la consola
  // del navegador, la lista sigue llegando vacía y el guardado rebota.
  modo: string = '';
  fechaHoy: string = '';
  corteHoyTrabado = false;
  cargandoModo = true;

  // ---------- Filtros ----------
  criterioBusqueda = '';
  filtroDesde = '';
  filtroHasta = '';

  // ---------- Paginación ----------
  paginaActual = 0;          // el backend cuenta desde 0
  tamanioPagina = 20;
  totalPaginas = 0;
  totalRegistros = 0;
  opcionesTamanio = [20, 50, 100];

  // Suma de TODOS los egresos que cumplen el filtro (la calcula el backend)
  totalMonto = 0;

  // Temporizador para no lanzar una consulta por cada tecla
  private temporizadorBusqueda: any = null;

  cargando = false;
  guardando = false;

  mostrarModal = false;
  editando = false;
  idEgresoSeleccionado: number | null = null;

  nuevoEgreso = {
    concepto: '',
    monto: 0,
    fechaEgreso: '',
    comentarios: '',
  };

  constructor(
    private egresoService: Egreso,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.obtenerModoPantalla();
  }

  /**
   * Primero se pregunta CÓMO arrancar y hasta después se piden los datos.
   *
   * Importa el orden: si se cargaran los egresos antes de saber el modo,
   * a Mostrador con el corte cerrado le parpadearía la lista un instante
   * antes de esconderse.
   */
  obtenerModoPantalla() {
    this.cargandoModo = true;
    this.egresoService.obtenerModoPantalla().subscribe({
      next: (m: ModoPantallaEgresos) => {
        this.modo = m?.modo ?? '';
        this.fechaHoy = m?.fechaHoy ?? '';
        this.corteHoyTrabado = m?.corteHoyTrabado ?? false;
        this.cargandoModo = false;

        // Con el corte entregado o sin rol reconocido no hay nada que pedir.
        if (this.esModoCorteCerrado() || this.esModoSinAcceso()) {
          this.listaEgresos = [];
          this.totalRegistros = 0;
          this.totalPaginas = 0;
          this.cdr.detectChanges();
          return;
        }

        this.obtenerEgresos();
      },
      error: () => {
        // Si esto falla no se adivina un modo permisivo: se deja sin
        // acceso. Es preferible una pantalla vacía a una que muestre de
        // más porque el servidor no contestó.
        this.modo = 'SIN_ACCESO';
        this.cargandoModo = false;
        this.listaEgresos = [];
        this.cdr.detectChanges();
      },
    });
  }

  esModoSoloHoy(): boolean {
    return this.modo === 'SOLO_HOY';
  }

  esModoCorteCerrado(): boolean {
    return this.modo === 'CORTE_CERRADO';
  }

  esModoBuscarPrimero(): boolean {
    return this.modo === 'BUSCAR_PRIMERO';
  }

  esModoSinAcceso(): boolean {
    return this.modo === 'SIN_ACCESO';
  }

  /** ¿Se pinta el botón de Nuevo Egreso? */
  puedeRegistrar(): boolean {
    return !this.esModoCorteCerrado() && !this.esModoSinAcceso();
  }

  /**
   * En SOLO_HOY las cajitas de Desde/Hasta no sirven de nada: el servidor
   * le pisa las fechas a hoy pase lo que pase. Se esconden para que nadie
   * teclee un rango y crea que no funcionó.
   */
  puedeFiltrarPorFecha(): boolean {
    return !this.esModoSoloHoy();
  }

  @HostListener('document:keydown.escape')
  cerrarConEscape() {
    if (this.mostrarModal) {
      this.cerrarModal();
    }
  }

  /**
   * Trae SOLO la página actual desde el backend, ya filtrada y ordenada.
   * La respuesta viene envuelta: { pagina: {...}, totalMonto: 0 }
   */
  obtenerEgresos() {
    this.cargando = true;
    this.egresoService
      .listarPaginado(
        this.paginaActual,
        this.tamanioPagina,
        this.criterioBusqueda,
        this.filtroDesde,
        this.filtroHasta
      )
      .subscribe({
        next: (respuesta) => {
          const pagina = respuesta.pagina ?? {};
          this.listaEgresos = pagina.content ?? [];
          this.totalPaginas = pagina.totalPages ?? 0;
          this.totalRegistros = pagina.totalElements ?? 0;
          this.totalMonto = Number(respuesta.totalMonto ?? 0);
          this.cargando = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.cargando = false;
          this.listaEgresos = [];
          this.totalPaginas = 0;
          this.totalRegistros = 0;
          this.totalMonto = 0;
          const mensaje = err.error && typeof err.error === 'string'
            ? err.error
            : 'No se pudieron cargar los egresos.';
          alert(mensaje);
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Se dispara al escribir en el buscador. Espera 400 ms sin teclear
   * antes de consultar, para no mandar una petición por cada letra.
   */
  alEscribirBusqueda() {
    clearTimeout(this.temporizadorBusqueda);
    this.temporizadorBusqueda = setTimeout(() => {
      this.paginaActual = 0;
      this.obtenerEgresos();
    }, 400);
  }

  // Se dispara al cambiar cualquiera de las dos fechas
  aplicarFiltros() {
    this.paginaActual = 0;
    this.obtenerEgresos();
  }

  limpiarFiltros() {
    this.criterioBusqueda = '';
    this.filtroDesde = '';
    this.filtroHasta = '';
    this.paginaActual = 0;
    this.obtenerEgresos();
  }

  hayFiltrosActivos(): boolean {
    return !!(this.criterioBusqueda || this.filtroDesde || this.filtroHasta);
  }

  // ---------- Navegación entre páginas ----------

  irAPagina(pagina: number) {
    if (pagina < 0 || pagina >= this.totalPaginas || pagina === this.paginaActual) {
      return;
    }
    this.paginaActual = pagina;
    this.obtenerEgresos();
  }

  paginaAnterior() {
    this.irAPagina(this.paginaActual - 1);
  }

  paginaSiguiente() {
    this.irAPagina(this.paginaActual + 1);
  }

  cambiarTamanio() {
    // Al cambiar cuántos se ven por página, volvemos a la primera
    this.paginaActual = 0;
    this.obtenerEgresos();
  }

  /**
   * Devuelve los números de página a dibujar como botones.
   * Muestra máximo 5 alrededor de la actual.
   */
  paginasVisibles(): number[] {
    const maximo = 5;
    if (this.totalPaginas <= maximo) {
      return Array.from({ length: this.totalPaginas }, (_, i) => i);
    }

    let inicio = this.paginaActual - 2;
    if (inicio < 0) {
      inicio = 0;
    }
    if (inicio + maximo > this.totalPaginas) {
      inicio = this.totalPaginas - maximo;
    }

    return Array.from({ length: maximo }, (_, i) => inicio + i);
  }

  // Texto tipo "Mostrando 21–40 de 96"
  textoRango(): string {
    if (this.totalRegistros === 0) {
      return 'Sin resultados';
    }
    const primero = this.paginaActual * this.tamanioPagina + 1;
    const ultimo = primero + this.listaEgresos.length - 1;
    return `Mostrando ${primero}–${ultimo} de ${this.totalRegistros}`;
  }

  trackByEgreso(_indice: number, egreso: any): number {
    return egreso.idEgreso;
  }

  formularioValido(): boolean {
    const e = this.nuevoEgreso;
    return !!e.concepto.trim() && !!e.fechaEgreso && e.monto > 0;
  }

  /**
   * La fecha de HOY para un egreso nuevo.
   *
   * Se prefiere la que mandó el SERVIDOR (viene en el modo de pantalla),
   * porque es la misma con la que el servidor decide si el día está
   * trabado y la misma con la que arma el corte. Si el reloj de la
   * computadora del mostrador está mal, aquí no importa.
   *
   * Si por lo que sea no llegó, se calcula en hora LOCAL a mano.
   */
  private fechaDeHoy(): string {
    if (this.fechaHoy) {
      return this.fechaHoy.substring(0, 10);
    }

    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  /**
   * Mostrador captura siempre con fecha de hoy: es lo único que ve y es
   * el día del que va a entregar el corte.
   *
   * Para volverlo libre: que este método devuelva siempre false.
   */
  fechaEgresoBloqueada(): boolean {
    return this.esModoSoloHoy();
  }

  abrirFormulario() {
    this.editando = false;
    this.idEgresoSeleccionado = null;
    this.nuevoEgreso = {
      concepto: '',
      monto: 0,
      fechaEgreso: this.fechaDeHoy(),
      comentarios: '',
    };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idEgresoSeleccionado = null;
  }

  guardarEgreso() {
    const e = this.nuevoEgreso;

    if (!e.concepto.trim()) {
      alert('El concepto es obligatorio.');
      return;
    }
    if (!e.fechaEgreso) {
      alert('Selecciona la fecha del egreso.');
      return;
    }
    if (!e.monto || e.monto <= 0) {
      alert('El monto debe ser mayor a cero.');
      return;
    }

    const egresoParaEnviar = {
      concepto: e.concepto.trim(),
      monto: e.monto,
      // En SOLO_HOY la fecha se vuelve a forzar aquí, no solo en el campo
      // bloqueado: un campo deshabilitado se destraba desde el inspector
      // del navegador en dos clics.
      fechaEgreso: this.fechaEgresoBloqueada() ? this.fechaDeHoy() : e.fechaEgreso,
      comentarios: (e.comentarios || '').trim() || null,
      activo: true,
    };

    this.guardando = true;

    if (this.editando && this.idEgresoSeleccionado) {
      this.egresoService.actualizar(this.idEgresoSeleccionado, egresoParaEnviar).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.obtenerEgresos();
        },
        error: (err) => {
          this.guardando = false;
          const mensaje = err.error && typeof err.error === 'string'
            ? err.error
            : 'Error al actualizar el egreso.';
          alert(mensaje);
        },
      });
    } else {
      this.egresoService.crear(egresoParaEnviar).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          // Un egreso nuevo es el más reciente: se ve en la primera página.
          this.paginaActual = 0;
          this.obtenerEgresos();
        },
        error: (err) => {
          this.guardando = false;
          const mensaje = err.error && typeof err.error === 'string'
            ? err.error
            : 'Error al registrar el egreso.';
          alert(mensaje);
        },
      });
    }
  }

  prepararEdicion(egreso: any) {
    this.editando = true;
    this.idEgresoSeleccionado = egreso.idEgreso;
    this.nuevoEgreso = {
      concepto: egreso.concepto ?? '',
      monto: egreso.monto ?? 0,
      fechaEgreso: String(egreso.fechaEgreso ?? '').substring(0, 10),
      comentarios: egreso.comentarios ?? '',
    };
    this.mostrarModal = true;
  }

  eliminarEgreso(id: number) {
    if (confirm('¿Estás seguro de eliminar este egreso?')) {
      this.egresoService.eliminar(id).subscribe({
        next: () => {
          // Si era el último de la página, retroceder una
          if (this.listaEgresos.length === 1 && this.paginaActual > 0) {
            this.paginaActual--;
          }
          this.obtenerEgresos();
        },
        error: () => alert('No se pudo eliminar el egreso.'),
      });
    }
  }
}