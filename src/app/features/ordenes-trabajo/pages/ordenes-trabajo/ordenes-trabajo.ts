import { RouterModule, Router } from '@angular/router';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrdenTrabajo } from '../../../../core/services/orden-trabajo';
import { Vendedor } from '../../../../core/services/vendedor';
import { Contrato, AnioAdicionales } from '../../../../core/services/contrato';

@Component({
  selector: 'app-ordenes-trabajo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './ordenes-trabajo.html',
  styleUrl: './ordenes-trabajo.css',
})
export class OrdenesTrabajo implements OnInit {
  listaOrdenes: any[] = [];
  ordenesFiltradas: any[] = [];

  listaVendedores: any[] = [];

  // Renglones fijos "0/26", "0/25"... que van ARRIBA de la lista.
  // NO son O.T. de verdad: son una consulta de los adicionales de cada año.
  aniosAdicionales: AnioAdicionales[] = [];

  // Modalidad escolar de la O.T.
  modalidades = ['Escolarizado', 'Abierto'];

  rolUsuario: string = localStorage.getItem('rolUsuario') ?? '';
  esJefe: boolean = this.rolUsuario === 'Jefe';
  // Editar/eliminar O.T.: Jefe y Administrador. Mostrador no.
  puedeEditar: boolean = this.rolUsuario === 'Jefe' || this.rolUsuario === 'Administrador';

  criterioBusqueda = '';
  cargando = false;

  // ===== Cascada de filtros (Temporada -> Universidad -> Carrera) =====
  filtroTemporada: number | null = null;
  filtroUniversidad: string | null = null;
  filtroCarrera: string | null = null;

  mostrarModal = false;
  editando = false;
  idOrdenSeleccionada: number | null = null;
  errorModal = '';

  // ===== RECORRIMIENTO DE LA ENTREGA =====
  //
  // Recorrer = empujar hacia ADELANTE una fecha de entrega ya comprometida
  // con la escuela. Adelantarla no es recorrer: nadie se queja de recibir
  // antes.
  //
  // Estas tres NO se mandan al servidor. El backend ignora a propósito
  // 'entregaRecorrida' y 'fechaEntregaOriginal' que vengan en el JSON, y
  // deduce el recorrimiento comparando la fecha que llega contra la que
  // tenía guardada. La cortina está aquí; la chapa vive en
  // OrdenTrabajoService.editar(). Si algún día esto se rompe, la base
  // sigue estando bien.

  /** La casilla "Recorrimiento". Solo destraba el campo de la fecha. */
  recorrimientoActivo = false;

  /** True si la O.T. YA venía recorrida de la base (la palomita fija). */
  entregaYaRecorrida = false;

  /**
   * La fecha con la que ABRIÓ el modal. Es contra esta que se compara para
   * pintar el rojo, no contra 'hoy' ni contra la casilla. Así la pantalla
   * dice exactamente lo mismo que va a decidir el servidor.
   */
  fechaEntregaAlAbrir = '';

  /** La PRIMERA fecha prometida. Solo para mostrarla; nunca se manda. */
  fechaEntregaOriginal = '';

  nuevaOrden = {
    numero: null as number | null,
    anio: new Date().getFullYear(),
    escuela: '',
    siglas: '',
    carreraTexto: '',
    modalidad: '',
    diasCobro: '',
    grupo: '',
    generacion: '',
    idVendedor: null as number | null,
    fechaEntrega: '',
    fechaCierreCiclo: '',
  };

  constructor(
    private ordenService: OrdenTrabajo,
    private vendedorService: Vendedor,
    private contratoService: Contrato,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.obtenerOrdenes();
    this.obtenerCatalogos();
    this.obtenerAniosAdicionales();
  }

