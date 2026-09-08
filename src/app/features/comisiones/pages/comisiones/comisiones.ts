import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Comision } from '../../../../core/services/comision';
import { Egreso } from '../../../../core/services/egreso';
import {
  FolioNoUtilizadoService,
  FolioControl,
  TipoFolio,
} from '../../../../core/services/folio-no-utilizado';

/** Cuál panel está abierto. Los tres últimos son los talonarios. */
type PanelReporte =
  | 'ingresos'
  | 'comisiones'
  | 'cortesias'
  | 'devoluciones'
  | 'egresos'
  | 'folios-recibos'
  | 'folios-contratos'
  | 'folios-adicionales';

@Component({
  selector: 'app-comisiones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './comisiones.html',
  styleUrl: './comisiones.css',
})
export class Comisiones {
  desde = '';
  hasta = '';

  reporte: any = null;
  listaEgresos: any[] = [];

  // ===================== CONTROL DE FOLIOS =====================
  //
  // Tres talonarios INDEPENDIENTES: cada tipo lleva su propio recorrido
  // por el abecedario (A a Y; la Z está apartada para devoluciones). El
  // folio C2672 de recibos y el de contratos son papeles distintos, así
  // que nunca se mezclan en la misma lista.
  //
  // VERDE = el folio se usó. ROJO = está marcado como no utilizado.
  // El color NO depende del dinero ni del estado del contrato: un
  // contrato cancelado que sí se cobró va verde.

  foliosRecibos: FolioControl[] = [];
  foliosContratos: FolioControl[] = [];
  foliosAdicionales: FolioControl[] = [];

  /** El endpoint del control está restringido al Jefe en el backend. */
  esJefe: boolean = localStorage.getItem('rolUsuario') === 'Jefe';

  /**
   * La serie elegida en cada talonario, o null para ver todas.
   *
   * Se guarda UNA por talonario y no una sola compartida: si el jefe está
   * viendo la serie C de recibos y se cambia a contratos, ahí la C puede
   * ni existir y la lista saldría vacía sin explicación.
   */
  serieRecibos: string | null = null;
  serieContratos: string | null = null;
  serieAdicionales: string | null = null;

  cargando = false;
  error = '';
  yaConsulto = false;

  /**
   * Cuál de los cinco botones está abierto.
   * Arranca en ingresos porque es el número que más se consulta.
   */
  reporteActivo: PanelReporte = 'ingresos';

  /**
   * Qué hoja se está mandando a la impresora.
   * En null cuando no se está imprimiendo, que es casi siempre.
   */
  imprimiendo: 'comisiones' | 'devoluciones' | null = null;

