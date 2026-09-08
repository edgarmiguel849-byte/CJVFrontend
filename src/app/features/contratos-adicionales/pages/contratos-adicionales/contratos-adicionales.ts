import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Contrato, ModoPantallaContratos } from '../../../../core/services/contrato';
import { EstadoContrato } from '../../../../core/services/estado-contrato';
import { FolioNoUtilizadoService } from '../../../../core/services/folio-no-utilizado';

@Component({
  selector: 'app-contratos-adicionales',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contratos-adicionales.html',
  styleUrl: './contratos-adicionales.css',
})
export class ContratosAdicionales implements OnInit {
  listaContratos: any[] = [];
  listaEstados: any[] = [];

  modosPago = ['Efectivo', 'Transferencia', 'Tarjeta', 'Depósito'];

  rolUsuario: string = localStorage.getItem('rolUsuario') ?? '';
  modoPantalla: ModoPantallaContratos | null = null;

  // Meses que deben pasar para marcar "Vencido" (y para el aviso del traspaso).
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

  // ---------- Modal de nuevo adicional ----------
  mostrarModal = false;
  editando = false;
  idContratoSeleccionado: number | null = null;
  errorModal = '';
  cargandoArticulos = false;

  /**
   * MODO "FOLIO NO UTILIZADO".
   *
   * Un folio del talonario de adicionales que se echó a perder. Solo se
   * guarda el número y la fecha, y sale en ROJO en el reporte de control.
   *
   * NO es un contrato: va a su propia tabla. Si se guardara en 'contrato'
   * habría que inventarle paquete, estado, total y modo de anticipo.
   *
   * NUNCA convive con la recontratación: un folio muerto no se recontrata.
   * Por eso los dos interruptores se apagan entre sí.
   */
  modoFolioNoUtilizado = false;

  // ---------- Recontratación / traspaso (Camino A) ----------
  hayAnterior = false;            // false = Camino B (desde cero); true = Camino A
  folioAnterior = '';             // folio del contrato viejo que se teclea
  buscandoAnterior = false;
  anteriorEncontrado = false;     // true cuando ya se buscó y precargó el viejo
  avisoVencido = '';              // mensaje "recibo vencido" si el viejo pasó 4 meses

  // Datos del contrato anterior, solo para MOSTRARLOS (no se editan).
  anteriorFolio = '';
  anteriorTotal = 0;
  anteriorAbonado = 0;
  anteriorEsGrupo = false;
  anteriorOT = '';

  nuevoContrato = this.formularioVacio();

  constructor(
    private contratoService: Contrato,
    private estadoService: EstadoContrato,
    private folioService: FolioNoUtilizadoService,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * La fecha de HOY en hora LOCAL.
   *
   * OJO: aquí NO sirve new Date().toISOString(), que era lo que había.
   * Devuelve UTC, y en México (UTC-6) a partir de las 6 de la tarde ya es
   * el día siguiente. Un adicional capturado a las 7 PM nacía con fecha de
   * MAÑANA, y su anticipo se iba al corte del día equivocado.
   */
  private fechaDeHoy(): string {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  private formularioVacio() {
    return {
      folio: '',
      fechaContrato: this.fechaDeHoy(),
      ad: '',
      nombreAlumno: '',
      telefono1: '',
      telefono2: '',
      correo: '',
      escuela: '',
      carrera: '',
      generacion: '',
      fechaEntrega: '',
      idEstadoContrato: null as number | null,

      // Los renglones de "Artículos Adquiridos". El TOTAL sale de sumarlos,
      // por eso ya no se teclea a mano. Siempre arranca con un renglón
      // vacío para que la persona no tenga que darle a "Agregar" primero.
      articulos: [{ descripcion: '', monto: 0 }] as ArticuloCapturado[],

      // Se conserva por compatibilidad, pero ya NO se captura: al guardar
      // se manda siempre la suma de los artículos.
      total: 0,

      // "Anticipo (Global de Recibos Físicos Anteriores)". Es el arrastre
      // de la recontratación. NO entra al corte de caja ni comisiona:
      // ese dinero se cobró y se comisionó en el contrato viejo.
      abonoHeredado: 0,

      // "Anticipo de Hoy". Este SÍ entra al corte de caja del día.
      anticipo: 0,
      modoAnticipo: 'Efectivo',
      observaciones: '',
    };
  }

  ngOnInit() {
    this.cargando = true;

    // Mismas reglas de rol que la pantalla de grupos: el backend nos dice
    // en qué modo arrancar (Mostrador amarrado a hoy, Jefe/Admin en blanco).
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
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });

    // Catálogo de estados para el desplegable del formulario.
    this.estadoService.listar().subscribe({
      next: (data) => {
        this.listaEstados = (data ?? []).filter(
          (e: any) => e.activo === true || e.activo === 1
        );
      },
    });
  }

