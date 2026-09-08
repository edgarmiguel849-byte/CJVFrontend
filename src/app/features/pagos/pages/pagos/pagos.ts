import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Pago } from '../../../../core/services/pago';
import { Contrato, ModoPantallaContratos } from '../../../../core/services/contrato';
import { OrdenTrabajo } from '../../../../core/services/orden-trabajo';
import { FolioNoUtilizadoService } from '../../../../core/services/folio-no-utilizado';

@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pagos.html',
  styleUrl: './pagos.css',
})
export class Pagos implements OnInit {
  // Solo los pagos de la página actual (ya vienen filtrados del backend)
  listaPagos: any[] = [];

  listaContratos: any[] = [];

  /**
   * Las O.T. que existen. Se piden COMPLETAS al servidor.
   *
   * Antes se deducían de los propios contratos, pero eso escondía las O.T.
   * recién abiertas: una orden existe desde antes que cualquier contrato,
   * y es justo el día en que hay que cobrar sin contrato.
   *
   * OJO: el endpoint devuelve solo las O.T. ACTIVAS. Una O.T. borrada
   * (lógico) ya no se puede buscar por número, aunque sus pagos viejos
   * se siguen editando sin problema: ahí la O.T. sale del propio contrato.
   */
  listaOrdenes: any[] = [];

  /** Años que tienen contratos adicionales, para la búsqueda tipo "0/26". */
  aniosAdicionales: number[] = [];

  esJefe: boolean = localStorage.getItem('rolUsuario') === 'Jefe';

  // Rol tal como lo guarda el login: "Jefe" / "Administrador" / "Mostrador".
  rolUsuario: string = localStorage.getItem('rolUsuario') ?? '';

  /**
   * En qué modo arranca la pantalla. Lo decide el SERVIDOR, no el navegador.
   * Es el mismo semáforo que ya usan Contratos y Adicionales.
   */
  modoPantalla: ModoPantallaContratos | null = null;

  modosPago = ['Efectivo', 'Transferencia', 'Tarjeta', 'Depósito', 'Cortesía'];

  // Abono = entra dinero. Devolución = sale dinero (RN-11).
  tiposMovimiento = ['Abono', 'Devolución'];

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

  // Temporizador para no lanzar una consulta por cada tecla
  private temporizadorBusqueda: any = null;

  cargando = false;
  guardando = false;

  mostrarModal = false;
  editando = false;
  idPagoSeleccionado: number | null = null;

  /**
   * Marca "a Oficina" que traía el pago al abrir la edición.
   * Sirve para saber si el usuario la cambió y avisarle antes de guardar.
   */
  private marcaOriginal = false;

  // ===================== BUSCADOR DEL MODAL (dos pasos) =====================
  //
  // PASO 1 (casilla de arriba): busca en TODAS las O.T. por número y te obliga
  //        a elegir una. Si no encuentra, es que se tecleó mal.
  // PASO 2 (casilla de abajo): NO busca, FILTRA a los alumnos de esa O.T.
  //        Si no encuentra, no es error: significa que a esa persona hay que
  //        cobrarle sin contrato.

  busquedaOT = '';
  resultadosOT: any[] = [];
  sinResultadosOT = false;

  /** La O.T. elegida. Puede ser una real o la "O.T. cero" de adicionales. */
  otElegida: any = null;

  busquedaAlumno = '';
  /** Todos los contratos de la O.T. elegida. */
  contratosDeLaOT: any[] = [];
  /** Los que sobreviven al filtro del nombre. */
  resultadosAlumno: any[] = [];
  /** El contrato finalmente elegido. */
  contratoElegido: any = null;

  // ============ CASCADA: Temporada -> Universidad -> Carrera -> O.T. ============
  //
  // El camino para quien NO se sabe los números. Es el mismo patrón que ya
  // está probado en la pantalla de Contratos.
  //
  // Trabaja INDEPENDIENTE de la casilla del número: son dos escaleras que
  // llegan al mismo piso. No se estorban porque las dos desaparecen en
  // cuanto hay O.T. elegida, y en su lugar queda la caja verde con
  // "Cambiar".
  //
  // Solo sirve para O.T. de GRUPO. Los adicionales (0/26) no son O.T. y no
  // tienen escuela ni carrera de dónde colgarse: esos van tecleando el
  // número, arriba.

  filtroTemporada: number | null = null;
  filtroUniversidad: string | null = null;
  filtroCarrera: string | null = null;

  // ===================== COBRO SIN CONTRATO =====================
  //
  // Renta de toga y parecidos: alguien del grupo que no compró paquete pero
  // paga por salir en la foto. No hay contrato de dónde colgar el pago, así
  // que el servidor levanta uno invisible (sin folio, con nombre) pegado a
  // la O.T. y le cuelga el cobro encima, todo en un solo movimiento.

  /** True cuando el modal se convirtió en el formulario de cobro sin contrato. */
  modoSinContrato = false;

  /** Nombre de la persona a la que se le cobra. Sin folio, es obligatorio. */
  nombreSinContrato = '';

  // ===================== FOLIO NO UTILIZADO =====================
  //
  // Un recibo del talonario que se echó a perder. Se guarda el folio y la
  // fecha, nada más, y sale en ROJO en el reporte de control de recibos.
  //
  // NO es un pago: va a su propia tabla. Un pago exige contrato padre,
  // monto y tipo de movimiento; meterlo en 'pago' obligaría a inventarlos
  // y ese fantasma aparecería en el corte del día y en las comisiones.
  //
  // NUNCA convive con el cobro sin contrato: aquel SÍ cobra dinero, este
  // no cobra nada. Los dos se apagan entre sí.

  /** True cuando el modal se convirtió en el formulario de folio muerto. */
  modoFolioNoUtilizado = false;

