import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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

  /** El acta guardada de ese día. Null = todavía no se entrega. */
  cierreGuardado: any = null;

  /**
   * SOLO JEFE: todos los cortes del día, cada uno con su dueño y su estado.
   */
  cortesDelDia: any[] = [];

  /**
   * LO QUE SE VA A IMPRIMIR, y solo eso.
   *
   *   corteImpreso  -> los movimientos que ESE corte se llevó.
   *   cierreImpreso -> su acta: quién firma, esperado, contado, diferencia.
   *
   * Viven aparte de corte/cierreGuardado a propósito. Antes la hoja se
   * armaba con lo que la pantalla tuviera puesto, y por eso el papel de
   * un corte salía con los movimientos del día completo contra el arqueo
   * de una sola persona. Ahora la hoja se llena SOLO al momento de
   * imprimir, con lo que devuelve el servidor para ese corte.
   */
  corteImpreso: any = null;
  cierreImpreso: any = null;

  /**
   * LA HOJA DEL DÍA COMPLETO. Solo el Jefe.
   *
   * Es el equivalente del papel de siempre: los movimientos de TODOS con
   * las columnas por destinatario y el bloque de comisiones cuadrando al
   * 10%. Aquí las comisiones SÍ van, al revés que en la hoja individual:
   * esta hoja tiene el día entero, así que el porcentaje de cada
   * vendedora sale sobre todo lo que vendió y no partido entre cortes.
   *
   * Se arma con lo que el Jefe ya tiene en pantalla, así que NO necesita
   * pedirle nada al servidor.
   */
  imprimiendoDia = false;

  // OJO: esto es cortina, no chapa. El backend es quien manda.
  esJefe: boolean = localStorage.getItem('rolUsuario') === 'Jefe';

  /**
   * El Administrador entrega los cortes que necesite en un mismo día, por
   * el volumen de folios. Es el ÚNICO rol que puede.
   */
  esAdministrador: boolean = localStorage.getItem('rolUsuario') === 'Administrador';

  cargando = false;
  guardando = false;
  imprimiendo = false;
  error = '';
  yaConsulto = false;

  // Conteo físico del cajón (lo teclea quien entrega, para comparar)
  conteoFisico: number | null = null;
  comentarioCierre = '';

  constructor(
    private corteService: CorteDia,
    private cierreService: CierreCajaService,
    private ruta: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // El calendario del Jefe manda la fecha en la dirección:
    // /cierre-caja?fecha=2026-09-09. Si no viene, se abre en hoy.
    const fechaPedida = this.ruta.snapshot.queryParamMap.get('fecha');

    this.fecha = this.esFechaValida(fechaPedida) ? fechaPedida! : this.hoy();
    this.generar();
  }

  irHoy() {
    this.fecha = this.hoy();
    this.generar();
  }

  /**
   * La fecha de hoy en formato aaaa-mm-dd, armada a mano.
   *
   * NO se usa toISOString(): esa función convierte a UTC, y en Veracruz
   * (UTC-6) eso adelanta la fecha un día a partir de las 6 de la tarde.
   * En un corte de caja eso no es un detalle: es cortar el día equivocado.
   */
  private hoy(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /** Solo se acepta aaaa-mm-dd; cualquier otra cosa en la dirección se ignora. */
  private esFechaValida(valor: string | null): boolean {
    return !!valor && /^\d{4}-\d{2}-\d{2}$/.test(valor);
  }

  /**
   * Arma la pantalla. Hay dos caminos, y no son el mismo:
   *
   *  - JEFE: ve el día COMPLETO de todos. Él no entrega corte, revisa.
   *  - MOSTRADOR y ADMINISTRADOR: ven SU corte pendiente de entregar.
   */
  generar() {
    if (!this.fecha) {
      this.error = 'Selecciona una fecha.';
      return;
    }

    this.cargando = true;
    this.error = '';
    this.corte = null;
    this.cierreGuardado = null;
    this.cortesDelDia = [];
    this.corteImpreso = null;
    this.cierreImpreso = null;
    this.imprimiendoDia = false;
    this.conteoFisico = null;
    this.comentarioCierre = '';

    const peticion = this.esJefe
      ? this.corteService.obtener(this.fecha)
      : this.cierreService.miCorte(this.fecha);

    peticion.subscribe({
      next: (data) => {
        this.corte = data;
        this.cargando = false;
        this.yaConsulto = true;
        this.cdr.detectChanges();
        this.consultarCierreGuardado();
      },
      error: (err) => {
        this.cargando = false;
        this.yaConsulto = true;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo generar el corte. Revisa la consola del navegador.';
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * ¿Ya se entregó, y con qué números?
   *
   * Para el Jefe la pregunta es del día y en plural. Para los demás la
   * pregunta es SUYA. Un solo origen de verdad: miCorteEntregado().
   */
  consultarCierreGuardado() {
    if (this.esJefe) {
      this.cierreService.listarDelDia(this.fecha).subscribe({
        next: (lista) => {
          this.cortesDelDia = lista ?? [];

          // Con UN solo corte se selecciona solo. Con VARIOS no se elige
          // ninguno a propósito: escoger por el Jefe es el bug que tenía
          // buscarPorFecha().
          this.cierreGuardado =
            this.cortesDelDia.length === 1 ? this.cortesDelDia[0] : null;

          this.cdr.detectChanges();
        },
        error: () => {
          this.cortesDelDia = [];
          this.cierreGuardado = null;
          this.cdr.detectChanges();
        },
      });
      return;
    }

    // Si todavía no entrego, el servidor responde 204 y aquí llega null.
    // No haber entregado no es un error. Un corte REABIERTO también llega
    // null: está devuelto para corregirse, hay que poder volver a capturar.
    this.cierreService.miCorteEntregado(this.fecha).subscribe({
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

  // ---------- La lista del Jefe ----------

  /** El Jefe abre el corte que quiere revisar. */
  seleccionarCorte(corte: any) {
    this.cierreGuardado = corte;
    this.cdr.detectChanges();
  }

  esCorteSeleccionado(corte: any): boolean {
    return (
      this.cierreGuardado != null &&
      corte != null &&
      this.cierreGuardado.idCierreCaja === corte.idCierreCaja
    );
  }

  hayVariosCortes(): boolean {
    return this.cortesDelDia.length > 1;
  }

  /**
   * Vuelve a pedir la lista después de autorizar, reabrir o eliminar, y
   * deja abierto el mismo corte que el Jefe traía (si sigue existiendo).
   */
  private refrescarCortesDelDia(idSeleccionado: number | null) {
    if (!this.esJefe) {
      return;
    }

    this.cierreService.listarDelDia(this.fecha).subscribe({
      next: (lista) => {
        this.cortesDelDia = lista ?? [];
        this.cierreGuardado =
          idSeleccionado != null
            ? this.cortesDelDia.find((c) => c.idCierreCaja === idSeleccionado) ?? null
            : null;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      },
    });
  }

  // ---------- Estados de la pantalla ----------

  /**
   * ¿Modo "ya entregué" (panel) o modo captura (formulario)?
   *
   * Tener un corte entregado NO basta para cerrar la pantalla: el
   * Administrador entrega a media jornada y sigue cobrando. Si al volver
   * tiene movimientos nuevos, necesita capturar el SIGUIENTE corte.
   *
   * Para el Mostrador no cambia nada: entrega uno al día.
   */
  estaCerrado(): boolean {
    if (this.cierreGuardado === null) {
      return false;
    }
    if (this.esAdministrador && !this.sinMovimientos()) {
      return false;
    }
    return true;
  }

  /** ¿Este sería un corte ADICIONAL del mismo día? */
  esCorteAdicional(): boolean {
    return (
      this.cierreGuardado !== null &&
      this.esAdministrador &&
      !this.sinMovimientos()
    );
  }

  estaAutorizado(): boolean {
    return this.cierreGuardado?.estado === 'AUTORIZADO';
  }

  estaEnviado(): boolean {
    return this.cierreGuardado?.estado === 'ENVIADO';
  }

  /** Devuelto para corregirse. No cuenta como entregado. */
  estaReabierto(): boolean {
    return this.cierreGuardado?.estado === 'REABIERTO';
  }

  /** El color del badge de estado, tanto en la tabla como en el panel. */
  claseEstado(estado: string): string {
    if (estado === 'AUTORIZADO') return 'bg-success';
    if (estado === 'ENVIADO') return 'bg-warning text-dark';
    return 'bg-secondary';
  }

  // ---------- Acciones ----------

  hayDiferencia(): boolean {
    const dif = this.diferencia();
    return dif !== null && Math.abs(dif) >= 0.01;
  }

  puedeEnviar(): boolean {
    if (this.esJefe) {
      return false;
    }
    if (this.estaCerrado() || this.guardando) {
      return false;
    }
    if (this.conteoFisico === null || this.conteoFisico < 0) {
      return false;
    }
    if (this.hayDiferencia() && !this.comentarioCierre.trim()) {
      return false;
    }
    if (this.sinMovimientos()) {
      return false;
    }
    return true;
  }

  /** ¿Tengo algo que cortar? Con cero movimientos no hay corte que entregar. */
  sinMovimientos(): boolean {
    if (this.esJefe) {
      return false;
    }
    const n = (this.corte?.idsPagos?.length ?? 0)
      + (this.corte?.idsContratos?.length ?? 0)
      + (this.corte?.idsEgresos?.length ?? 0);
    return n === 0;
  }

  enviarCierre() {
    if (!this.puedeEnviar()) {
      return;
    }

    const dif = this.diferencia();

    let mensaje: string;
    if (this.hayDiferencia() && dif !== null) {
      mensaje = `Tu caja no cuadra por $${Math.abs(dif).toFixed(2)}. ¿Entregar el corte de todos modos?`;
    } else if (this.esCorteAdicional()) {
      mensaje = '¿Entregar otro corte de este día con los movimientos nuevos? '
        + 'El corte anterior no se toca.';
    } else {
      mensaje = '¿Entregar tu corte de este día? Después solo el jefe puede reabrirlo.';
    }

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
          this.generar();
        },
        error: (err) => {
          this.guardando = false;
          this.error = err.error && typeof err.error === 'string'
            ? err.error
            : 'No se pudo entregar el corte. Revisa la consola del navegador.';
          this.cdr.detectChanges();
        },
      });
  }

  autorizarCierre() {
    if (!this.cierreGuardado?.idCierreCaja || !this.esJefe) {
      return;
    }
    if (!confirm('¿Autorizar este corte? Queda como acta cerrada.')) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.cierreService.autorizar(this.cierreGuardado.idCierreCaja).subscribe({
      next: (data) => {
        this.guardando = false;
        this.cierreGuardado = data;
        this.refrescarCortesDelDia(data?.idCierreCaja ?? null);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardando = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo autorizar el corte.';
        this.cdr.detectChanges();
      },
    });
  }

  reabrirCierre() {
    if (!this.cierreGuardado?.idCierreCaja || !this.esJefe) {
      return;
    }
    if (!confirm('¿Reabrir este corte? Sus movimientos se sueltan para poder corregirlos.')) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.cierreService.reabrir(this.cierreGuardado.idCierreCaja).subscribe({
      next: (data) => {
        this.guardando = false;
        this.cierreGuardado = data;
        this.refrescarCortesDelDia(data?.idCierreCaja ?? null);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardando = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo reabrir el corte.';
        this.cdr.detectChanges();
      },
    });
  }

  eliminarCierre() {
    if (!this.cierreGuardado?.idCierreCaja || !this.esJefe) {
      return;
    }
    if (!confirm('¿Eliminar este corte para poder rehacerlo desde cero?')) {
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
        this.refrescarCortesDelDia(null);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardando = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo eliminar el corte.';
        this.cdr.detectChanges();
      },
    });
  }

  // ---------- La hoja del corte ----------
  //
  // Todos estos reciben una FUENTE opcional. Sin argumento leen lo que
  // está en pantalla (this.corte); con argumento leen el corte impreso.
  // Así el papel y la pantalla usan las mismas funciones sin que el papel
  // tenga que mirar lo que la pantalla trae puesto — que era exactamente
  // el bug: la hoja de un corte salía con los movimientos del día entero.

  esOficina(fila: any): boolean {
    return fila?.idUsuario === null || fila?.idUsuario === undefined;
  }

  /**
   * Las columnas del papel: una por cada destinatario con movimiento.
   *
   * El Jefe las saca del reporte de comisiones. En un corte personal no
   * hay comisiones a propósito, así que se deducen de los renglones.
   */
  columnas(fuente?: any): any[] {
    const c = fuente ?? this.corte;

    if (c?.ingresos?.filas) {
      return c.ingresos.filas;
    }

    const renglones: any[] = c?.renglones || [];
    const vistos = new Map<any, any>();

    for (const r of renglones) {
      if (r?.esCortesia) {
        continue; // las cortesías tienen su propia columna al final
      }
      const clave = r.idDestinatario ?? null;
      if (!vistos.has(clave)) {
        vistos.set(clave, {
          idUsuario: clave,
          nombre: r.nombreDestinatario || 'Oficina',
        });
      }
    }

    return Array.from(vistos.values());
  }

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

  /**
   * El total de UNA columna: lo que se le cobró a ese destinatario.
   *
   * En el reporte del Jefe el total viene calculado en la fila
   * (montoCobrado). En un corte personal NO: ahí las columnas se deducen
   * de los renglones y no traen total, así que hay que sumarlos.
   *
   * Sin esto, la fila SUMATORIA salía en blanco en la pantalla del
   * Mostrador y en el papel de cada corte: una hoja de dinero con la
   * suma vacía.
   */
  totalDeColumna(columna: any, fuente?: any): number {
    // El reporte del Jefe ya lo trae hecho; no hay que recalcularlo.
    if (columna?.montoCobrado !== null && columna?.montoCobrado !== undefined) {
      return Number(columna.montoCobrado);
    }

    const c = fuente ?? this.corte;
    const renglones: any[] = c?.renglones || [];

    let suma = 0;
    for (const r of renglones) {
      const monto = this.montoEnColumna(r, columna);
      if (monto !== null) {
        suma += Number(monto);
      }
    }
    return suma;
  }

  hayCortesias(fuente?: any): boolean {
    return this.totalCortesias(fuente) > 0;
  }

  totalCortesias(fuente?: any): number {
    const c = fuente ?? this.corte;
    return Number(c?.totalCortesias ?? c?.ingresos?.totalCortesias ?? 0);
  }

  montoCortesia(renglon: any): number | null {
    return renglon?.esCortesia ? renglon.monto : null;
  }

  // ---------- Impresión ----------

  /**
   * ¿Se puede imprimir lo que está abierto?
   *
   * Un corte REABIERTO no se imprime: está devuelto para corregirse, así
   * que no debe existir un papel firmable de él. El servidor también lo
   * rechaza; esto solo evita el viaje.
   */
  puedeImprimir(): boolean {
    return this.estaCerrado() && !this.estaReabierto();
  }

  /** El botón de arriba: imprime el corte que está abierto. */
  imprimir() {
    if (!this.puedeImprimir()) {
      return;
    }
    this.imprimirCorte(this.cierreGuardado);
  }

  /**
   * IMPRIME UN CORTE, el que sea.
   *
   * Pide al servidor los movimientos que ESE corte se llevó, arma la hoja
   * con ellos y manda a la impresora. La pantalla no cambia: la hoja vive
   * en un bloque aparte que solo se ve al imprimir.
   */
  imprimirCorte(cierre: any) {
    if (!cierre?.idCierreCaja || this.imprimiendo) {
      return;
    }
    if (cierre.estado === 'REABIERTO') {
      this.error = 'Ese corte está reabierto para corregirse. '
        + 'No se puede imprimir hasta que lo reenvíen.';
      this.cdr.detectChanges();
      return;
    }

    this.imprimiendo = true;
    this.error = '';

    this.cierreService.detalleDelCorte(cierre.idCierreCaja).subscribe({
      next: (detalle) => {
        this.corteImpreso = detalle;
        this.cierreImpreso = cierre;
        this.imprimiendoDia = false;   // por si venía prendida
        this.imprimiendo = false;

        // Hay que dejar que Angular dibuje la hoja ANTES de llamar a
        // print(); si no, el navegador imprime la página sin ella.
        this.cdr.detectChanges();

        setTimeout(() => {
          window.print();

          // Ya impreso, se limpia: si la hoja se queda cargada, la
          // siguiente impresión podría salir con el corte anterior.
          this.corteImpreso = null;
          this.cierreImpreso = null;
          this.cdr.detectChanges();
        }, 150);
      },
      error: (err) => {
        this.imprimiendo = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo preparar la hoja de ese corte.';
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * IMPRIME LA HOJA DEL DÍA COMPLETO. Solo el Jefe.
   *
   * No pide nada al servidor: usa lo que ya está en pantalla, que es el
   * reporte del día entero con todas las columnas y sus comisiones. Es el
   * equivalente del papel de siempre.
   */
  imprimirDiaCompleto() {
    if (!this.esJefe || !this.corte) {
      return;
    }

    // Las dos hojas comparten el mismo espacio: si quedara prendida la
    // individual, saldrían las dos en el mismo papel.
    this.corteImpreso = null;
    this.cierreImpreso = null;
    this.imprimiendoDia = true;
    this.cdr.detectChanges();

    setTimeout(() => {
      window.print();
      this.imprimiendoDia = false;
      this.cdr.detectChanges();
    }, 150);
  }

  // ---------- El pie de la hoja del día ----------

  /** Cuántos cortes se entregaron ese día. */
  cortesEntregados(): number {
    return this.cortesDelDia.length;
  }

  /** La suma de lo que el sistema esperaba en los cajones. */
  totalEsperadoDelDia(): number {
    return this.cortesDelDia.reduce(
      (suma, c) => suma + Number(c?.efectivoEsperado ?? 0), 0);
  }

  /** La suma de lo que se contó físicamente. */
  totalContadoDelDia(): number {
    return this.cortesDelDia.reduce(
      (suma, c) => suma + Number(c?.efectivoContado ?? 0), 0);
  }

  /** contado - esperado, sumando todos los cortes. */
  totalDiferenciaDelDia(): number {
    return this.totalContadoDelDia() - this.totalEsperadoDelDia();
  }

  /**
   * EFECTIVO QUE TODAVÍA NADIE HA ENTREGADO.
   *
   * El efectivo del día menos los egresos da lo que debería haber salido
   * de los cajones. Si los cortes entregados suman menos que eso, la
   * diferencia es dinero capturado que aún no viaja en ningún corte.
   *
   * Existe porque la hoja mezcla dos fuentes: los movimientos son del día
   * completo y los arqueos son solo de lo entregado. Sin este renglón, el
   * papel tendría una resta sin explicación y parecería un descuadre.
   */
  efectivoSinCortar(): number {
    const esperadoDelDia = this.totalEfectivo() - this.totalEgresos();
    return esperadoDelDia - this.totalEsperadoDelDia();
  }

  hayEfectivoSinCortar(): boolean {
    return Math.abs(this.efectivoSinCortar()) >= 0.01;
  }

  // ---------- Totales ----------
  // Igual que las columnas: sin argumento leen la pantalla, con argumento
  // leen el corte impreso. Cada uno prueba primero el campo del corte
  // personal y cae al del reporte del Jefe.

  totalEgresos(fuente?: any): number {
    const c = fuente ?? this.corte;
    return Number(c?.totalEgresos ?? 0);
  }

  totalEfectivo(fuente?: any): number {
    const c = fuente ?? this.corte;
    return Number(c?.totalEfectivo ?? c?.ingresos?.totalEfectivo ?? 0);
  }

  totalNoEfectivo(fuente?: any): number {
    const c = fuente ?? this.corte;
    return Number(c?.totalNoEfectivo ?? c?.ingresos?.totalNoEfectivo ?? 0);
  }

  totalIngresos(fuente?: any): number {
    const c = fuente ?? this.corte;
    return Number(c?.totalIngresos ?? c?.ingresos?.totalCobrado ?? 0);
  }

  /**
   * SOLO tiene valor para el Jefe. En un corte personal devuelve 0 a
   * propósito: la comisión es de la VENDEDORA de la O.T., y esta hoja es
   * de quien RECIBIÓ el dinero. Son personas distintas.
   *
   * Por eso el bloque de COMISIONES no va en la hoja de un corte
   * individual, pero SÍ en la del día completo: ahí el porcentaje sale
   * sobre todo lo que vendió cada quien, no partido entre cortes.
   */
  totalComisiones(fuente?: any): number {
    const c = fuente ?? this.corte;
    return Number(c?.ingresos?.totalComisiones ?? 0);
  }

  /** Fecha en dd/mm/aaaa. Sin argumento usa la de la pantalla. */
  fechaLarga(fechaIso?: string): string {
    const f = fechaIso ?? this.fecha;
    if (!f) return '';
    const [anio, mes, dia] = f.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  // Diferencia entre lo que se contó a mano y lo que el sistema espera
  diferencia(): number | null {
    if (this.conteoFisico === null || !this.corte) {
      return null;
    }
    return Number(this.conteoFisico) - Number(this.corte.efectivoEnCaja ?? 0);
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