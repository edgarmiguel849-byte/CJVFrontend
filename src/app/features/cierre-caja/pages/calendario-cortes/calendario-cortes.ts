import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CierreCaja as CierreCajaService } from '../../../../core/services/cierre-caja';

/**
 * Un cuadrito del calendario. Puede ser un día real o un hueco de relleno
 * al principio del mes (para que el día 1 caiga en su columna correcta).
 */
interface DiaDelMes {
  /** null = hueco de relleno, no es un día de este mes. */
  fecha: string | null;
  numero: number;
  color: string;
  esDomingo: boolean;
  esHoy: boolean;
  totalCortes: number;
  autorizados: number;
}

/**
 * EL CALENDARIO DEL JEFE: un mes de un vistazo, con el semáforo de cada día.
 *
 * Es pantalla de BÚSQUEDA, no de trabajo: sirve para contestar "¿qué días
 * me faltan por revisar?". Al picar un día te manda a Cierre de Caja con
 * esa fecha ya cargada, que es donde sí se autoriza.
 *
 * LOS COLORES los decide el SERVIDOR, no esta pantalla:
 *   VERDE    -> todos los cortes de ese día están autorizados.
 *   AMARILLO -> unos sí y otros no, o hay alguno reabierto.
 *   ROJO     -> hay cortes y ninguno autorizado.
 *   GRIS     -> no hay ningún corte. Lo pone esta pantalla, por ausencia:
 *               el servidor solo manda los días que SÍ tienen cortes.
 *
 * OJO CON EL GRIS: no distingue "nadie trabajó" de "alguien no entregó".
 * El sistema no sabe quién debía entregar cada día — no hay registro de
 * asistencia — así que no puede reclamar una falta que no conoce. Los
 * domingos se pintan más tenues nada más como referencia visual; los días
 * festivos NO se marcan, porque en esta joyería sí se trabaja en festivo.
 */
@Component({
  selector: 'app-calendario-cortes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendario-cortes.html',
  styleUrl: './calendario-cortes.css',
})
export class CalendarioCortes implements OnInit {

  /** Encabezado de las columnas. Empieza en lunes, como el calendario de pared. */
  readonly nombresDias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  readonly nombresMeses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  /** Mes que se está viendo. OJO: 1-12, como lo dice la gente. */
  anio = 0;
  mes = 0;

  dias: DiaDelMes[] = [];

  cargando = false;
  error = '';

  // Cortina, no chapa: el endpoint trae @PreAuthorize y es quien manda.
  esJefe: boolean = localStorage.getItem('rolUsuario') === 'Jefe';

  constructor(
    private cierreService: CierreCajaService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const hoy = new Date();
    this.anio = hoy.getFullYear();
    this.mes = hoy.getMonth() + 1; // getMonth() da 0-11; aquí se usa 1-12.
    this.cargar();
  }

  // ---------- Moverse entre meses ----------

  mesAnterior() {
    if (this.mes === 1) {
      this.mes = 12;
      this.anio--;
    } else {
      this.mes--;
    }
    this.cargar();
  }

  mesSiguiente() {
    if (this.mes === 12) {
      this.mes = 1;
      this.anio++;
    } else {
      this.mes++;
    }
    this.cargar();
  }

  irAlMesActual() {
    const hoy = new Date();
    this.anio = hoy.getFullYear();
    this.mes = hoy.getMonth() + 1;
    this.cargar();
  }

  tituloDelMes(): string {
    return `${this.nombresMeses[this.mes - 1]} ${this.anio}`;
  }

  // ---------- Armar la cuadrícula ----------