  constructor(
    private comisionService: Comision,
    private egresoService: Egreso,
    private folioService: FolioNoUtilizadoService,
    private cdr: ChangeDetectorRef
  ) {
    // Por defecto: del primer día del mes actual a hoy.
    const hoy = new Date();
    this.desde = this.aTexto(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    this.hasta = this.aTexto(hoy);
  }

  /**
   * Pasa un Date a 'AAAA-MM-DD' en hora LOCAL.
   *
   * OJO: aquí NO sirve toISOString(), que era lo que había. Devuelve UTC,
   * y en México (UTC-6) a partir de las 6 de la tarde ya es el día
   * siguiente. El botón "Hoy" ponía la fecha de MAÑANA y el reporte salía
   * vacío justo cuando más se consulta, al cerrar el día.
   */
  private aTexto(d: Date): string {
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  generar() {
    this.error = '';

    if (!this.desde || !this.hasta) {
      this.error = 'Selecciona la fecha inicial y la final.';
      return;
    }
    if (this.hasta < this.desde) {
      this.error = 'La fecha final no puede ser anterior a la inicial.';
      return;
    }

    this.cargando = true;
    this.yaConsulto = true;

    this.comisionService.reporte(this.desde, this.hasta).subscribe({
      next: (data) => {
        this.reporte = data;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error || 'No se pudo generar el reporte.';
        this.reporte = null;
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });

    this.cargarFolios();

    // Los egresos viven en su propio módulo, así que se piden aparte
    // con el mismo rango de fechas.
    this.egresoService.listarPorRango(this.desde, this.hasta).subscribe({
      next: (data) => {
        this.listaEgresos = data || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.listaEgresos = [];
        this.cdr.detectChanges();
      },
    });
  }

  rangoHoy() {
    const hoy = this.aTexto(new Date());
    this.desde = hoy;
    this.hasta = hoy;
    this.generar();
  }

  rangoMesActual() {
    const hoy = new Date();
    this.desde = this.aTexto(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    this.hasta = this.aTexto(hoy);
    this.generar();
  }

  // ===================== CONTROL DE FOLIOS =====================

  /**
   * Pide los tres talonarios con el mismo rango de fechas.
   *
   * Van por separado a propósito: si uno falla, los otros dos siguen
   * saliendo. Y si el usuario no es Jefe ni se piden, porque el servidor
   * responde 403 y no tiene caso llenar la consola de errores.
   */
  private cargarFolios() {
    if (!this.esJefe) {
      this.foliosRecibos = [];
      this.foliosContratos = [];
      this.foliosAdicionales = [];
      return;
    }

    // Al traer datos nuevos se sueltan las letras elegidas: la serie C
    // podría no existir en el rango de fechas que se acaba de pedir, y la
    // tabla saldría vacía sin que se vea por qué.
    this.serieRecibos = null;
    this.serieContratos = null;
    this.serieAdicionales = null;

    this.pedirFolios('RECIBO', (lista) => (this.foliosRecibos = lista));
    this.pedirFolios('CONTRATO', (lista) => (this.foliosContratos = lista));
    this.pedirFolios('ADICIONAL', (lista) => (this.foliosAdicionales = lista));
  }

  private pedirFolios(tipo: TipoFolio, guardar: (lista: FolioControl[]) => void) {
    this.folioService.control(tipo, this.desde, this.hasta).subscribe({
      next: (lista) => {
        guardar(lista || []);
        this.cdr.detectChanges();
      },
      error: () => {
        guardar([]);
        this.cdr.detectChanges();
      },
    });
  }

  /** La lista que le toca a cada panel. */
  foliosDe(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL'): FolioControl[] {
    if (cual === 'RECIBO') {
      return this.foliosRecibos;
    }
    if (cual === 'CONTRATO') {
      return this.foliosContratos;
    }
    return this.foliosAdicionales;
  }

  /** Cuántos rojos hay. Es el número que importa ver de un vistazo. */
  cuantosRojos(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL'): number {
    return this.foliosDe(cual).filter((f) => !f.usado).length;
  }

  /** Cuántos verdes hay. */
  cuantosVerdes(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL'): number {
    return this.foliosDe(cual).filter((f) => f.usado).length;
  }

  // ---------- Filtro por serie (la letra del talonario) ----------

  /**
   * Las letras que EXISTEN en ese talonario, ordenadas.
   *
   * Salen de los datos que ya llegaron; no se le pregunta nada al
   * servidor. Se muestran solo las que tienen algo a propósito: poner las
   * 25 de la A a la Y llenaría la pantalla de botones vacíos y el jefe no
   * sabría cuáles sirven.
   *
   * La letra es el primer carácter del folio, porque el formato es
   * siempre letra + 4 dígitos.
   */
  seriesDe(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL'): string[] {
    const letras = new Set<string>();
    for (const f of this.foliosDe(cual)) {
      const letra = (f?.folio || '').charAt(0).toUpperCase();
      if (letra) {
        letras.add(letra);
      }
    }
    return Array.from(letras).sort();
  }

  /** Cuántos folios hay en esa serie, para el número del botón. */
  cuantosEnSerie(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL', letra: string): number {
    return this.foliosDe(cual).filter(
      (f) => (f?.folio || '').charAt(0).toUpperCase() === letra
    ).length;
  }

  /** La serie elegida hoy en ese talonario. */
  serieDe(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL'): string | null {
    if (cual === 'RECIBO') {
      return this.serieRecibos;
    }
    if (cual === 'CONTRATO') {
      return this.serieContratos;
    }
    return this.serieAdicionales;
  }

  /** Elegir una letra. Volver a picarle a la misma la quita. */
  elegirSerie(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL', letra: string | null) {
    const nueva = this.serieDe(cual) === letra ? null : letra;

    if (cual === 'RECIBO') {
      this.serieRecibos = nueva;
    } else if (cual === 'CONTRATO') {
      this.serieContratos = nueva;
    } else {
      this.serieAdicionales = nueva;
    }
  }

  /**
   * La lista que se pinta en la tabla: el talonario completo, o solo la
   * serie elegida.
   *
   * El orden ya viene del servidor (abecedario y de menor a mayor) y
   * filtrar no lo altera, porque quitar renglones no reacomoda los que
   * quedan.
   */
  foliosVisibles(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL'): FolioControl[] {
    const serie = this.serieDe(cual);
    const lista = this.foliosDe(cual);

    if (!serie) {
      return lista;
    }
    return lista.filter(
      (f) => (f?.folio || '').charAt(0).toUpperCase() === serie
    );
  }

  /** Rojos de lo que se está viendo, ya filtrado. */
  rojosVisibles(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL'): number {
    return this.foliosVisibles(cual).filter((f) => !f.usado).length;
  }

  /** Verdes de lo que se está viendo, ya filtrado. */
  verdesVisibles(cual: 'RECIBO' | 'CONTRATO' | 'ADICIONAL'): number {
    return this.foliosVisibles(cual).filter((f) => f.usado).length;
  }

  esOficina(fila: any): boolean {
    return fila?.idUsuario == null;
  }

  // ---------- Impresión ----------

  imprimirComisiones() {
    this.mandarAImpresora('comisiones');
  }

  imprimirDevoluciones() {
    this.mandarAImpresora('devoluciones');
  }

  /**
   * Primero se marca cuál hoja toca, se deja que Angular la dibuje,
   * y hasta entonces se llama a la impresora. Sin esa pausa el
   * navegador imprimiría antes de que la hoja exista y saldría en blanco.
   */
  private mandarAImpresora(cual: 'comisiones' | 'devoluciones') {
    this.imprimiendo = cual;
    this.cdr.detectChanges();

    setTimeout(() => {
      window.print();
      this.imprimiendo = null;
      this.cdr.detectChanges();
    });
  }

  // ---------- Los cinco botones ----------

  abrir(cual: PanelReporte) {
    this.reporteActivo = cual;
  }

  estaAbierto(cual: string): boolean {
    return this.reporteActivo === cual;
  }

  // ---------- Totales de cada botón ----------

  totalIngresos(): number {
    return Number(this.reporte?.totalIngresos ?? 0);
  }

  totalComisiones(): number {
    return Number(this.reporte?.totalComisiones ?? 0);
  }

  totalCortesias(): number {
    return Number(this.reporte?.totalCortesias ?? 0);
  }

  totalDevoluciones(): number {
    return Number(this.reporte?.totalDevoluciones ?? 0);
  }

  /** Los egresos se suman en el navegador porque vienen de otro módulo. */
  totalEgresos(): number {
    return (this.listaEgresos || []).reduce(
      (suma, e) => suma + Number(e?.monto ?? 0),
      0
    );
  }

  // ---------- Conteos para el subtítulo de cada botón ----------

  cuantasDevoluciones(): number {
    return (this.reporte?.devoluciones || []).length;
  }

  cuantasCortesias(): number {
    return (this.reporte?.cortesias || []).length;
  }

  cuantosEgresos(): number {
    return (this.listaEgresos || []).length;
  }

  cuantasVendedoras(): number {
    return (this.reporte?.filas || []).length;
  }

  // ---------- Listas para las tablas ----------

  ingresosPorModalidad(): any[] {
    return this.reporte?.ingresosPorModalidad || [];
  }

  devoluciones(): any[] {
    return this.reporte?.devoluciones || [];
  }

  cortesias(): any[] {
    return this.reporte?.cortesias || [];
  }

  /**
   * El dinero que realmente quedó: ingresos, menos lo que se regaló,
   * menos lo que se devolvió. Es la cuenta que hace la contadora,
   * así que mejor que la haga el sistema y no ella a mano.
   */
  dineroRealQueEntro(): number {
    return this.totalIngresos() - this.totalCortesias() - this.totalDevoluciones();
  }
}