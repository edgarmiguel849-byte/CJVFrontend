import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Contrato, ModoPantallaContratos } from '../../../../core/services/contrato';
import { FolioNoUtilizadoService } from '../../../../core/services/folio-no-utilizado';
import { EstadoContrato } from '../../../../core/services/estado-contrato';
import { OrdenTrabajo } from '../../../../core/services/orden-trabajo';

@Component({
  selector: 'app-contratos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contratos.html',
  styleUrls: ['./contratos.css'],
})
export class Contratos implements OnInit {
  listaContratos: any[] = [];

  listaEstados: any[] = [];
  listaOrdenes: any[] = [];

  modosPago = ['Efectivo', 'Transferencia', 'Tarjeta', 'Depósito'];

  rolUsuario: string = localStorage.getItem('rolUsuario') ?? '';
  modoPantalla: ModoPantallaContratos | null = null;

  // Cuántos meses después del cierre de ciclo se considera vencido.
  private readonly MESES_PARA_VENCER = 4;

  // ---------- Filtros de la lista ----------
  criterioBusqueda = '';
  filtroDesde = '';
  filtroHasta = '';

  // ---------- Paginación ----------
  paginaActual = 0;
  tamanioPagina = 20;
  totalPaginas = 0;
  totalRegistros = 0;
  opcionesTamanio = [20, 50, 100];

  private temporizadorBusqueda: any = null;

  cargando = false;
  errorModal = '';

  mostrarModal = false;
  editando = false;
  idContratoSeleccionado: number | null = null;

  /**
   * MODO "FOLIO NO UTILIZADO".
   *
   * Un folio del talonario que se echó a perder. Se guarda el número y la
   * fecha, nada más, para que el talonario cuadre y aparezca en ROJO en el
   * reporte de control.
   *
   * NO es un contrato: no va a la tabla 'contrato', va a su propia tabla.
   * Por eso guardarContrato() se desvía a otro servicio cuando esto está
   * prendido; si se guardara como contrato habría que inventarle paquete,
   * estado, total y modo de anticipo, y ese fantasma saldría en la matriz
   * de la O.T. y en el corte del día.
   *
   * Solo aplica al ALTA. Editando no tiene sentido: un contrato que ya
   * existe se usó.
   */
  modoFolioNoUtilizado = false;

  // ===== Cascada para elegir O.T. (Temporada -> Universidad -> Carrera) =====
  // Esta pantalla es EXCLUSIVA de contratos de grupo: siempre llevan O.T.
  // (los adicionales tendrán su propia pantalla).
  filtroTemporada: number | null = null;
  filtroUniversidad: string | null = null;
  filtroCarrera: string | null = null;
  // =========================================================================

  // ===== Buscador rápido de O.T. por número (atajo para quien se los sabe) =
  // Es un ELEVADOR: la cascada de arriba son las escaleras y sigue ahí para
  // quien no se sabe los números. Los dos terminan en lo mismo:
  // nuevoContrato.idOrdenTrabajo.
  busquedaOT = '';
  resultadosOT: any[] = [];
  sinResultadosOT = false;
  // =========================================================================

  nuevoContrato = {
    nombreAlumno: '',
    telefono1: '',
    telefono2: '',
    correo: '',
    idEstadoContrato: null as number | null,
    folio: '',
    idOrdenTrabajo: null as number | null,
    fechaContrato: '',
    total: 0,
    anticipo: 0,
    modoAnticipo: 'Efectivo',
    observaciones: '',
  };

  constructor(
    private contratoService: Contrato,
    private estadoService: EstadoContrato,
    private ordenService: OrdenTrabajo,
    private folioService: FolioNoUtilizadoService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargando = true;

    this.contratoService.obtenerModoPantalla().subscribe({
      next: (modo) => {
        this.modoPantalla = modo;
        this.ajustarPantallaSegunModo();
        this.cdr.detectChanges();
      },
      error: () => {
        alert('No se pudo obtener el modo de la pantalla.');
        this.modoPantalla = {
          modo: 'SIN_ACCESO',
          rol: 'ERROR',
          fechaHoy: '0000-00-00',
          corteHoyTrabado: true,
        };
        this.cdr.detectChanges();
      },
    });

    this.obtenerCatalogos();
  }