  nuevoPago = {
    idContrato: null as number | null,
    folio: '',
    fechaPago: '',
    montoPago: 0,
    modoPago: 'Efectivo',
    tipoMovimiento: 'Abono',
    comisionOficina: false,
    comentarios: '',
  };

  constructor(
    private pagoService: Pago,
    private contratoService: Contrato,
    private ordenTrabajoService: OrdenTrabajo,
    private folioService: FolioNoUtilizadoService,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * La fecha de HOY en hora LOCAL.
   *
   * OJO: aquí NO sirve new Date().toISOString(). Devuelve UTC, y en México
   * (UTC-6) a partir de las 6 de la tarde ya es el día siguiente. Un pago
   * capturado a las 7 PM nacía con fecha de MAÑANA: no entraba al corte de
   * hoy y caía en otro periodo de comisiones.
   */
  private fechaDeHoy(): string {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  ngOnInit() {
    this.cargando = true;

    // Primero se pregunta QUÉ PUEDE VER este usuario, y hasta entonces
    // se decide si vale la pena ir por los pagos.
    this.contratoService.obtenerModoPantalla().subscribe({
      next: (modo) => {
        this.modoPantalla = modo;
        this.ajustarPantallaSegunModo();
        this.cdr.detectChanges();
      },
      error: () => {
        // Si no se pudo preguntar, se asume lo más restrictivo.
        alert('No se pudo obtener el modo de la pantalla.');
        this.modoPantalla = {
          modo: 'SIN_ACCESO',
          rol: 'ERROR',
          fechaHoy: '0000-00-00',
          corteHoyTrabado: true,
        };
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });

    this.obtenerCatalogos();
  }

  /**
   * Acomoda la pantalla según el semáforo que mandó el servidor.
   *
   * SOLO_HOY       -> Mostrador con el día abierto: fechas clavadas en hoy.
   * CORTE_CERRADO  -> Mostrador con el corte entregado: no carga nada.
   * BUSCAR_PRIMERO -> Jefe/Admin: pantalla en blanco hasta que busquen.
   * SIN_ACCESO     -> rol desconocido: no carga nada.
   */
  private ajustarPantallaSegunModo() {
    if (!this.modoPantalla) {
      return;
    }

    switch (this.modoPantalla.modo) {
      case 'SOLO_HOY':
        this.filtroDesde = this.modoPantalla.fechaHoy;
        this.filtroHasta = this.modoPantalla.fechaHoy;
        this.obtenerPagos();
        break;

      case 'CORTE_CERRADO':
      case 'BUSCAR_PRIMERO':
      default:
        this.cargando = false;
        break;
    }
  }

  /** ¿La pantalla está completamente bloqueada para este usuario? */
  pantallaBloqueada(): boolean {
    const modo = this.modoPantalla?.modo;
    return modo === 'CORTE_CERRADO' || modo === 'SIN_ACCESO';
  }

  /** ¿A este usuario se le clavaron las fechas en hoy? */
  soloHoy(): boolean {
    return this.modoPantalla?.modo === 'SOLO_HOY';
  }

  /**
   * Quién puede editar o eliminar un pago (esconder o mostrar botones).
   * Jefe y Administrador: siempre.
   * Mostrador: solo mientras el corte de hoy siga abierto. Como en su modo
   * únicamente ve los pagos de hoy, con revisar el corte de hoy basta.
   *
   * Esto es SOLO la cortina. El candado de verdad vive en PagoService.
   */
  puedeModificar(_pago?: any): boolean {
    if (this.rolUsuario === 'Jefe' || this.rolUsuario === 'Administrador') {
      return true;
    }
    if (this.modoPantalla?.modo !== 'SOLO_HOY') {
      return false;
    }
    return !this.modoPantalla?.corteHoyTrabado;
  }

  /**
   * Trae SOLO la página actual desde el backend, ya filtrada.
   * La respuesta trae los registros más el conteo total.
   */
  obtenerPagos() {
    // Bloqueados: ni siquiera se le pregunta al servidor.
    if (this.pantallaBloqueada()) {
      this.listaPagos = [];
      this.totalPaginas = 0;
      this.totalRegistros = 0;
      this.cargando = false;
      this.cdr.detectChanges();
      return;
    }

    // Jefe/Admin sin ningún filtro: pantalla en blanco a propósito.
    if (this.modoPantalla?.modo === 'BUSCAR_PRIMERO' && !this.hayFiltrosActivos()) {
      this.listaPagos = [];
      this.totalPaginas = 0;
      this.totalRegistros = 0;
      this.cargando = false;
      this.cdr.detectChanges();
      return;
    }

    // Mostrador: se le vuelven a clavar las fechas en hoy antes de cada
    // consulta, por si algo las movió.
    if (this.soloHoy() && this.modoPantalla) {
      this.filtroDesde = this.modoPantalla.fechaHoy;
      this.filtroHasta = this.modoPantalla.fechaHoy;
    }

    this.cargando = true;
    this.pagoService
      .listarPaginado(
        this.paginaActual,
        this.tamanioPagina,
        this.criterioBusqueda,
        this.filtroDesde,
        this.filtroHasta
      )
      .subscribe({
        next: (respuesta) => {
          this.listaPagos = respuesta.content ?? [];
          this.totalPaginas = respuesta.totalPages ?? 0;
          this.totalRegistros = respuesta.totalElements ?? 0;
          this.cargando = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.cargando = false;
          this.listaPagos = [];
          this.totalPaginas = 0;
          this.totalRegistros = 0;
          const mensaje = err.error && typeof err.error === 'string'
            ? err.error
            : 'No se pudieron cargar los pagos.';
          alert(mensaje);
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Carga lo que necesita el buscador del modal.
   *
   * Son DOS llamadas independientes a propósito:
   *   - Las O.T. vienen del servidor, completas. Así aparece también la
   *     orden recién abierta que todavía no tiene ni un contrato.
   *   - Los contratos siguen viniendo enteros porque de ellos salen los
   *     alumnos de cada O.T. y los años del cajón "0/26".
   *
   * Si una falla, la otra sigue: es mejor un buscador a medias que un
   * modal que no abre.
   */
  obtenerCatalogos() {
    this.ordenTrabajoService.listar().subscribe({
      next: (data) => {
        this.listaOrdenes = data ?? [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.listaOrdenes = [];
        this.cdr.detectChanges();
      },
    });

    this.contratoService.listar().subscribe({
      next: (data) => {
        this.listaContratos = data ?? [];
        this.construirAniosAdicionales();
        this.cdr.detectChanges();
      },
      error: () => {
        this.listaContratos = [];
        this.construirAniosAdicionales();
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Arma los años que tienen contratos adicionales, para la búsqueda "0/26".
   *
   * Un adicional es un contrato SIN O.T., así que estos años no se pueden
   * pedir al endpoint de órdenes: hay que sacarlos de los propios contratos.
   */
  private construirAniosAdicionales() {
    const anios = new Set<number>();

    for (const contrato of this.listaContratos) {
      if (contrato?.ordenTrabajo?.idOrdenTrabajo) {
        continue; // tiene O.T.: no es adicional
      }
      if (!contrato?.fechaContrato) {
        continue;
      }
      const anio = Number(String(contrato.fechaContrato).substring(0, 4));
      if (!isNaN(anio)) {
        anios.add(anio);
      }
    }

    this.aniosAdicionales = Array.from(anios).sort((a, b) => b - a);
  }

  // ===================== PASO 1: LA O.T. =====================

  /**
   * Busca O.T. por número. Acepta "50", "50/26" y "50/2026".
   *
   * El número CERO es especial: "0/26" no es una O.T. de verdad, es el
   * cajón de los contratos adicionales de ese año — el mismo "0/26" de la
   * matriz amarilla. Se trata como una O.T. más para que quien captura no
   * tenga que aprender dos formas de buscar.
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

    // ---- "0/26": los adicionales de ese año ----
    if (numero === 0) {
      this.resultadosOT = this.aniosAdicionales
        .filter((anio) => this.coincideAnio(anio, anioTexto))
        .map((anio) => ({ esAdicionales: true, numero: 0, anio }));
      this.sinResultadosOT = this.resultadosOT.length === 0;
      return;
    }

    // ---- Una O.T. normal ----
    this.resultadosOT = this.listaOrdenes.filter((ot) => {
      if (ot.numero !== numero) {
        return false;
      }
      return this.coincideAnio(ot.anio, anioTexto);
    });

    this.sinResultadosOT = this.resultadosOT.length === 0;
  }

  /** "26" y "2026" deben servir igual. Sin año, cualquiera pasa. */
  private coincideAnio(anio: number, anioTexto?: string): boolean {
    if (!anioTexto) {
      return true;
    }
    const completo = String(anio);
    return anioTexto === completo || anioTexto === completo.slice(-2);
  }

  // ---------- LA CASCADA ----------

  /** Los años que tienen alguna O.T., del más nuevo al más viejo. */
  temporadasDisponibles(): number[] {
    const anios = this.listaOrdenes
      .map((ot) => ot.anio)
      .filter((a) => a != null);
    return Array.from(new Set(anios)).sort((a, b) => b - a);
  }

  /** Las escuelas que tienen O.T. en el año elegido. */
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

  /** Las carreras de esa escuela en ese año. */
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

  /** Las O.T. que sobreviven a los tres escalones. */
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

  // Al mover un escalón, los de abajo se vacían: ya no aplican.
  alCambiarTemporada() {
    this.filtroUniversidad = null;
    this.filtroCarrera = null;
  }

  alCambiarUniversidad() {
    this.filtroCarrera = null;
  }

  /**
   * El último escalón. Recibe el id del desplegable y hace exactamente lo
   * mismo que si hubieran tecleado el número: elige la O.T. y arma la lista
   * de alumnos. Los dos caminos terminan en seleccionarOT().
   */
  seleccionarOTPorId(idOrdenTrabajo: any) {
    if (idOrdenTrabajo == null || idOrdenTrabajo === '') {
      return;
    }
    const ot = this.listaOrdenes.find(
      (o) => o?.idOrdenTrabajo === Number(idOrdenTrabajo)
    );
    if (ot) {
      this.seleccionarOT(ot);
    }
  }

  /** Deja los tres desplegables como recién abiertos. */
  private reiniciarCascada() {
    this.filtroTemporada = null;
    this.filtroUniversidad = null;
    this.filtroCarrera = null;
  }

  /**
   * Al elegir la O.T. se arma la lista de sus alumnos y se desbloquea
   * la segunda casilla. De entrada se muestran TODOS: en un grupo chico
   * es más rápido picarle al nombre que teclearlo.
   *
   * La lista puede quedar VACÍA y eso es normal: una O.T. recién abierta
   * todavía no tiene contratos. Ver otSinContratos().
   */
  seleccionarOT(ot: any) {
    this.otElegida = ot;
    this.busquedaOT = this.etiquetaOT(ot);
    this.resultadosOT = [];
    this.sinResultadosOT = false;

    if (ot?.esAdicionales) {
      this.contratosDeLaOT = this.listaContratos.filter(
        (c) => !c?.ordenTrabajo
          && String(c?.fechaContrato ?? '').startsWith(String(ot.anio))
      );
    } else {
      this.contratosDeLaOT = this.listaContratos.filter(
        (c) => c?.ordenTrabajo?.idOrdenTrabajo === ot?.idOrdenTrabajo
      );
    }

    // Ordenados por nombre, para que la lista se pueda leer.
    this.contratosDeLaOT.sort((a, b) =>
      this.nombreDeContrato(a).localeCompare(this.nombreDeContrato(b))
    );

    this.busquedaAlumno = '';
    this.resultadosAlumno = this.contratosDeLaOT;
    this.contratoElegido = null;
    this.nuevoPago.idContrato = null;

    // Cambiar de grupo cancela el cobro sin contrato que se hubiera empezado.
    this.modoSinContrato = false;
    this.nombreSinContrato = '';
  }

  /** ¿La O.T. elegida es en realidad el cajón de adicionales? */
  esCajonDeAdicionales(): boolean {
    return this.otElegida?.esAdicionales === true;
  }

  /** Etiqueta corta: "50/26" o "0/26". */
  etiquetaOT(ot: any): string {
    if (!ot) {
      return '';
    }
    if (ot.esAdicionales) {
      return `0/${String(ot.anio).slice(-2)}`;
    }
    return `${ot.numero}/${String(ot.anio).slice(-2)}`;
  }

  /** Descripción larga, para la lista de resultados y la confirmación. */
  descripcionOT(ot: any): string {
    if (!ot) {
      return '';
    }
    if (ot.esAdicionales) {
      return `Contratos adicionales del ${ot.anio}`;
    }

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
    return partes.length ? partes.join(' · ') : 'Sin datos capturados';
  }

  // ===================== PASO 2: EL ALUMNO =====================

  /**
   * NO busca en la base: filtra la lista que ya se armó al elegir la O.T.
   * Acepta el nombre o el folio del contrato, porque el alumno muchas veces
   * llega con su recibo en la mano.
   */
  filtrarAlumnos() {
    const texto = (this.busquedaAlumno || '').trim().toLowerCase();

    if (!texto) {
      this.resultadosAlumno = this.contratosDeLaOT;
      return;
    }

    this.resultadosAlumno = this.contratosDeLaOT.filter((c) => {
      const nombre = this.nombreDeContrato(c).toLowerCase();
      const folio = String(c?.folio ?? '').toLowerCase();
      return nombre.includes(texto) || folio.includes(texto);
    });
  }

  seleccionarContrato(contrato: any) {
    this.contratoElegido = contrato;
    this.nuevoPago.idContrato = contrato?.idContrato ?? null;
    this.busquedaAlumno = this.nombreDeContrato(contrato);
    this.resultadosAlumno = [];

    // Si ya se eligió a alguien, el cobro sin contrato deja de tener sentido.
    this.modoSinContrato = false;
    this.nombreSinContrato = '';
  }

  /** Vuelve a abrir la lista para escoger otro alumno del mismo grupo. */
  cambiarAlumno() {
    this.contratoElegido = null;
    this.nuevoPago.idContrato = null;
    this.busquedaAlumno = '';
    this.resultadosAlumno = this.contratosDeLaOT;

    this.modoSinContrato = false;
    this.nombreSinContrato = '';
  }

  /**
   * Se escribió un nombre y no quedó nadie en la lista.
   * Esto NO es un error: es la señal de que hay que cobrarle sin contrato.
   */
  alumnoNoEncontrado(): boolean {
    return !!this.otElegida
      && !this.contratoElegido
      && (this.busquedaAlumno || '').trim().length > 0
      && this.resultadosAlumno.length === 0;
  }

  /**
   * La O.T. existe pero todavía no tiene NI UN contrato capturado.
   *
   * Es el día uno del grupo: la orden ya está abierta (es el permiso para
   * trabajarle a la escuela) y nadie ha firmado. Antes esto no se podía ni
   * ver, porque las O.T. se deducían de los contratos.
   */
  otSinContratos(): boolean {
    return !!this.otElegida
      && !this.esCajonDeAdicionales()
      && this.contratosDeLaOT.length === 0;
  }

  /**
   * ¿Se le puede cobrar sin contrato a esta persona?
   *
   * Solo si hay una O.T. de verdad de dónde colgar el cobro. En el cajón de
   * adicionales no hay O.T., así que ahí no se puede: primero hay que
   * levantarle su contrato adicional.
   *
   * Dos caminos llegan aquí:
   *   - el grupo está vacío (O.T. recién abierta), o
   *   - se buscó un nombre y no apareció nadie.
   */
  puedeCobrarSinContrato(): boolean {
    if (!this.otElegida || this.esCajonDeAdicionales() || this.contratoElegido) {
      return false;
    }
    return this.otSinContratos() || this.alumnoNoEncontrado();
  }

  /** Borra todo el buscador y lo deja como recién abierto. */
  reiniciarBuscador() {
    this.busquedaOT = '';
    this.resultadosOT = [];
    this.sinResultadosOT = false;
    this.otElegida = null;

    this.reiniciarCascada();

    this.busquedaAlumno = '';
    this.contratosDeLaOT = [];
    this.resultadosAlumno = [];
    this.contratoElegido = null;

    this.modoSinContrato = false;
    this.nombreSinContrato = '';

    this.nuevoPago.idContrato = null;
  }

  /**
   * Al EDITAR un pago hay que dejar el buscador como si el usuario ya
   * hubiera elegido la O.T. y el alumno de ese pago.
   */
  private preseleccionarDesdeContrato(idContrato: number | null) {
    this.reiniciarBuscador();

    if (!idContrato) {
      return;
    }

    // Aunque no se encuentre el contrato en la lista, el pago conserva su
    // idContrato: primero se asegura eso y luego se intenta pintar el buscador.
    this.nuevoPago.idContrato = idContrato;

    const contrato = this.listaContratos.find((c) => c?.idContrato === idContrato);
    if (!contrato) {
      return;
    }

    if (contrato.ordenTrabajo?.idOrdenTrabajo) {
      this.seleccionarOT(contrato.ordenTrabajo);
    } else {
      const anio = Number(String(contrato.fechaContrato ?? '').substring(0, 4));
      this.seleccionarOT({ esAdicionales: true, numero: 0, anio });
    }

    this.seleccionarContrato(contrato);

    // seleccionarOT() y seleccionarContrato() dejan idContrato bien puesto,
    // pero si el contrato no venía en contratosDeLaOT hay que reponerlo.
    this.nuevoPago.idContrato = idContrato;
  }

  // ===================== EL COBRO SIN CONTRATO =====================

  /**
   * Convierte el modal en el formulario de cobro sin contrato.
   *
   * El nombre que ya venía tecleado en la casilla del alumno se aprovecha:
   * casi siempre es el nombre que hay que capturar.
   */
  abrirCobroSinContrato() {
    if (!this.puedeCobrarSinContrato()) {
      return;
    }

    // El otro lado del candado: si el modo de folio muerto estaba
    // prendido, se apaga. Aquel no cobra nada y este sí.
    this.modoFolioNoUtilizado = false;

    this.modoSinContrato = true;
    this.nombreSinContrato = (this.busquedaAlumno || '').trim();

    // Aquí no hay contrato: el servidor lo crea al guardar.
    this.nuevoPago.idContrato = null;

    // Una renta nunca es devolución: sale dinero de la persona, no de la caja.
    this.nuevoPago.tipoMovimiento = 'Abono';

    // Cortesía queda fuera de este camino (ver modosSinContrato).
    if (this.nuevoPago.modoPago === 'Cortesía') {
      this.nuevoPago.modoPago = 'Efectivo';
    }
  }

  // ===================== FOLIO NO UTILIZADO =====================

  /**
   * Prende o apaga el modo de folio muerto.
   *
   * Apaga el cobro sin contrato a la fuerza: aquel cobra dinero y este no
   * cobra nada, así que no tiene sentido tener los dos prendidos.
   */
  alCambiarModoFolio() {
    if (!this.modoFolioNoUtilizado) {
      return;
    }

    this.modoSinContrato = false;
    this.nombreSinContrato = '';

    // Un folio muerto no cuelga de ningún alumno ni de ninguna O.T.
    this.nuevoPago.idContrato = null;
    this.nuevoPago.montoPago = 0;
    this.nuevoPago.modoPago = 'Efectivo';
    this.nuevoPago.tipoMovimiento = 'Abono';
    this.nuevoPago.comisionOficina = false;
    this.nuevoPago.comentarios = '';
    this.contratoElegido = null;
  }

  /**
   * ¿El folio del recibo muerto es válido?
   *
   * Mismo formato que el resto: una letra y cuatro números. La serie Z
   * está apartada para devoluciones y el servidor también la rechaza.
   */
  folioNoUtilizadoValido(): boolean {
    const folio = (this.nuevoPago.folio || '').trim().toUpperCase();
    if (!/^[A-Z]\d{4}$/.test(folio) || folio.startsWith('Z')) {
      return false;
    }
    return !!this.nuevoPago.fechaPago;
  }

  /**
   * Guarda el folio muerto del talonario de RECIBOS.
   *
   * El servidor valida que no exista ya como pago real: eso es lo que
   * impide que el mismo folio salga verde y rojo en el reporte.
   */
  private guardarFolioNoUtilizado() {
    const p = this.nuevoPago;

    if (!this.folioNoUtilizadoValido()) {
      alert(
        'Captura el folio del recibo (una letra y cuatro números, por ejemplo ' +
        'C2672) y la fecha. La serie Z está apartada para devoluciones.'
      );
      return;
    }

    this.guardando = true;

    this.folioService
      .registrar('RECIBO', (p.folio || '').trim().toUpperCase(), p.fechaPago)
      .subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.paginaActual = 0;
          this.obtenerPagos();
        },
        error: (err) => {
          this.guardando = false;
          const mensaje =
            err.error && typeof err.error === 'string'
              ? err.error
              : 'No se pudo registrar el folio. Revisa la consola.';
          alert(mensaje);
        },
      });
  }

  /** Regresa del formulario al buscador, sin guardar nada. */
  cancelarCobroSinContrato() {
    this.modoSinContrato = false;
    this.nombreSinContrato = '';
  }

  /**
   * Modos de pago del cobro sin contrato.
   *
   * Cortesía queda fuera: si el negocio pide poder regalar una renta,
   * aquí se devuelve this.modosPago completo y ya.
   */
  modosSinContrato(): string[] {
    return this.modosPago.filter((m) => m !== 'Cortesía');
  }

  /**
   * ¿El folio del recibo tiene el formato que exige el servidor?
   * Una letra y cuatro números, sin guion: C2672, D1155.
   * La serie Z está reservada para devoluciones y aquí no aplica.
   */
  folioReciboValido(): boolean {
    const folio = (this.nuevoPago.folio || '').trim().toUpperCase();
    return /^[A-Z]\d{4}$/.test(folio) && !folio.startsWith('Z');
  }

  /** Habilita el botón Guardar del formulario de cobro sin contrato. */
  formularioSinContratoValido(): boolean {
    const p = this.nuevoPago;

    if (!this.otElegida?.idOrdenTrabajo) {
      return false;
    }
    if (!this.nombreSinContrato.trim()) {
      return false;
    }
    if (!p.fechaPago || !p.montoPago || p.montoPago <= 0) {
      return false;
    }
    // Folio del recibo OBLIGATORIO. Para volverlo opcional, borra esta línea.
    if (!this.folioReciboValido()) {
      return false;
    }

    return true;
  }

  /**
   * Manda el cobro al endpoint que crea el contrato invisible y le cuelga
   * el pago, todo en una sola transacción. Si algo falla a medias, el
   * servidor deshace las dos cosas y no queda basura en la base.
   */
  guardarCobroSinContrato() {
    const p = this.nuevoPago;

    if (!this.otElegida?.idOrdenTrabajo) {
      alert('Elige primero la Orden de Trabajo a la que se le va a colgar este cobro.');
      return;
    }
    if (!this.nombreSinContrato.trim()) {
      alert('Escribe el nombre de la persona. Sin folio de contrato, el nombre es obligatorio.');
      return;
    }
    if (!p.fechaPago) {
      alert('Selecciona la fecha del cobro.');
      return;
    }
    if (!p.montoPago || p.montoPago <= 0) {
      alert('El monto debe ser mayor a cero.');
      return;
    }
    if (!this.folioReciboValido()) {
      alert(
        'Captura el folio del recibo: una letra y cuatro números, por ejemplo C2672. ' +
        'La serie Z está reservada para las devoluciones.'
      );
      return;
    }

    const datos = {
      idOrdenTrabajo: this.otElegida.idOrdenTrabajo,
      nombreAlumno: this.nombreSinContrato.trim(),
      folio: (p.folio || '').trim().toUpperCase(),
      fechaPago: p.fechaPago,
      montoPago: Math.abs(p.montoPago),
      modoPago: p.modoPago,
      // Se clava en Abono: el endpoint acepta lo que le manden y una renta
      // nunca es devolución.
      tipoMovimiento: 'Abono',
      comisionOficina: p.comisionOficina === true,
      comentarios: (p.comentarios || '').trim() || null,
    };

    this.guardando = true;

    this.pagoService.crearRenta(datos).subscribe({
      next: () => {
        this.guardando = false;
        this.cerrarModal();
        this.paginaActual = 0;
        this.obtenerPagos();

        // IMPORTANTE: el contrato invisible acaba de nacer y no está en la
        // lista que se cargó al abrir la pantalla. Sin este refresco, el
        // siguiente cobro a la MISMA persona no la encontraría y le crearía
        // un segundo contrato, ensuciando la matriz y los totales.
        this.obtenerCatalogos();
      },
      error: (err) => {
        this.guardando = false;
        const mensaje = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo registrar el cobro. Verifica que el folio del recibo no esté repetido.';
        alert(mensaje);
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
      this.obtenerPagos();
    }, 400);
  }

  // Se dispara al cambiar cualquiera de las dos fechas
  aplicarFiltros() {
    this.paginaActual = 0;
    this.obtenerPagos();
  }

  limpiarFiltros() {
    this.criterioBusqueda = '';

    // A Mostrador no se le limpian las fechas: se le regresan a hoy,
    // que es lo único que tiene permitido ver.
    if (this.soloHoy() && this.modoPantalla) {
      this.filtroDesde = this.modoPantalla.fechaHoy;
      this.filtroHasta = this.modoPantalla.fechaHoy;
    } else {
      this.filtroDesde = '';
      this.filtroHasta = '';
    }

    this.paginaActual = 0;
    this.obtenerPagos();
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
    this.obtenerPagos();
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
    this.obtenerPagos();
  }

  /**
   * Devuelve los números de página a dibujar como botones.
   * Muestra máximo 5 alrededor de la actual, para que con 50 páginas
   * no se llene la pantalla de botones.
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
    const ultimo = primero + this.listaPagos.length - 1;
    return `Mostrando ${primero}–${ultimo} de ${this.totalRegistros}`;
  }

  // Evita que Angular repinte toda la tabla cada vez que se refresca la lista
  trackByPago(_indice: number, pago: any): number {
    return pago.idPago;
  }

  trackByContrato(_indice: number, contrato: any): number {
    return contrato.idContrato;
  }

  /**
   * Nombre del alumno de un CONTRATO.
   *
   * Los contratos NUEVOS guardan el nombre en nombreAlumno y dejan 'cliente'
   * vacío. Los VIEJOS lo tienen en cliente.nombreCompleto. Por eso se busca
   * en los dos lados, en ese orden.
   */
  nombreDeContrato(contrato: any): string {
    const directo = contrato?.nombreAlumno;
    if (directo && String(directo).trim()) {
      return String(directo).trim();
    }

    const viejo = contrato?.cliente?.nombreCompleto;
    if (viejo && String(viejo).trim()) {
      return String(viejo).trim();
    }

    return '—';
  }

  /** Nombre del alumno de un PAGO (para la tabla). */
  nombreAlumno(pago: any): string {
    return this.nombreDeContrato(pago?.contrato);
  }

  /**
   * Folio del contrato para mostrarlo en pantalla.
   * Un cobro sin contrato no tiene folio, y ahí el hueco vacío confunde:
   * mejor decirlo con todas sus letras.
   */
  folioDeContrato(contrato: any): string {
    const folio = String(contrato?.folio ?? '').trim();
    return folio ? folio : 'Sin folio de contrato';
  }

  // Devuelve "44/26" si el contrato tiene O.T., o "Adicional" si no (para el badge de la tabla)
  formatearOT(ot: any): string {
    if (ot?.numero && ot?.anio) {
      return `${ot.numero}/${String(ot.anio).slice(-2)}`;
    }
    return 'Adicional';
  }

  // ---------- COMISIÓN A OFICINA ----------

  /**
   * True si este movimiento se marcó para que su comisión caiga en Oficina.
   * Se usa para pintar el renglón de rosa y mostrar la insignia.
   */
  esOficina(pago: any): boolean {
    return pago?.comisionOficina === true;
  }

  /** Convierte "2026-08-20" en "20/08/2026" para los mensajes al usuario. */
  private fechaBonita(fechaIso: string): string {
    if (!fechaIso || fechaIso.length < 10) {
      return fechaIso || '';
    }
    const [anio, mes, dia] = fechaIso.substring(0, 10).split('-');
    return `${dia}/${mes}/${anio}`;
  }

  /**
   * Avisa antes de mover a quién se le acredita un cobro VIEJO.
   *
   * Cambiar la marca recalcula el reporte de comisiones de ese día. Si ese
   * reporte ya se entregó, el papel y la pantalla dejan de coincidir. No se
   * bloquea (el jefe debe poder corregir errores), pero sí se avisa.
   *
   * Se compara contra la fecha de hoy y no contra "si el corte está cerrado"
   * porque el navegador no sabe qué días tienen corte. Así avisa de más,
   * nunca de menos.
   *
   * @return true si se puede continuar, false si el usuario canceló.
   */
  private confirmarCambioDeComision(): boolean {
    if (!this.editando) {
      return true;
    }
    if (this.nuevoPago.comisionOficina === this.marcaOriginal) {
      return true; // no tocó la marca
    }

    const hoy = new Date().toISOString().split('T')[0];
    const fechaPago = String(this.nuevoPago.fechaPago || '').substring(0, 10);

    if (!fechaPago || fechaPago >= hoy) {
      return true; // es de hoy o del futuro: no hay reporte viejo que mover
    }

    const destino = this.nuevoPago.comisionOficina
      ? 'Oficina'
      : 'la vendedora de la Orden de Trabajo';

    return confirm(
      `Estás cambiando a quién se le acredita este cobro: ahora se le va a ` +
      `abonar a ${destino}.\n\n` +
      `Esto recalcula el reporte de comisiones del ${this.fechaBonita(fechaPago)}, ` +
      `que quizá ya se entregó.\n\n` +
      `¿Continuar?`
    );
  }

  // ---------- DEVOLUCIONES (RN-11) ----------

  /** True cuando lo que se está capturando es una devolución. */
  esDevolucion(): boolean {
    return this.nuevoPago.tipoMovimiento === 'Devolución';
  }

  /**
   * Modos disponibles según el tipo de movimiento.
   * Una cortesía no se puede devolver: nunca entró dinero.
   */
  modosDisponibles(): string[] {
    return this.esDevolucion()
      ? this.modosPago.filter((m) => m !== 'Cortesía')
      : this.modosPago;
  }

  /** Se dispara al cambiar entre Abono y Devolución. */
  alCambiarTipo() {
    // Si venía en Cortesía, ya no es una opción válida en una devolución.
    if (this.esDevolucion() && this.nuevoPago.modoPago === 'Cortesía') {
      this.nuevoPago.modoPago = 'Efectivo';
    }
  }

  /** ¿El folio capturado tiene el formato de la serie Z? */
  folioDevolucionValido(): boolean {
    const folio = (this.nuevoPago.folio || '').trim().toUpperCase();
    return /^Z\d{4}$/.test(folio);
  }

  /** True si la fila de la tabla es una devolución. */
  filaEsDevolucion(pago: any): boolean {
    return pago?.tipoMovimiento === 'Devolución';
  }

  // ---------- Cortesías ----------

  /** True cuando el pago que se está capturando es una cortesía. */
  esCortesia(): boolean {
    return this.nuevoPago.modoPago === 'Cortesía';
  }

  /** Color del badge del modo de pago en la tabla. */
  claseModo(modo: string): string {
    if (modo === 'Cortesía') {
      return 'badge-cortesia';
    }
    if (modo === 'Efectivo' || !modo) {
      return 'bg-success';
    }
    return 'bg-secondary';
  }

  /**
   * El botón Guardar solo se activa cuando los campos obligatorios están
   * completos. Si el modal está en modo cobro sin contrato, manda el otro
   * validador: ahí no hay idContrato que exigir.
   */
  formularioValido(): boolean {
    // El folio muerto tiene su propia regla: solo folio y fecha. Las de
    // abajo exigirían contrato y monto, que aquí no existen.
    if (this.modoFolioNoUtilizado) {
      return this.folioNoUtilizadoValido();
    }

    if (this.modoSinContrato) {
      return this.formularioSinContratoValido();
    }

    const p = this.nuevoPago;
    if (!p.idContrato || !p.fechaPago || p.montoPago <= 0) {
      return false;
    }

    // Una cortesía siempre necesita explicación: a quién se le regaló y por qué.
    if (this.esCortesia() && !(p.comentarios || '').trim()) {
      return false;
    }

    // Una devolución necesita folio de la serie Z y motivo.
    if (this.esDevolucion()) {
      if (!this.folioDevolucionValido()) {
        return false;
      }
      if (!(p.comentarios || '').trim()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Devuelve la fecha del contrato elegido en formato yyyy-MM-dd.
   * Se usa como "min" en el input de fecha para que el calendario no
   * permita escoger una fecha anterior al contrato.
   */
  fechaMinimaContrato(): string {
    // En el cobro sin contrato no hay contrato todavía: el servidor le pone
    // como fecha la del propio cobro, así que no hay mínimo que respetar.
    if (this.modoSinContrato) {
      return '';
    }

    const contrato = this.contratoElegido
      ?? this.listaContratos.find((c) => c?.idContrato === this.nuevoPago.idContrato);

    if (contrato?.fechaContrato) {
      // fechaContrato puede venir como "2025-10-01" o "2025-10-01T00:00..."
      return String(contrato.fechaContrato).substring(0, 10);
    }
    return '';
  }

  abrirFormulario() {
    // Si la pantalla está bloqueada, ni siquiera se abre el modal.
    if (this.pantallaBloqueada()) {
      return;
    }

    this.editando = false;
    this.idPagoSeleccionado = null;
    this.marcaOriginal = false;
    this.modoFolioNoUtilizado = false;
    this.nuevoPago = {
      idContrato: null,
      folio: '',
      fechaPago: this.fechaDeHoy(),
      montoPago: 0,
      modoPago: 'Efectivo',
      tipoMovimiento: 'Abono',
      comisionOficina: false,
      comentarios: '',
    };
    this.reiniciarBuscador();
    this.mostrarModal = true;
  }

  // Cierra el modal con la tecla Escape
  @HostListener('document:keydown.escape')
  cerrarConEscape() {
    if (this.mostrarModal) {
      this.cerrarModal();
    }
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idPagoSeleccionado = null;
    this.modoFolioNoUtilizado = false;
    this.reiniciarBuscador();
  }

  guardarPago() {
    // El folio muerto va primero: no tiene contrato, ni monto, ni tipo de
    // movimiento. Las validaciones de abajo lo detendrían con mensajes que
    // no aplican, empezando por "elige la Orden de Trabajo".
    if (this.modoFolioNoUtilizado) {
      this.guardarFolioNoUtilizado();
      return;
    }

    // El cobro sin contrato tiene su propio camino: no hay idContrato que
    // mandar, el servidor lo crea junto con el pago.
    if (this.modoSinContrato) {
      this.guardarCobroSinContrato();
      return;
    }

    const p = this.nuevoPago;

    if (!p.idContrato) {
      alert('Elige la Orden de Trabajo y el alumno antes de guardar.');
      return;
    }
    if (!p.fechaPago) {
      alert('Selecciona la fecha del pago.');
      return;
    }
    if (!p.montoPago || p.montoPago <= 0) {
      alert('El monto debe ser mayor a cero.');
      return;
    }
    if (this.esDevolucion() && !this.folioDevolucionValido()) {
      alert('Una devolución necesita su folio de la serie Z, por ejemplo Z1234.');
      return;
    }

    // Si se movió a quién se le acredita un cobro viejo, se avisa primero.
    if (!this.confirmarCambioDeComision()) {
      return;
    }

    const pagoParaEnviar = {
      contrato: { idContrato: p.idContrato },
      // Folio vacío se manda como null (RN-03): la BD tiene UNIQUE en folio
      // y dos pagos con folio "" chocarían entre sí.
      folio: (p.folio || '').trim() || null,
      fechaPago: p.fechaPago,
      // Siempre se manda en positivo: el servidor le pone el signo
      // que corresponde según el tipo de movimiento.
      montoPago: Math.abs(p.montoPago),
      modoPago: p.modoPago,
      tipoMovimiento: p.tipoMovimiento,
      comisionOficina: p.comisionOficina === true,
      comentarios: (p.comentarios || '').trim() || null,
      activo: true,
    };

    this.guardando = true;

    if (this.editando && this.idPagoSeleccionado) {
      this.pagoService.actualizar(this.idPagoSeleccionado, pagoParaEnviar).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.obtenerPagos();
        },
        error: (err) => {
          this.guardando = false;
          // Si el backend mandó un mensaje (ej. fecha inválida), mostrarlo.
          // Si no, mostrar un mensaje genérico.
          const mensaje = err.error && typeof err.error === 'string'
            ? err.error
            : 'Error al actualizar el pago. Verifica que el folio no esté repetido.';
          alert(mensaje);
        },
      });
    } else {
      this.pagoService.crear(pagoParaEnviar).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          // Un pago nuevo es el más reciente: se ve en la primera página.
          this.paginaActual = 0;
          this.obtenerPagos();
        },
        error: (err) => {
          this.guardando = false;
          const mensaje = err.error && typeof err.error === 'string'
            ? err.error
            : 'Error al registrar el pago. Verifica que el folio no esté repetido.';
          alert(mensaje);
        },
      });
    }
  }

  prepararEdicion(pago: any) {
    if (!this.puedeModificar(pago)) {
      return;
    }

    this.editando = true;
    this.idPagoSeleccionado = pago.idPago;
    this.modoFolioNoUtilizado = false;
    // Se guarda la marca original para saber si el usuario la cambia.
    this.marcaOriginal = pago.comisionOficina === true;
    this.nuevoPago = {
      idContrato: pago.contrato?.idContrato ?? null,
      folio: pago.folio ?? '',
      // Se recortan los primeros 10 caracteres para asegurar el formato
      // yyyy-MM-dd que necesita el input type="date"
      fechaPago: String(pago.fechaPago ?? '').substring(0, 10),
      // En la BD las devoluciones viven en negativo, pero en pantalla
      // se captura y se muestra siempre en positivo.
      montoPago: Math.abs(pago.montoPago ?? 0),
      modoPago: pago.modoPago ?? 'Efectivo',
      tipoMovimiento: pago.tipoMovimiento ?? 'Abono',
      comisionOficina: pago.comisionOficina === true,
      comentarios: pago.comentarios ?? '',
    };

    // Deja el buscador como si ya se hubiera elegido esa O.T. y ese alumno.
    this.preseleccionarDesdeContrato(pago.contrato?.idContrato ?? null);

    this.mostrarModal = true;
  }

  eliminarPago(id: number) {
    if (confirm('¿Estás seguro de eliminar este pago?')) {
      this.pagoService.eliminar(id).subscribe({
        next: () => {
          // Si era el último de la página, retroceder una
          if (this.listaPagos.length === 1 && this.paginaActual > 0) {
            this.paginaActual--;
          }
          this.obtenerPagos();
        },
        error: () => alert('No se pudo eliminar el pago.'),
      });
    }
  }
}