  cargar() {
    this.cargando = true;
    this.error = '';
    this.dias = [];

    this.cierreService.estadosDelMes(this.anio, this.mes).subscribe({
      next: (estados) => {
        this.dias = this.armarMes(estados ?? []);
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargando = false;
        this.error = err.error && typeof err.error === 'string'
          ? err.error
          : 'No se pudo cargar el calendario. Revisa la consola del navegador.';
        // Aunque falle, se dibuja el mes en gris: más vale un calendario
        // vacío que una pantalla en blanco.
        this.dias = this.armarMes([]);
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Convierte la lista del servidor en los cuadritos de la cuadrícula.
   *
   * El servidor solo manda los días CON cortes; los demás se rellenan en
   * gris. Adelante van los huecos necesarios para que el día 1 caiga en
   * su columna: si el mes empieza en jueves, van tres huecos.
   */
  private armarMes(estados: any[]): DiaDelMes[] {
    // Se indexa por fecha para no recorrer la lista en cada día.
    const porFecha = new Map<string, any>();
    for (const e of estados) {
      if (e?.fecha) {
        porFecha.set(e.fecha, e);
      }
    }

    const cuantosDias = new Date(this.anio, this.mes, 0).getDate();

    // getDay() da 0 para domingo. Aquí la semana empieza en lunes, así
    // que domingo se manda al final: 0 -> 6, y los demás bajan uno.
    const diaSemanaDelUno = new Date(this.anio, this.mes - 1, 1).getDay();
    const huecos = diaSemanaDelUno === 0 ? 6 : diaSemanaDelUno - 1;

    const hoy = new Date();
    const claveDeHoy = this.claveFecha(
      hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());

    const celdas: DiaDelMes[] = [];

    for (let i = 0; i < huecos; i++) {
      celdas.push({
        fecha: null, numero: 0, color: 'HUECO',
        esDomingo: false, esHoy: false, totalCortes: 0, autorizados: 0,
      });
    }

    for (let d = 1; d <= cuantosDias; d++) {
      const clave = this.claveFecha(this.anio, this.mes, d);
      const estado = porFecha.get(clave);

      celdas.push({
        fecha: clave,
        numero: d,
        // Sin renglón del servidor = ese día no tuvo cortes.
        color: estado?.color ?? 'GRIS',
        esDomingo: new Date(this.anio, this.mes - 1, d).getDay() === 0,
        esHoy: clave === claveDeHoy,
        totalCortes: estado?.totalCortes ?? 0,
        autorizados: estado?.autorizados ?? 0,
      });
    }

    return celdas;
  }

  /**
   * Fecha en formato aaaa-mm-dd, armada a mano.
   *
   * NO se usa toISOString(): esa función convierte a UTC, y en Veracruz
   * (UTC-6) eso puede recorrer la fecha un día hacia atrás. En un
   * calendario de cortes, un día de más o de menos es un error grave.
   */
  private claveFecha(anio: number, mes: number, dia: number): string {
    const mm = String(mes).padStart(2, '0');
    const dd = String(dia).padStart(2, '0');
    return `${anio}-${mm}-${dd}`;
  }

  // ---------- Pintar ----------

  claseDelDia(dia: DiaDelMes): string {
    if (dia.color === 'HUECO') return 'dia-hueco';
    if (dia.color === 'VERDE') return 'dia-verde';
    if (dia.color === 'AMARILLO') return 'dia-amarillo';
    if (dia.color === 'ROJO') return 'dia-rojo';
    return dia.esDomingo ? 'dia-gris dia-domingo' : 'dia-gris';
  }

  /** Lo que se lee al dejar el puntero encima. */
  tituloDelDia(dia: DiaDelMes): string {
    if (dia.totalCortes === 0) {
      return 'Sin cortes entregados';
    }
    const plural = dia.totalCortes === 1 ? 'corte' : 'cortes';
    return `${dia.totalCortes} ${plural} · ${dia.autorizados} autorizado(s)`;
  }

  // ---------- Ir a trabajar ese día ----------

  /**
   * Abre Cierre de Caja con esa fecha ya puesta. Aquí solo se mira; el
   * trabajo de revisar y autorizar vive en la otra pantalla.
   */
  abrirDia(dia: DiaDelMes) {
    if (!dia.fecha) {
      return;
    }
    this.router.navigate(['/cierre-caja'], {
      queryParams: { fecha: dia.fecha },
    });
  }

  // ---------- Resumen del mes ----------

  contarColor(color: string): number {
    return this.dias.filter((d) => d.color === color).length;
  }
}