  private ajustarPantallaSegunModo() {
    if (!this.modoPantalla) {
      return;
    }
    switch (this.modoPantalla.modo) {
      case 'SOLO_HOY':
        this.filtroDesde = this.modoPantalla.fechaHoy;
        this.filtroHasta = this.modoPantalla.fechaHoy;
        this.obtenerAdicionales();
        break;
      case 'CORTE_CERRADO':
      case 'BUSCAR_PRIMERO':
      default:
        this.cargando = false;
        break;
    }
  }

  obtenerAdicionales() {
    this.cargando = true;
    this.contratoService
      .listarPaginadoAdicionales(
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
            : 'No se pudieron cargar los contratos adicionales.';
          alert(mensaje);
          this.cdr.detectChanges();
        },
      });
  }

  // ===================== ARTÍCULOS ADQUIRIDOS =====================
  // El total del contrato es la SUMA de estos renglones. Piénsalo como
  // la nota de venta: los renglones mandan, el total es su resultado.

  /** Agrega un renglón vacío al final. */
  agregarArticulo() {
    this.nuevoContrato.articulos.push({ descripcion: '', monto: 0 });
  }

  /**
   * Quita un renglón. Nunca deja la lista vacía: si es el único, en vez
   * de borrarlo lo limpia, para que la pantalla no se quede sin nada.
   */
  quitarArticulo(indice: number) {
    if (this.nuevoContrato.articulos.length <= 1) {
      this.nuevoContrato.articulos = [{ descripcion: '', monto: 0 }];
      return;
    }
    this.nuevoContrato.articulos.splice(indice, 1);
  }

  /** El total: la suma de todos los montos capturados. */
  totalArticulos(): number {
    return (this.nuevoContrato.articulos ?? []).reduce(
      (suma, a) => suma + (Number(a?.monto) || 0),
      0
    );
  }

  /**
   * Lo que el alumno lleva cubierto: el global de recibos anteriores más
   * lo que entrega hoy. Es solo para que se vea en pantalla mientras se
   * captura; el saldo de verdad lo calcula el servidor.
   */
  abonadoPrevisto(): number {
    const heredado = Number(this.nuevoContrato.abonoHeredado) || 0;
    const hoy = Number(this.nuevoContrato.anticipo) || 0;
    return heredado + hoy;
  }

  /** Lo que quedaría debiendo. */
  restaPrevista(): number {
    return this.totalArticulos() - this.abonadoPrevisto();
  }

  /**
   * Para el *ngFor de los artículos. Sin esto, Angular vuelve a dibujar
   * los renglones al escribir y el cursor se sale de la casilla.
   */
  trackByIndice(indice: number): number {
    return indice;
  }

  /** ¿Se debe mostrar el renglón de "Global de recibos anteriores"? */
  mostrarGlobalRecibos(): boolean {
    if (this.hayAnterior) {
      return true;
    }
    return this.editando && (Number(this.nuevoContrato.abonoHeredado) || 0) > 0;
  }

  // ===================== ETIQUETA "VENCIDO" =====================
  // OJO: NO cambia nada en la base. El contrato sigue "Activo" y se le puede
  // cobrar, entregar y comisionar igual. Es puro letrero informativo.
  //
  // Regla (ADICIONALES): pasaron 4 meses desde la FECHA DE ENTREGA de ESE
  // contrato y el alumno todavía debe dinero. Sin fecha de entrega capturada,
  // no vence nunca.
  //
  // (En contratos de grupo el reloj es distinto: arranca en el cierre de
  // ciclo de la O.T., que es una sola fecha para todo el grupo.)

  /** ¿Este adicional ya está vencido? */
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

    return this.pasaronCuatroMeses(item?.contrato?.fechaEntrega);
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
    const texto = item?.contrato?.fechaEntrega;
    const entrega = new Date(String(texto).substring(0, 10) + 'T00:00:00');
    const limite = new Date(entrega);
    limite.setMonth(limite.getMonth() + this.MESES_PARA_VENCER);
    return (
      'Pasaron ' + this.MESES_PARA_VENCER +
      ' meses desde la fecha de entrega (venció el ' +
      limite.toLocaleDateString('es-MX') +
      ') y aún tiene saldo. El contrato sigue funcionando normal.'
    );
  }

  // ---------- Filtros ----------

  alEscribirBusqueda() {
    clearTimeout(this.temporizadorBusqueda);
    this.temporizadorBusqueda = setTimeout(() => {
      this.paginaActual = 0;
      this.obtenerAdicionales();
    }, 400);
  }

  aplicarFiltros() {
    this.paginaActual = 0;
    this.obtenerAdicionales();
  }

  limpiarFiltros() {
    this.criterioBusqueda = '';
    this.filtroDesde = '';
    this.filtroHasta = '';
    this.paginaActual = 0;
    this.obtenerAdicionales();
  }

  hayFiltrosActivos(): boolean {
    return !!(this.criterioBusqueda || this.filtroDesde || this.filtroHasta);
  }

  // ---------- Paginación ----------

  irAPagina(pagina: number) {
    if (pagina < 0 || pagina >= this.totalPaginas || pagina === this.paginaActual) {
      return;
    }
    this.paginaActual = pagina;
    this.obtenerAdicionales();
  }

  paginaAnterior() {
    this.irAPagina(this.paginaActual - 1);
  }

  paginaSiguiente() {
    this.irAPagina(this.paginaActual + 1);
  }

  cambiarTamanio() {
    this.paginaActual = 0;
    this.obtenerAdicionales();
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

  puedeModificar(item: any): boolean {
    if (this.rolUsuario === 'Jefe' || this.rolUsuario === 'Administrador') {
      return true;
    }
    return !item?.diaConCorte;
  }

  // ===================== FORMULARIO NUEVO ADICIONAL =====================

  /**
   * Prende o apaga el modo de folio no utilizado.
   *
   * Se conservan folio y fecha, que son los dos campos que sí viajan, y se
   * limpia todo lo demás. Dejar los otros datos escondidos daría la
   * impresión de que se guardaron, cuando no se mandan.
   *
   * Apaga la recontratación a la fuerza: un folio muerto no tiene contrato
   * anterior que arrastrar.
   */
  alCambiarModoFolio() {
    this.errorModal = '';
    if (!this.modoFolioNoUtilizado) {
      return;
    }

    const folio = this.nuevoContrato.folio;
    const fecha = this.nuevoContrato.fechaContrato;

    this.hayAnterior = false;
    this.folioAnterior = '';
    this.avisoVencido = '';
    this.anteriorEncontrado = false;
    this.limpiarDatosAnterior();

    this.nuevoContrato = this.formularioVacio();
    this.nuevoContrato.folio = folio;
    this.nuevoContrato.fechaContrato = fecha;
  }

  abrirFormulario() {
    this.editando = false;
    this.idContratoSeleccionado = null;
    this.errorModal = '';
    this.modoFolioNoUtilizado = false;
    this.hayAnterior = false;
    this.folioAnterior = '';
    this.avisoVencido = '';
    this.anteriorEncontrado = false;
    this.cargandoArticulos = false;
    this.limpiarDatosAnterior();
    this.nuevoContrato = this.formularioVacio();
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idContratoSeleccionado = null;
    this.errorModal = '';
    this.modoFolioNoUtilizado = false;
    this.hayAnterior = false;
    this.folioAnterior = '';
    this.avisoVencido = '';
    this.anteriorEncontrado = false;
    this.cargandoArticulos = false;
    this.limpiarDatosAnterior();
  }

  // Cambiar entre Camino B (No) y Camino A (Sí). Al cambiar, se limpia el
  // formulario para no arrastrar datos del otro flujo.
  elegirCaminoAnterior(valor: boolean) {
    // El otro lado del candado: si alguien alcanza este botón con el modo
    // de folio muerto prendido, se apaga. Los dos no pueden convivir.
    this.modoFolioNoUtilizado = false;
    this.hayAnterior = valor;
    this.folioAnterior = '';
    this.avisoVencido = '';
    this.anteriorEncontrado = false;
    this.errorModal = '';
    this.limpiarDatosAnterior();
    this.nuevoContrato = this.formularioVacio();
  }

  /** Borra los datos del contrato anterior que se muestran de referencia. */
  private limpiarDatosAnterior() {
    this.anteriorFolio = '';
    this.anteriorTotal = 0;
    this.anteriorAbonado = 0;
    this.anteriorEsGrupo = false;
    this.anteriorOT = '';
  }

  /**
   * RECONTRATACIÓN - Paso 1: busca el contrato viejo por su folio y precarga
   * sus datos personales. Acepta contratos de GRUPO y adicionales, activos
   * o vencidos. Los CANCELADOS los rechaza el servidor con su mensaje.
   */
  buscarAnterior() {
    this.errorModal = '';
    this.avisoVencido = '';
    this.anteriorEncontrado = false;
    this.limpiarDatosAnterior();

    const folio = (this.folioAnterior || '').trim().toUpperCase();
    if (!folio) {
      this.errorModal = 'Escribe el folio del contrato anterior.';
      return;
    }

    this.buscandoAnterior = true;
    this.contratoService.buscarAnteriorAdicional(folio).subscribe({
      next: (item) => {
        this.buscandoAnterior = false;
        const ant = item.contrato;

        // Heredar los datos personales del alumno (editables). El folio
        // NUEVO queda vacío: se teclea aparte y debe ser único.
        this.nuevoContrato.nombreAlumno = ant.nombreAlumno ?? '';
        this.nuevoContrato.telefono1 = ant.telefono1 ?? '';
        this.nuevoContrato.telefono2 = ant.telefono2 ?? '';
        this.nuevoContrato.correo = ant.correo ?? '';
        this.nuevoContrato.generacion = ant.generacion ?? '';
        this.nuevoContrato.ad = ant.ad ?? '';
        this.nuevoContrato.observaciones = ant.observaciones ?? '';

        // Escuela y carrera: si el anterior es de GRUPO, esos datos viven
        // en su O.T., no en el contrato. Se copian de donde estén.
        this.nuevoContrato.escuela = ant.ordenTrabajo
          ? (ant.ordenTrabajo.escuela ?? '')
          : (ant.escuela ?? '');
        this.nuevoContrato.carrera = ant.ordenTrabajo
          ? (ant.ordenTrabajo.carreraTexto ?? '')
          : (ant.carrera ?? '');

        // Datos del anterior, solo de referencia.
        this.anteriorFolio = ant.folio ?? '';
        this.anteriorTotal = ant.total ?? 0;
        this.anteriorAbonado = item.abonado ?? 0;
        this.anteriorEsGrupo = !!ant.ordenTrabajo;
        this.anteriorOT = ant.ordenTrabajo
          ? `${ant.ordenTrabajo.numero}/${String(ant.ordenTrabajo.anio).slice(-2)}`
          : '';

        // El global de recibos anteriores se PROPONE con lo que el sistema
        // tiene registrado, pero se puede corregir: mandan los recibos
        // físicos, que es papel que el sistema nunca vio.
        this.nuevoContrato.abonoHeredado = Number(item.abonado ?? 0);

        // Los artículos se capturan desde cero: son los que el alumno
        // adquiere AHORA. El total del anterior no se hereda.
        this.nuevoContrato.articulos = [{ descripcion: '', monto: 0 }];

        // El anticipo queda LIBRE para el dinero que el alumno traiga HOY.
        this.nuevoContrato.anticipo = 0;
        this.nuevoContrato.modoAnticipo = 'Efectivo';

        // Estado del nuevo: por defecto "Activo".
        const activo = this.listaEstados.find(
          (e: any) => (e.nombreEstado || '').toLowerCase() === 'activo'
        );
        this.nuevoContrato.idEstadoContrato = activo
          ? activo.idEstadoContrato
          : (ant.estadoContrato?.idEstadoContrato ?? null);

        // Aviso "recibo vencido" si el viejo ya pasó 4 meses (informativo).
        if (this.pasaronCuatroMeses(ant.fechaContrato)) {
          this.avisoVencido = 'Recibo vencido: el contrato anterior tiene más de 4 meses. Aun así puedes continuar.';
        }

        this.anteriorEncontrado = true;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.buscandoAnterior = false;
        this.anteriorEncontrado = false;
        this.errorModal = (err?.error && typeof err.error === 'string')
          ? err.error
          : 'No se pudo buscar el contrato anterior.';
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * ¿Ya pasaron 4 meses desde esa fecha?
   * Lo usan dos cosas: el aviso de "recibo vencido" del traspaso y la
   * etiqueta "Vencido" de la lista. Un solo reloj para los dos, para que
   * nunca se contradigan.
   */
  private pasaronCuatroMeses(fecha: string): boolean {
    if (!fecha) {
      return false;
    }
    const f = new Date(String(fecha).substring(0, 10) + 'T00:00:00');
    if (isNaN(f.getTime())) {
      return false;
    }
    const limite = new Date(f);
    limite.setMonth(limite.getMonth() + this.MESES_PARA_VENCER);
    return new Date() > limite;
  }

  /**
   * Guarda un folio no utilizado del talonario de ADICIONALES.
   *
   * El servidor valida el formato, que no esté ya marcado, y que no exista
   * como contrato real. Ese último es el que impide que el mismo folio
   * salga verde y rojo al mismo tiempo en el reporte.
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
      .registrar('ADICIONAL', c.folio.trim().toUpperCase(), c.fechaContrato)
      .subscribe({
        next: () => {
          this.cerrarModal();
          this.paginaActual = 0;
          this.obtenerAdicionales();
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

    // Se desvía ANTES de todo: un folio muerto no tiene alumno, ni estado,
    // ni artículos. Las validaciones de abajo lo detendrían con mensajes
    // que no aplican, empezando por "captura al menos un artículo".
    if (this.modoFolioNoUtilizado) {
      this.guardarFolioNoUtilizado();
      return;
    }

    // En Camino A hay que haber buscado y encontrado el anterior primero.
    if (!this.editando && this.hayAnterior && !this.anteriorEncontrado) {
      this.errorModal = 'Primero teclea el folio del contrato anterior y presiona Buscar.';
      return;
    }

    // Folio (nuevo): obligatorio y con formato 1 letra + 4 números.
    const folio = (c.folio || '').trim().toUpperCase();
    if (!folio) {
      this.errorModal = 'El folio es obligatorio.';
      return;
    }
    if (!/^[A-Z]\d{4}$/.test(folio)) {
      this.errorModal = 'El folio debe ser una letra y cuatro números, por ejemplo A1234.';
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

    // ---------- Artículos: son obligatorios, de ahí sale el total ----------
    const articulosLimpios: ArticuloCapturado[] = [];
    for (let i = 0; i < (c.articulos ?? []).length; i++) {
      const a = c.articulos[i];
      const descripcion = (a?.descripcion || '').trim();
      const monto = Number(a?.monto);

      // Un renglón totalmente vacío se ignora, para no castigar a quien
      // le dio de más a "Agregar artículo".
      if (!descripcion && (!a?.monto || monto === 0)) {
        continue;
      }
      if (!descripcion) {
        this.errorModal = `El artículo ${i + 1} no tiene descripción.`;
        return;
      }
      if (isNaN(monto)) {
        this.errorModal = `El monto del artículo ${i + 1} no es un número válido.`;
        return;
      }
      if (monto < 0) {
        this.errorModal =
          `El artículo ${i + 1} tiene un monto negativo. ` +
          'Las devoluciones se registran en la pantalla de Pagos.';
        return;
      }
      articulosLimpios.push({ descripcion, monto });
    }

    if (articulosLimpios.length === 0) {
      this.errorModal = 'Captura al menos un artículo. El total del contrato sale de sumarlos.';
      return;
    }

    const totalCalculado = articulosLimpios.reduce((s, a) => s + a.monto, 0);

    const contratoParaEnviar: any = {
      folio: folio,
      fechaContrato: c.fechaContrato,
      fechaEntrega: c.fechaEntrega || null,
      ad: c.ad || null,
      nombreAlumno: c.nombreAlumno.trim(),
      telefono1: c.telefono1 || null,
      telefono2: c.telefono2 || null,
      correo: c.correo || null,
      escuela: c.escuela || null,
      carrera: c.carrera || null,
      generacion: c.generacion || null,
      estadoContrato: { idEstadoContrato: c.idEstadoContrato },
      // Sin O.T.: esto es lo que lo hace un ADICIONAL.
      ordenTrabajo: null,
      // Los renglones. El servidor vuelve a sumarlos y él pone el total;
      // este número va solo para que el envío quede completo.
      articulos: articulosLimpios,
      total: totalCalculado,
      // Global de recibos anteriores: NO entra al corte de caja.
      abonoHeredado: Number(c.abonoHeredado) || 0,
      // Anticipo de hoy: ESTE sí entra al corte de caja.
      anticipo: Number(c.anticipo) || 0,
      modoAnticipo: c.modoAnticipo,
      observaciones: c.observaciones || null,
      activo: true,
    };

    if (this.editando && this.idContratoSeleccionado) {
      // EDITAR
      this.contratoService.actualizar(this.idContratoSeleccionado, contratoParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerAdicionales();
        },
        error: (err) => {
          this.errorModal = err?.error || 'Error al actualizar el contrato adicional.';
          this.cdr.detectChanges();
        },
      });
    } else if (this.hayAnterior) {
      // RECONTRATACIÓN: crea el nuevo y marca el anterior como traspasado.
      this.contratoService.traspasarAdicional(contratoParaEnviar, this.folioAnterior).subscribe({
        next: () => {
          this.cerrarModal();
          this.paginaActual = 0;
          this.obtenerAdicionales();
        },
        error: (err) => {
          this.errorModal = err?.error || 'Error al hacer la recontratación.';
          this.cdr.detectChanges();
        },
      });
    } else {
      // CAMINO B: crear desde cero.
      this.contratoService.crear(contratoParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.paginaActual = 0;
          this.obtenerAdicionales();
        },
        error: (err) => {
          this.errorModal = err?.error || 'Error al registrar el contrato adicional.';
          this.cdr.detectChanges();
        },
      });
    }
  }

  prepararEdicion(item: any) {
    const contrato = item.contrato;
    this.editando = true;
    this.idContratoSeleccionado = contrato.idContrato;
    this.errorModal = '';
    this.modoFolioNoUtilizado = false;
    this.hayAnterior = false;
    this.folioAnterior = '';
    this.avisoVencido = '';
    this.anteriorEncontrado = false;
    this.limpiarDatosAnterior();
    this.nuevoContrato = {
      folio: contrato.folio ?? '',
      fechaContrato: String(contrato.fechaContrato ?? '').substring(0, 10),
      ad: contrato.ad ?? '',
      nombreAlumno: contrato.nombreAlumno ?? '',
      telefono1: contrato.telefono1 ?? '',
      telefono2: contrato.telefono2 ?? '',
      correo: contrato.correo ?? '',
      escuela: contrato.escuela ?? '',
      carrera: contrato.carrera ?? '',
      generacion: contrato.generacion ?? '',
      fechaEntrega: contrato.fechaEntrega ? String(contrato.fechaEntrega).substring(0, 10) : '',
      idEstadoContrato: contrato.estadoContrato?.idEstadoContrato ?? null,
      // Se llena en cuanto responda el servidor (abajo).
      articulos: [{ descripcion: '', monto: 0 }] as ArticuloCapturado[],
      total: contrato.total ?? 0,
      abonoHeredado: Number(contrato.abonoHeredado ?? 0),
      anticipo: contrato.anticipo ?? 0,
      modoAnticipo: contrato.modoAnticipo ?? 'Efectivo',
      observaciones: contrato.observaciones ?? '',
    };
    this.mostrarModal = true;

    // Los artículos se piden aparte. Si el contrato es viejo y no tiene,
    // el servidor devuelve un renglón "Contrato" con el monto que ya
    // tenía, para que no se le borre el total al guardar.
    this.cargandoArticulos = true;
    this.contratoService.listarArticulos(contrato.idContrato).subscribe({
      next: (articulos) => {
        const lista = (articulos ?? []).map((a: any) => ({
          descripcion: a?.descripcion ?? '',
          monto: Number(a?.monto ?? 0),
        }));
        this.nuevoContrato.articulos = lista.length
          ? lista
          : [{ descripcion: 'Contrato', monto: Number(contrato.total ?? 0) }];
        this.cargandoArticulos = false;
        this.cdr.detectChanges();
      },
      error: () => {
        // Red de seguridad: si falla la consulta, NO se deja el total en
        // ceros. Se arma un renglón con el monto que ya tenía el contrato.
        this.nuevoContrato.articulos = [
          { descripcion: 'Contrato', monto: Number(contrato.total ?? 0) },
        ];
        this.cargandoArticulos = false;
        this.errorModal = 'No se pudieron cargar los artículos. Se dejó un renglón con el total anterior; revísalo antes de guardar.';
        this.cdr.detectChanges();
      },
    });
  }

  eliminarContrato(id: number) {
    if (confirm('¿Estás seguro de eliminar este contrato adicional?')) {
      this.contratoService.eliminar(id).subscribe({
        next: () => {
          if (this.listaContratos.length === 1 && this.paginaActual > 0) {
            this.paginaActual--;
          }
          this.obtenerAdicionales();
        },
        error: (err) => alert(err?.error || 'No se pudo eliminar el contrato adicional.'),
      });
    }
  }
}

/** Un renglón de "Artículos Adquiridos" mientras se está capturando. */
interface ArticuloCapturado {
  descripcion: string;
  monto: number;
}