  obtenerOrdenes() {
    this.cargando = true;
    this.ordenService.listar().subscribe({
      next: (data) => {
        this.listaOrdenes = data;
        this.ordenesFiltradas = data;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  obtenerCatalogos() {
    // Vendedores activos, desde la tabla nueva de vendedores.
    this.vendedorService.listarActivos().subscribe({
      next: (data) => (this.listaVendedores = data ?? []),
    });
  }

  /**
   * Trae los años que tienen adicionales, para los renglones fijos "0/AA".
   * Si truena, se deja la lista vacía: la pantalla de O.T. debe seguir
   * funcionando aunque esta consulta extra falle.
   */
  obtenerAniosAdicionales() {
    this.contratoService.listarAniosAdicionales().subscribe({
      next: (data) => {
        this.aniosAdicionales = data ?? [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.aniosAdicionales = [];
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Qué renglones "0/AA" se ven en este momento.
   * - Con cascada de Temporada: solo el de ese año.
   * - Escribiendo en el buscador: se esconden, salvo que el texto
   *   coincida con la etiqueta ("0/26") o con el año ("2026", "26").
   */
  aniosAdicionalesVisibles(): AnioAdicionales[] {
    if (this.filtroTemporada != null) {
      return this.aniosAdicionales.filter((a) => a.anio === this.filtroTemporada);
    }

    const busqueda = this.criterioBusqueda.trim().toLowerCase();
    if (!busqueda) {
      return this.aniosAdicionales;
    }

    return this.aniosAdicionales.filter(
      (a) =>
        a.etiqueta.toLowerCase().includes(busqueda) ||
        String(a.anio).includes(busqueda) ||
        String(a.anio).slice(-2) === busqueda
    );
  }

  /** Abre la matriz de adicionales de ese año (la hoja tipo Excel). */
  abrirMatrizAdicionales(anio: number) {
    this.router.navigate(['/matriz-adicionales', anio]);
  }

  // ===================== BUSCADOR DE TEXTO =====================
  // Al escribir, se limpia la cascada (los dos filtros no se mezclan;
  // el último que usas manda).
  alEscribirBusqueda() {
    this.filtroTemporada = null;
    this.filtroUniversidad = null;
    this.filtroCarrera = null;
    this.aplicarFiltroTexto();
  }

  private aplicarFiltroTexto() {
    const busqueda = this.criterioBusqueda.trim().toLowerCase();

    if (!busqueda) {
      this.ordenesFiltradas = this.listaOrdenes;
      return;
    }

    const patronNumero = /^(\d+)(?:\s*\/\s*(\d+))?$/;
    const coincidencia = busqueda.match(patronNumero);

    if (coincidencia) {
      const numero = parseInt(coincidencia[1], 10);
      const anioTexto = coincidencia[2];

      this.ordenesFiltradas = this.listaOrdenes.filter((ot) => {
        if (ot.numero !== numero) return false;
        if (!anioTexto) return true;
        const anioCorto = String(ot.anio).slice(-2);
        return anioTexto === String(ot.anio) || anioTexto === anioCorto;
      });
    } else {
      this.ordenesFiltradas = this.listaOrdenes.filter(
        (ot) =>
          ot.carreraTexto?.toLowerCase().includes(busqueda) ||
          ot.escuela?.toLowerCase().includes(busqueda) ||
          ot.siglas?.toLowerCase().includes(busqueda) ||
          ot.grupo?.toLowerCase().includes(busqueda) ||
          ot.vendedor?.nombre?.toLowerCase().includes(busqueda)
      );
    }
  }

  // ===================== CASCADA =====================
  // Al usar la cascada, se limpia el texto (mismo principio).

  temporadasDisponibles(): number[] {
    const anios = this.listaOrdenes.map((ot) => ot.anio).filter((a) => a != null);
    return Array.from(new Set(anios)).sort((a, b) => b - a);
  }

  universidadesDisponibles(): string[] {
    if (this.filtroTemporada == null) return [];
    const escuelas = this.listaOrdenes
      .filter((ot) => ot.anio === this.filtroTemporada)
      .map((ot) => (ot.escuela ?? '').trim())
      .filter((e) => e !== '');
    return Array.from(new Set(escuelas)).sort();
  }

  carrerasDisponibles(): string[] {
    if (this.filtroTemporada == null || this.filtroUniversidad == null) return [];
    const carreras = this.listaOrdenes
      .filter((ot) => ot.anio === this.filtroTemporada && (ot.escuela ?? '').trim() === this.filtroUniversidad)
      .map((ot) => (ot.carreraTexto ?? '').trim())
      .filter((c) => c !== '');
    return Array.from(new Set(carreras)).sort();
  }

  alCambiarTemporada() {
    this.criterioBusqueda = '';          // limpia el texto
    this.filtroUniversidad = null;
    this.filtroCarrera = null;
    this.aplicarFiltroCascada();
  }

  alCambiarUniversidad() {
    this.criterioBusqueda = '';
    this.filtroCarrera = null;
    this.aplicarFiltroCascada();
  }

  alCambiarCarrera() {
    this.criterioBusqueda = '';
    this.aplicarFiltroCascada();
  }

  limpiarCascada() {
    this.filtroTemporada = null;
    this.filtroUniversidad = null;
    this.filtroCarrera = null;
    this.ordenesFiltradas = this.listaOrdenes;
  }

  hayCascadaActiva(): boolean {
    return this.filtroTemporada != null || this.filtroUniversidad != null || this.filtroCarrera != null;
  }

  private aplicarFiltroCascada() {
    let resultado = this.listaOrdenes;

    if (this.filtroTemporada != null) {
      resultado = resultado.filter((ot) => ot.anio === this.filtroTemporada);
    }
    if (this.filtroUniversidad != null) {
      resultado = resultado.filter((ot) => (ot.escuela ?? '').trim() === this.filtroUniversidad);
    }
    if (this.filtroCarrera != null) {
      resultado = resultado.filter((ot) => (ot.carreraTexto ?? '').trim() === this.filtroCarrera);
    }

    this.ordenesFiltradas = resultado;
  }

    /**
   * El ciclo se considera CERRADO solo cuando la fecha de cierre ya pasó.
   * Capturar una fecha futura no cierra nada: es una cita agendada, no un
   * hecho. Mientras no llegue el día, la O.T. sigue Abierta y nada cambia
   * para sus contratos.
   */
  cicloCerrado(ot: any): boolean {
    const texto = ot?.fechaCierreCiclo;
    if (!texto) {
      return false;
    }
    const fecha = new Date(String(texto).substring(0, 10) + 'T00:00:00');
    if (isNaN(fecha.getTime())) {
      return false;
    }
    return new Date() >= fecha;
  }

  /** Texto de ayuda para el badge: cuándo cierra o cuándo cerró. */
  tituloCiclo(ot: any): string {
    const texto = ot?.fechaCierreCiclo;
    if (!texto) {
      return 'Sin fecha de cierre capturada';
    }
    const fecha = new Date(String(texto).substring(0, 10) + 'T00:00:00');
    if (isNaN(fecha.getTime())) {
      return '';
    }
    const cuando = fecha.toLocaleDateString('es-MX');
    return this.cicloCerrado(ot)
      ? 'El ciclo cerró el ' + cuando
      : 'Programado para cerrar el ' + cuando;
  }



  // Muestra "44/26" a partir de numero=44, anio=2026
  formatearNumeroOT(ot: any): string {
    if (!ot?.numero || !ot?.anio) return '';
    return `${ot.numero}/${String(ot.anio).slice(-2)}`;
  }

  abrirFormulario() {
    this.editando = false;
    this.idOrdenSeleccionada = null;
    this.errorModal = '';
    this.nuevaOrden = {
      numero: null,
      anio: new Date().getFullYear(),
      escuela: '',
      siglas: '',
      carreraTexto: '',
      modalidad: '',
      diasCobro: '',
      grupo: '',
      generacion: '',
      idVendedor: null,
      fechaEntrega: '',
      fechaCierreCiclo: '',
    };

    // Una O.T. nueva no tiene nada que recorrer: su primera fecha ES la
    // original. El campo nace libre y sin casilla.
    this.limpiarRecorrimiento();

    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = false;
    this.idOrdenSeleccionada = null;
    this.errorModal = '';
    this.limpiarRecorrimiento();
  }

  private limpiarRecorrimiento() {
    this.recorrimientoActivo = false;
    this.entregaYaRecorrida = false;
    this.fechaEntregaAlAbrir = '';
    this.fechaEntregaOriginal = '';
  }

  guardarOrden() {
    const o = this.nuevaOrden;
    this.errorModal = '';

    // El negocio escribe "44/26", pero se guarda el año completo (2026).
    if (o.anio !== null && o.anio < 100) {
      o.anio = 2000 + o.anio;
    }

    if (!o.numero || !o.anio) {
      this.errorModal = 'El número y el año de la O.T. son obligatorios.';
      return;
    }
    if (!o.escuela || !o.escuela.trim()) {
      this.errorModal = 'La escuela es obligatoria.';
      return;
    }
    if (!o.carreraTexto || !o.carreraTexto.trim()) {
      this.errorModal = 'La carrera es obligatoria.';
      return;
    }
    // La columna fecha_entrega ya es NOT NULL en la base. Sin esta línea el
    // servidor igual la rechaza (validarFechaEntrega lanza un 400 legible),
    // pero es un viaje de ida y vuelta para nada.
    if (!o.fechaEntrega) {
      this.errorModal = 'La fecha de entrega es obligatoria.';
      return;
    }

    const ordenParaEnviar: any = {
      numero: o.numero,
      anio: o.anio,
      escuela: o.escuela.trim(),
      siglas: o.siglas || null,
      carreraTexto: o.carreraTexto.trim(),
      modalidad: o.modalidad || null,
      diasCobro: o.diasCobro || null,
      grupo: o.grupo || null,
      generacion: o.generacion || null,
      vendedor: o.idVendedor
        ? { idVendedor: o.idVendedor }
        : null,
      fechaEntrega: o.fechaEntrega || null,
      fechaCierreCiclo: o.fechaCierreCiclo || null,
      activo: true,
    };

    if (this.editando && this.idOrdenSeleccionada) {
      this.ordenService.actualizar(this.idOrdenSeleccionada, ordenParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerOrdenes();
        },
        error: (err) => {
          this.errorModal = err?.error || 'Error al actualizar la orden de trabajo.';
          this.cdr.detectChanges();
        },
      });
    } else {
      this.ordenService.crear(ordenParaEnviar).subscribe({
        next: () => {
          this.cerrarModal();
          this.obtenerOrdenes();
        },
        error: (err) => {
          this.errorModal = err?.error || 'Error al registrar la orden de trabajo.';
          this.cdr.detectChanges();
        },
      });
    }
  }

  prepararEdicion(ot: any) {
    this.editando = true;
    this.idOrdenSeleccionada = ot.idOrdenTrabajo;
    this.errorModal = '';
    this.nuevaOrden = {
      numero: ot.numero ?? null,
      anio: ot.anio ?? new Date().getFullYear(),
      escuela: ot.escuela ?? '',
      siglas: ot.siglas ?? '',
      carreraTexto: ot.carreraTexto ?? '',
      modalidad: ot.modalidad ?? '',
      diasCobro: ot.diasCobro ?? '',
      grupo: ot.grupo ?? '',
      generacion: ot.generacion ?? '',
      idVendedor: ot.vendedor?.idVendedor ?? null,
      fechaEntrega: this.soloFecha(ot.fechaEntrega),
      fechaCierreCiclo: this.soloFecha(ot.fechaCierreCiclo),
    };

    // Se guarda la fecha con la que abrió el modal ANTES de que el usuario
    // pueda tocarla. Es el punto de comparación del rojo.
    this.fechaEntregaAlAbrir = this.nuevaOrden.fechaEntrega;
    this.fechaEntregaOriginal = this.soloFecha(ot.fechaEntregaOriginal);
    this.entregaYaRecorrida = ot.entregaRecorrida === true;

    // Si ya está recorrida, la casilla nace palomeada y bloqueada: es un
    // letrero de estado, no un interruptor. Apagarla desde aquí no serviría
    // de nada porque el servidor ignora ese campo, y la pantalla estaría
    // prometiendo algo que no va a pasar.
    this.recorrimientoActivo = this.entregaYaRecorrida;

    this.mostrarModal = true;
  }

  // ===================== RECORRIMIENTO: HELPERS =====================

  /**
   * Recorta lo que venga del backend a 'AAAA-MM-DD'.
   *
   * Los <input type="date"> solo entienden ese formato exacto: si les llega
   * un ISO con hora, el campo aparece VACÍO sin avisar. Y si aquí llegara
   * vacío, guardar tiraría la fecha de entrega de esa O.T.
   */
  private soloFecha(valor: any): string {
    if (!valor) return '';
    return String(valor).substring(0, 10);
  }

  /**
   * Formatea 'AAAA-MM-DD' a 'DD/MM/AAAA' partiendo el texto, sin construir
   * un Date.
   *
   * OJO: aquí NO se puede usar el pipe date de Angular ni new Date(texto).
   * Los dos interpretan '2026-08-28' como medianoche UTC, y en México
   * (UTC-6) eso cae el 27 a las 18:00. Toda la columna de entregas se
   * correría un día hacia atrás.
   */
  formatearFecha(valor: any): string {
    const texto = this.soloFecha(valor);
    if (texto.length !== 10) return '';
    const [anio, mes, dia] = texto.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  /**
   * ¿El campo de la fecha está trabado?
   *
   * - Alta: nunca. Una O.T. nueva captura su fecha libremente.
   * - Edición sin recorrer: trabado hasta que palomeen "Recorrimiento".
   * - Edición ya recorrida: libre (la casilla ya viene palomeada).
   */
  fechaEntregaBloqueada(): boolean {
    if (!this.editando) return false;
    return !this.recorrimientoActivo;
  }

  /** La casilla se ve deshabilitada cuando solo es un letrero de estado. */
  casillaBloqueada(): boolean {
    return this.entregaYaRecorrida;
  }

  /**
   * ¿La fecha del modal se pinta de rojo?
   *
   * Cuelga de la COMPARACIÓN, no de la casilla. Si el usuario palomea
   * "Recorrimiento" y no mueve la fecha, o la adelanta, no hay rojo:
   * el servidor tampoco va a marcar nada y la pantalla no debe prometer
   * lo contrario.
   *
   * Las cadenas 'AAAA-MM-DD' se comparan con > tal cual: al tener ancho
   * fijo y el año adelante, el orden de texto es el orden de calendario.
   * Es la misma regla que fechaNueva.isAfter(fechaAnterior) del servidor.
   */
  entregaEnRojo(): boolean {
    if (this.entregaYaRecorrida) return true;

    const antes = this.fechaEntregaAlAbrir;
    const ahora = this.nuevaOrden.fechaEntrega;
    if (!antes || !ahora) return false;

    return ahora > antes;
  }

  /** Lo mismo, para un renglón de la LISTA. Aquí manda la base, no el modal. */
  esRecorrida(ot: any): boolean {
    return ot?.entregaRecorrida === true;
  }

  /**
   * Texto de ayuda de la columna Entrega.
   * La original es la PRIMERA prometida, la que trae la escuela en el papel,
   * no la del recorrimiento anterior.
   */
  tituloEntrega(ot: any): string {
    if (!this.esRecorrida(ot)) return '';
    const original = this.formatearFecha(ot?.fechaEntregaOriginal);
    return original
      ? 'Entrega recorrida. Era el ' + original
      : 'Entrega recorrida';
  }

  eliminarOrden(id: number) {
    if (confirm('¿Estás seguro de eliminar esta orden de trabajo?')) {
      this.ordenService.eliminar(id).subscribe({
        next: () => this.obtenerOrdenes(),
        error: () => alert('No se pudo eliminar la orden de trabajo.'),
      });
    }
  }
}