  private ajustarPantallaSegunModo() {
    if (this.modoPantalla) {
      switch (this.modoPantalla.modo) {
        case 'SOLO_HOY':
          // Fuerza los filtros de fecha a hoy y los esconde.
          this.filtroDesde = this.modoPantalla.fechaHoy;
          this.filtroHasta = this.modoPantalla.fechaHoy;
          // En este modo sí carga la lista, no en los demás.
          this.obtenerContratos();
          break;
        case 'CORTE_CERRADO':
          // No carga nada, solo muestra un mensaje.
          this.cargando = false;
          break;
        case 'BUSCAR_PRIMERO':
          // Deja la pantalla en blanco lista para búsqueda o filtros.
          this.cargando = false;
          break;
        default:
          // Cualquier otro modo (o error) bloquea todo.
          this.cargando = false;
          break;
      }
    }
  }

  obtenerContratos() {
    this.cargando = true;
    this.contratoService
      .listarPaginado(
        this.paginaActual,
        this.tamanioPagina,
        this.criterioBusqueda,
        this.filtroDesde,
        this.filtroHasta
      )
      .subscribe({
        next: (respuesta) => {
          this.listaContratos = respuesta.content ?? [];
          this.totalPaginas = respuesta.totalPages ?? 0;
          this.totalRegistros = respuesta.totalElements ?? 0;
          this.cargando = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.cargando = false;
          this.listaContratos = [];
          this.totalPaginas = 0;
          this.totalRegistros = 0;
          const mensaje = err.error && typeof err.error === 'string'
            ? err.error
            : 'No se pudieron cargar los contratos.';
          alert(mensaje);
          this.cdr.detectChanges();
        },
      });
  }

  obtenerCatalogos() {
    this.estadoService.listar().subscribe({
      next: (data) => {
        this.listaEstados = (data ?? []).filter(
          (e: any) => e.activo === true || e.activo === 1
        );
      },
    });
    this.ordenService.listar().subscribe({
      next: (data) => (this.listaOrdenes = data ?? []),
    });
  }

  // ===================== ETIQUETA "VENCIDO" =====================
  // OJO: esto NO cambia nada en la base de datos. El contrato sigue
  // siendo "Activo" y se le puede cobrar, entregar y comisionar igual.
  // Es puro letrero informativo para la pantalla.
  //
  // Regla (contratos de GRUPO): pasaron 4 meses desde el CIERRE DE CICLO
  // de su O.T. y el alumno todavía debe dinero.
  // Sin fecha de cierre capturada, no vence nunca.

