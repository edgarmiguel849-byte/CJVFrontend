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
   *
   * Un día puede traer el de Tete entregado y dos del Administrador. Antes
   * se pedía buscarPorFecha(), que devolvía EL PRIMERO: el Jefe autorizaba
   * el de Tete creyendo que revisaba el del Administrador.
   */
  cortesDelDia: any[] = [];

  // OJO: esto es cortina, no chapa. El backend es quien manda; esto solo
  // decide qué se pinta. Alguien puede cambiarlo en DevTools y no le sirve
  // de nada, porque los endpoints del Jefe traen @PreAuthorize.
  esJefe: boolean = localStorage.getItem('rolUsuario') === 'Jefe';

  cargando = false;
  guardando = false;
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
   * O sea que al cerrar la caja en la noche, la pantalla abría en el día
   * siguiente. En un corte de caja eso no es un detalle: es cortar el
   * día equivocado.
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
   *  - JEFE: ve el día COMPLETO de todos (el reporte de siempre). Él no
   *    entrega corte, revisa los de los demás.
   *
   *  - MOSTRADOR y ADMINISTRADOR: ven SU corte — lo que ellos capturaron
   *    ese día y que todavía no viaja en ningún corte entregado. Es lo
   *    que van a contar y firmar.
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
   * Para el Jefe la pregunta es del día y en plural: TODOS los cortes que
   * se entregaron, para que él escoja cuál revisa. Para los demás la
   * pregunta es SUYA: "¿yo ya entregué el mío?". Que Adri haya entregado
   * no le tapa la pantalla a Tete.
   *
   * Ya no se usa yaEntregue() aquí. Ese endpoint solo contesta sí/no, y
   * con un sí no hay de dónde sacar las cifras del acta. Además, tener
   * dos endpoints contestando la misma pregunta abre la puerta a que se
   * contradigan (uno cuenta REABIERTO como entregado y el otro no).
   * Un solo origen de verdad: miCorteEntregado().
   */
  consultarCierreGuardado() {
    if (this.esJefe) {
      this.cierreService.listarDelDia(this.fecha).subscribe({
        next: (lista) => {
          this.cortesDelDia = lista ?? [];

          // Con UN solo corte se selecciona solo: el día normal se ve
          // igual que siempre. Con VARIOS no se elige ninguno a propósito
          // — que el Jefe diga cuál revisa. Escoger por él es exactamente
          // el bug que tenía buscarPorFecha().
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

    // MI corte ya entregado, con sus cifras congeladas: usuario, efectivo
    // esperado, contado, diferencia y comentarios. Es lo que necesitan el
    // panel de "ya entregado" y la hoja impresa.
    //
    // Si todavía no entrego, el servidor responde 204 y aquí llega null:
    // la pantalla se queda en modo de captura. No haber entregado no es
    // un error, por eso el null se trata como caso normal.
    //
    // Un corte REABIERTO también llega como null, a propósito: está
    // devuelto para corregirse, así que hay que poder volver a capturar.
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
   *
   * Sin esto, el renglón de la tabla se queda con el estado viejo aunque
   * el panel de arriba ya diga AUTORIZADO.
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

  estaCerrado(): boolean {
    return this.cierreGuardado !== null;
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

  /** True cuando la caja no cuadra (y por tanto el comentario es obligatorio). */
  hayDiferencia(): boolean {
    const dif = this.diferencia();
    return dif !== null && Math.abs(dif) >= 0.01;
  }

  puedeEnviar(): boolean {
    // El Jefe no entrega corte: revisa y autoriza los de los demás.
    // El backend también lo rechaza; esto solo evita el viaje.
    if (this.esJefe) {
      return false;
    }
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
    // No tiene caso entregar un corte sin un solo movimiento.
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
    const mensaje = this.hayDiferencia() && dif !== null
      ? `Tu caja no cuadra por $${Math.abs(dif).toFixed(2)}. ¿Entregar el corte de todos modos?`
      : '¿Entregar tu corte de este día? Después solo el jefe puede reabrirlo.';

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
          // Se vuelve a pedir el corte: ya entregado, lo que se llevó queda
          // marcado y el cálculo debe salir en ceros. Sin esto, la pantalla
          // seguiría enseñando movimientos que ya se fueron.
          //
          // OJO: generar() limpia cierreGuardado y lo vuelve a pedir con
          // miCorteEntregado(), así que el acta que se acaba de guardar
          // regresa sola. La asignación de arriba es solo para que el panel
          // no parpadee mientras viaja la petición.
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
        // El corte ya no existe: la lista tiene que enterarse, y no hay
        // nada que dejar seleccionado.
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

  esOficina(fila: any): boolean {
    return fila?.idUsuario === null || fila?.idUsuario === undefined;
  }

  /**
   * Las columnas del papel: una por cada destinatario con movimiento.
   *
   * El Jefe las saca del reporte de comisiones, como siempre. En el corte
   * personal no hay comisiones a propósito (son de la VENDEDORA, no de
   * quien recibió el dinero), así que las columnas se deducen de los
   * propios renglones: los destinatarios distintos que aparezcan.
   */
  columnas(): any[] {
    if (this.corte?.ingresos?.filas) {
      return this.corte.ingresos.filas;
    }

    const renglones: any[] = this.corte?.renglones || [];
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

  // ¿Hubo cortesías? Si no, la columna ni se dibuja.
  hayCortesias(): boolean {
    return this.totalCortesias() > 0;
  }

  totalCortesias(): number {
    return Number(
      this.corte?.totalCortesias ?? this.corte?.ingresos?.totalCortesias ?? 0
    );
  }

  // El monto solo se dibuja en la columna de Cortesías si el renglón lo es.
  montoCortesia(renglon: any): number | null {
    return renglon?.esCortesia ? renglon.monto : null;
  }

  // ---------- Impresión ----------

  /**
   * Solo se puede imprimir un corte ya entregado. Si los números todavía
   * se pueden mover, no debe existir una hoja firmable de ellos.
   *
   * BLOQUEO PARA EL JEFE CON VARIOS CORTES: la hoja mezcla dos fuentes.
   * El detalle sale de this.corte (el día COMPLETO, de todos) y el bloque
   * de resumen sale de cierreGuardado (de UNA persona). Con un corte al
   * día las dos cosas coinciden. Con dos, el papel enseñaría todos los
   * movimientos del día contra el arqueo de una sola: un documento
   * firmable que no cuadra. Mejor no imprimir que imprimir mentiras.
   *
   * PENDIENTE: hoy el papel del Mostrador sale con el encabezado y las
   * cifras del acta correctos, pero SIN el detalle de movimientos. Los
   * renglones salen de this.corte, que después de entregar viene vacío a
   * propósito (lo que ya viajó en un corte no se vuelve a listar). Para
   * reconstruirlo hace falta un endpoint que lea cierre_caja_detalle del
   * corte entregado. Ese mismo endpoint resuelve el bloqueo de arriba.
   */
  puedeImprimir(): boolean {
    if (!this.estaCerrado()) {
      return false;
    }
    if (this.esJefe && this.hayVariosCortes()) {
      return false;
    }
    return true;
  }

  imprimir() {
    if (!this.puedeImprimir()) {
      return;
    }
    window.print();
  }

  // ---------- Totales ----------
  // Cada uno lee primero el campo del corte personal y, si no está, cae
  // al del reporte del Jefe. Así los dos caminos usan las mismas funciones
  // y el HTML no se entera de cuál está viendo.

  totalEgresos(): number {
    return Number(this.corte?.totalEgresos ?? 0);
  }

  totalEfectivo(): number {
    return Number(
      this.corte?.totalEfectivo ?? this.corte?.ingresos?.totalEfectivo ?? 0
    );
  }

  totalNoEfectivo(): number {
    return Number(
      this.corte?.totalNoEfectivo ?? this.corte?.ingresos?.totalNoEfectivo ?? 0
    );
  }

  totalIngresos(): number {
    return Number(
      this.corte?.totalIngresos ?? this.corte?.ingresos?.totalCobrado ?? 0
    );
  }

  /**
   * SOLO tiene valor para el Jefe. En un corte personal devuelve 0 a
   * propósito: la comisión es de la VENDEDORA de la O.T., y esta hoja es
   * de quien RECIBIÓ el dinero. Son personas distintas, y mezclarlas le
   * atribuiría a alguien dinero que no es suyo.
   */
  totalComisiones(): number {
    return Number(this.corte?.ingresos?.totalComisiones ?? 0);
  }

  /** Fecha del corte para el encabezado impreso. */
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