  /** La fecha desde la que corre el reloj: el cierre de ciclo de la O.T. */
  private fechaInicioVencimiento(item: any): Date | null {
    const texto = item?.contrato?.ordenTrabajo?.fechaCierreCiclo;
    if (!texto) {
      return null;
    }
    const fecha = new Date(String(texto).substring(0, 10) + 'T00:00:00');
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  /** ¿Este contrato ya está vencido? */
  estaVencido(item: any): boolean {
    // Un cancelado no se marca vencido: manda la decisión humana.
    if (this.estaCancelado(item)) {
      return false;
    }

    // Si ya no debe nada, no vence aunque hayan pasado años.
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

  /** El estado tal cual viene de la base contiene "cancel". */
  estaCancelado(item: any): boolean {
    const nombre = item?.contrato?.estadoContrato?.nombreEstado ?? '';
    return nombre.toLowerCase().includes('cancel');
  }

  /** El texto que se pinta en la columna Estado. */
  textoEstado(item: any): string {
    if (this.estaCancelado(item)) {
      return item?.contrato?.estadoContrato?.nombreEstado ?? 'Cancelado';
    }
    if (this.estaVencido(item)) {
      return 'Vencido';
    }
    return item?.contrato?.estadoContrato?.nombreEstado ?? '—';
  }

  /** El color del badge según lo anterior. */
  claseEstado(item: any): string {
    if (this.estaCancelado(item)) {
      return 'bg-danger';
    }
    if (this.estaVencido(item)) {
      return 'bg-warning text-dark';
    }
    return 'bg-success';
  }

  /** Explicación que sale al pasar el mouse encima del badge. */
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
    return (
      'Pasaron ' + this.MESES_PARA_VENCER +
      ' meses del cierre de ciclo (venció el ' +
      limite.toLocaleDateString('es-MX') +
      ') y aún tiene saldo. El contrato sigue funcionando normal.'
    );
  }

  // ===================== BUSCADOR RÁPIDO DE O.T. =====================

  /**
   * Busca O.T. por número. Acepta "50", "50/26", "50/2026" y con espacios.
   *
   * Si solo se teclea el número (sin año), salen TODAS las que tengan ese
   * número en cualquier temporada: por eso se muestra la lista y elige la
   * persona, en vez de adivinar.
   */
  buscarOT() {
    const texto = (this.busquedaOT || '').trim();
    this.resultadosOT = [];
    this.sinResultadosOT = false;

    if (!texto) {
      return;
    }

    // Separa "50/26" en número (50) y año (26). El año es opcional.
    const partes = texto.match(/^(\d+)(?:\s*\/\s*(\d+))?$/);
    if (!partes) {
      this.sinResultadosOT = true;
      return;
    }

    const numero = parseInt(partes[1], 10);
    const anioTexto = partes[2];

    this.resultadosOT = this.listaOrdenes.filter((ot) => {
      if (ot.numero !== numero) {
        return false;
      }
      if (!anioTexto) {
        return true;
      }
      // "26" o "2026" deben servir igual.
      const anioCorto = String(ot.anio).slice(-2);
      return anioTexto === String(ot.anio) || anioTexto === anioCorto;
    });

    this.sinResultadosOT = this.resultadosOT.length === 0;
  }

  /**
   * Al elegir una O.T. de los resultados: se guarda y la cascada de abajo
   * se rellena sola, para que se vea de qué escuela y carrera es.
   */
  seleccionarOT(ot: any) {
    this.nuevoContrato.idOrdenTrabajo = ot.idOrdenTrabajo;
    this.reconstruirCascadaDesdeOT(ot.idOrdenTrabajo);
    this.resultadosOT = [];
    this.sinResultadosOT = false;
    this.busquedaOT = this.formatearOT(ot);
  }

  limpiarBusquedaOT() {
    this.busquedaOT = '';
    this.resultadosOT = [];
    this.sinResultadosOT = false;
  }

  /** Descripción larga de una O.T., para la lista de resultados. */
  descripcionOT(ot: any): string {
    const partes: string[] = [];
    if (ot.escuela) {
      partes.push(ot.escuela);
    }
    if (ot.carreraTexto) {
      partes.push(ot.carreraTexto);
    }
    if (ot.grupo) {
      partes.push('Grupo ' + ot.grupo);
    }
    return partes.length > 0 ? partes.join(' — ') : 'Sin datos capturados';
  }

  /** La O.T. que quedó elegida (para mostrar la confirmación en verde). */
  otSeleccionada(): any | null {
    if (this.nuevoContrato.idOrdenTrabajo == null) {
      return null;
    }
    return this.listaOrdenes.find(
      (o) => o.idOrdenTrabajo === this.nuevoContrato.idOrdenTrabajo
    ) ?? null;
  }

  // ===================== CASCADA DE ORDEN DE TRABAJO =====================

  temporadasDisponibles(): number[] {
    const anios = this.listaOrdenes
      .map((ot) => ot.anio)
      .filter((a) => a != null);
    return Array.from(new Set(anios)).sort((a, b) => b - a);
  }

  universidadesDisponibles(): string[] {
    if (this.filtroTemporada == null) {
      return [];
    }
    const escuelas = this.listaOrdenes
      .filter((ot) => ot.anio === this.filtroTemporada)
      .map((ot) => (ot.escuela ?? '').trim())
      .filter((e) => e !== '');
    return Array.from(new Set(escuelas)).sort();
  }

  carrerasDisponibles(): string[] {
    if (this.filtroTemporada == null || this.filtroUniversidad == null) {
      return [];
    }
    const carreras = this.listaOrdenes
      .filter(
        (ot) =>
          ot.anio === this.filtroTemporada &&
          (ot.escuela ?? '').trim() === this.filtroUniversidad
      )
      .map((ot) => (ot.carreraTexto ?? '').trim())
      .filter((c) => c !== '');
    return Array.from(new Set(carreras)).sort();
  }

  ordenesFiltradas(): any[] {
    if (
      this.filtroTemporada == null ||
      this.filtroUniversidad == null ||
      this.filtroCarrera == null
    ) {
      return [];
    }
    return this.listaOrdenes.filter(
      (ot) =>
        ot.anio === this.filtroTemporada &&
        (ot.escuela ?? '').trim() === this.filtroUniversidad &&
        (ot.carreraTexto ?? '').trim() === this.filtroCarrera
    );
  }

  alCambiarTemporada() {
    this.filtroUniversidad = null;
    this.filtroCarrera = null;
    this.nuevoContrato.idOrdenTrabajo = null;
    this.limpiarBusquedaOT();
  }

  alCambiarUniversidad() {
    this.filtroCarrera = null;
    this.nuevoContrato.idOrdenTrabajo = null;
    this.limpiarBusquedaOT();
  }

  alCambiarCarrera() {
    this.nuevoContrato.idOrdenTrabajo = null;
    this.limpiarBusquedaOT();
  }

  // Al editar un contrato, deja la cascada mostrando la O.T. que ya tiene.
  private reconstruirCascadaDesdeOT(idOrdenTrabajo: number | null) {
    this.filtroTemporada = null;
    this.filtroUniversidad = null;
    this.filtroCarrera = null;

    if (idOrdenTrabajo == null) {
      return;
    }
    const ot = this.listaOrdenes.find((o) => o.idOrdenTrabajo === idOrdenTrabajo);
    if (ot) {
      this.filtroTemporada = ot.anio ?? null;
      this.filtroUniversidad = (ot.escuela ?? '').trim() || null;
      this.filtroCarrera = (ot.carreraTexto ?? '').trim() || null;
    }
  }

  // =====================================================================

  alEscribirBusqueda() {
    clearTimeout(this.temporizadorBusqueda);
    this.temporizadorBusqueda = setTimeout(() => {
      this.paginaActual = 0;
      this.obtenerContratos();
    }, 400);
  }

  aplicarFiltros() {
    this.paginaActual = 0;
    this.obtenerContratos();
  }

  limpiarFiltros() {
    this.criterioBusqueda = '';
    this.filtroDesde = '';
    this.filtroHasta = '';
    this.paginaActual = 0;
    this.obtenerContratos();
  }

  hayFiltrosActivos(): boolean {
    return !!(this.criterioBusqueda || this.filtroDesde || this.filtroHasta);
  }

  irAPagina(pagina: number) {
    if (pagina < 0 || pagina >= this.totalPaginas || pagina === this.paginaActual) {
      return;
    }
    this.paginaActual = pagina;
    this.obtenerContratos();
  }

  paginaAnterior() {
    this.irAPagina(this.paginaActual - 1);
  }

  paginaSiguiente() {
    this.irAPagina(this.paginaActual + 1);
  }

  cambiarTamanio() {
    this.paginaActual = 0;
    this.obtenerContratos();
  }

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

  textoRango(): string {
    if (this.totalRegistros === 0) {
      return 'Sin resultados';
    }
    const primero = this.paginaActual * this.tamanioPagina + 1;
    const ultimo = primero + this.listaContratos.length - 1;
    return `Mostrando ${primero}–${ultimo} de ${this.totalRegistros}`;
  }

  trackByContrato(_indice: number, item: any): number {
    return item.contrato?.idContrato;
  }

  formatearOT(ot: any): string {
    if (!ot || !ot.numero || !ot.anio) return '—';
    return `${ot.numero}/${String(ot.anio).slice(-2)}`;
  }

  etiquetaOT(ot: any): string {
    const numAnio = `${ot.numero}/${String(ot.anio).slice(-2)}`;
    const grupo = ot.grupo ? ` — Grupo ${ot.grupo}` : '';
    return `${numAnio}${grupo}`;
  }

  // === Quién puede editar/eliminar un contrato (esconder o mostrar botones). ===
  // Jefe y Administrador: SIEMPRE, aunque el día ya tenga corte cerrado.
  // Mostrador: solo si el día NO está trabado (diaConCorte = día trabado; un
  //            corte REABIERTO ya no traba).
  // Esto es SOLO para mostrar/ocultar botones: el candado de verdad vive en el
  // backend (ContratoService.verificarPermisoModificar), que aplica la misma
  // regla aunque alguien se salte la pantalla.
  puedeModificar(item: any): boolean {
    if (this.rolUsuario === 'Jefe' || this.rolUsuario === 'Administrador') {
      return true;
    }
    return !item?.diaConCorte;
  }

  /**
   * La fecha de HOY en hora LOCAL.
   *
   * OJO: aquí NO se puede usar new Date().toISOString(), que era lo que
   * había. Ese método devuelve UTC, y en México (UTC-6) a partir de las
   * 6 de la tarde ya es el día siguiente. Un contrato capturado a las
   * 7 PM nacía con fecha de MAÑANA: su anticipo se iba al corte del día
   * equivocado y a otro periodo de comisiones.
   */
  private fechaDeHoy(): string {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  /**
   * Prende o apaga el modo de folio no utilizado.
   *
   * Se limpia todo lo demás: si alguien llenó medio formulario y luego
   * palomea la casilla, esos datos ya no se van a mandar y dejarlos
   * escondidos daría la impresión de que sí se guardaron.
   */
  alCambiarModoFolio() {
    this.errorModal = '';
    if (this.modoFolioNoUtilizado) {
      this.nuevoContrato.nombreAlumno = '';
      this.nuevoContrato.telefono1 = '';
      this.nuevoContrato.telefono2 = '';
      this.nuevoContrato.correo = '';
      this.nuevoContrato.idEstadoContrato = null;
      this.nuevoContrato.idOrdenTrabajo = null;
      this.nuevoContrato.total = 0;
      this.nuevoContrato.anticipo = 0;
      this.nuevoContrato.observaciones = '';
      this.filtroTemporada = null;
      this.filtroUniversidad = null;
      this.filtroCarrera = null;
      this.limpiarBusquedaOT();
    }
  }

  abrirFormulario() {
    this.editando = false;
    this.idContratoSeleccionado = null;
    this.errorModal = '';
    this.modoFolioNoUtilizado = false;
    this.filtroTemporada = null;
    this.filtroUniversidad = null;
    this.filtroCarrera = null;
    this.limpiarBusquedaOT();
    this.nuevoContrato = {
      nombreAlumno: '',
      telefono1: '',
      telefono2: '',
      correo: '',
      idEstadoContrato: null,
      folio: '',
      idOrdenTrabajo: null,
      fechaContrato: this.fechaDeHoy(),
      total: 0,
      anticipo: 0,
      modoAnticipo: 'Efectivo',
      observaciones: '',
    };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idContratoSeleccionado = null;
    this.errorModal = '';
    this.modoFolioNoUtilizado = false;
    this.limpiarBusquedaOT();
  }

  /**
   * Guarda un folio no utilizado. Solo viajan folio y fecha.
   *
   * El servidor valida lo importante: formato, que no esté ya marcado, y
   * que no exista como contrato real. Ese último es el que impide que un
   * mismo folio salga verde y rojo al mismo tiempo en el reporte.
   */
  private guardarFolioNoUtilizado() {
    const c = this.nuevoContrato;

    if (!c.folio || !c.folio.trim()) {
      this.errorModal = 'El folio es obligatorio.';
      return;
    }
    if (!c.fechaContrato) {
      this.errorModal = 'La fecha es obligatoria.';
      return;
    }

    this.folioService
      .registrar('CONTRATO', c.folio.trim().toUpperCase(), c.fechaContrato)
      .subscribe({
        next: () => {
          this.cerrarModal();
          this.paginaActual = 0;
          this.obtenerContratos();
        },
        error: (err) => {
          this.errorModal =
            err?.error && typeof err.error === 'string'
              ? err.error
              : 'No se pudo registrar el folio. Revisa la consola.';
          this.cdr.detectChanges();
        },
      });
  }

  guardarContrato() {
    const c = this.nuevoContrato;
    this.errorModal = '';

    // Se desvía ANTES de cualquier validación de contrato: un folio no
    // utilizado no tiene alumno, ni estado, ni O.T., y exigírselos lo
    // detendría con un mensaje que no aplica.
    if (this.modoFolioNoUtilizado) {
      this.guardarFolioNoUtilizado();
      return;
    }

    if (!c.nombreAlumno || !c.nombreAlumno.trim()) {
      this.errorModal = 'El nombre del alumno es obligatorio.';
      return;
    }
    if (!c.idEstadoContrato) {
      this.errorModal = 'El estado es obligatorio.';
      return;
    }
    if (!c.fechaContrato) {
      this.errorModal = 'Selecciona la fecha del contrato.';
      return;
    }
    // La O.T. es obligatoria: esta pantalla es solo de contratos de grupo.
    if (!c.idOrdenTrabajo) {
      this.errorModal = 'Elige la Orden de Trabajo del grupo.';
      return;
    }

    const contratoParaEnviar: any = {
      nombreAlumno: c.nombreAlumno.trim(),
      telefono1: c.telefono1 || null,
      telefono2: c.telefono2 || null,
      correo: c.correo || null,
      // 'Ad:' es exclusivo de adicionales; los contratos de grupo van sin él.
      ad: null,
      estadoContrato: { idEstadoContrato: c.idEstadoContrato },
      folio: c.folio || null,
      ordenTrabajo: { idOrdenTrabajo: c.idOrdenTrabajo },
      fechaContrato: c.fechaContrato,
      total: c.total,
      anticipo: c.anticipo,
      modoAnticipo: c.modoAnticipo,
      observaciones: c.observaciones,
      activo: true,
    };

    if (this.editando && this.idContratoSeleccionado) {
      this.contratoService.actualizar(this.idContratoSeleccionado, contratoParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerContratos();
        },
        error: (err) => {
          this.errorModal = err?.error || 'Error al actualizar el contrato.';
          this.cdr.detectChanges();
        },
      });
    } else {
      this.contratoService.crear(contratoParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.paginaActual = 0;
          this.obtenerContratos();
        },
        error: (err) => {
          this.errorModal = err?.error || 'Error al registrar el contrato.';
          this.cdr.detectChanges();
        },
      });
    }
  }

  prepararEdicion(item: any) {
    const contrato = item.contrato;
    this.editando = true;
    this.modoFolioNoUtilizado = false;
    this.idContratoSeleccionado = contrato.idContrato;
    this.errorModal = '';
    this.limpiarBusquedaOT();
    this.nuevoContrato = {
      nombreAlumno: contrato.nombreAlumno ?? '',
      telefono1: contrato.telefono1 ?? '',
      telefono2: contrato.telefono2 ?? '',
      correo: contrato.correo ?? '',
      idEstadoContrato: contrato.estadoContrato?.idEstadoContrato ?? null,
      folio: contrato.folio ?? '',
      idOrdenTrabajo: contrato.ordenTrabajo?.idOrdenTrabajo ?? null,
      fechaContrato: String(contrato.fechaContrato ?? '').substring(0, 10),
      total: contrato.total ?? 0,
      anticipo: contrato.anticipo ?? 0,
      modoAnticipo: contrato.modoAnticipo ?? 'Efectivo',
      observaciones: contrato.observaciones ?? '',
    };
    this.reconstruirCascadaDesdeOT(this.nuevoContrato.idOrdenTrabajo);
    this.mostrarModal = true;
  }

  eliminarContrato(id: number) {
    if (confirm('¿Estás seguro de eliminar este contrato?')) {
      this.contratoService.eliminar(id).subscribe({
        next: () => {
          if (this.listaContratos.length === 1 && this.paginaActual > 0) {
            this.paginaActual--;
          }
          this.obtenerContratos();
        },
        error: (err) => alert(err?.error || 'No se pudo eliminar el contrato.'),
      });
    }
  }
}