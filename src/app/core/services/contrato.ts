import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Contrato {
  private apiUrl = `${environment.apiUrl}/contratos`;

  constructor(private http: HttpClient) {}

  /**
   * Le pregunta al backend en qué modo debe arrancar la pantalla de
   * Contratos, según el rol del usuario logueado.
   *
   * Ejemplo de respuesta para Mostrador con el corte del día abierto:
   *   { modo: 'SOLO_HOY', rol: 'ROLE_MOSTRADOR',
   *     fechaHoy: '2026-08-14', corteHoyTrabado: false }
   */
  obtenerModoPantalla(): Observable<ModoPantallaContratos> {
    return this.http.get<ModoPantallaContratos>(`${this.apiUrl}/modo-pantalla`);
  }

  listar(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  listarConSaldos(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/con-saldos`);
  }

  /**
   * Lista paginada con saldos. Los filtros son opcionales: si van vacíos,
   * no se agregan a la URL y el backend los ignora.
   */
  listarPaginado(
    pagina: number,
    tamanio: number,
    texto?: string,
    desde?: string,
    hasta?: string
  ): Observable<any> {
    let params = new HttpParams()
      .set('pagina', pagina)
      .set('tamanio', tamanio);

    if (texto && texto.trim()) {
      params = params.set('texto', texto.trim());
    }
    if (desde) {
      params = params.set('desde', desde);
    }
    if (hasta) {
      params = params.set('hasta', hasta);
    }

    return this.http.get<any>(`${this.apiUrl}/pagina`, { params });
  }

  /**
   * Igual que listarPaginado pero para la pantalla de Contratos
   * ADICIONALES: pega al endpoint /adicionales/pagina, que el backend
   * filtra para traer SOLO los contratos sin O.T. Mismas reglas de rol.
   */
  listarPaginadoAdicionales(
    pagina: number,
    tamanio: number,
    texto?: string,
    desde?: string,
    hasta?: string
  ): Observable<any> {
    let params = new HttpParams()
      .set('pagina', pagina)
      .set('tamanio', tamanio);

    if (texto && texto.trim()) {
      params = params.set('texto', texto.trim());
    }
    if (desde) {
      params = params.set('desde', desde);
    }
    if (hasta) {
      params = params.set('hasta', hasta);
    }

    return this.http.get<any>(`${this.apiUrl}/adicionales/pagina`, { params });
  }

  /**
   * TRASPASO (Camino A) - Paso 1: busca el adicional ANTERIOR por su folio
   * para heredar sus datos. El backend responde con el contrato y su saldo,
   * o con un error (400) si no se puede usar (inexistente, cancelado, o ya
   * recontratado). El folio se manda en mayúsculas.
   */
  buscarAnteriorAdicional(folio: string): Observable<any> {
    const params = new HttpParams().set('folio', (folio || '').trim().toUpperCase());
    return this.http.get<any>(`${this.apiUrl}/adicionales/buscar-anterior`, { params });
  }

  /**
   * TRASPASO (Camino A) - Paso 2: crea el nuevo adicional y marca el
   * anterior como recontratado, en una sola operación. El folio anterior
   * viaja como parámetro y el nuevo contrato en el cuerpo (incluyendo su
   * lista de artículos, de donde el servidor saca el total).
   */
  traspasarAdicional(contrato: any, folioAnterior: string): Observable<any> {
    const params = new HttpParams().set('folioAnterior', (folioAnterior || '').trim().toUpperCase());
    return this.http.post(`${this.apiUrl}/adicionales/traspaso`, contrato, { params });
  }

  /**
   * ARTÍCULOS ADQUIRIDOS - Los renglones de un contrato, para abrirlo
   * a editar.
   *
   * Solo se usa al EDITAR: las listas no piden artículos, porque serían
   * cientos de consultas de más.
   *
   * Si el contrato es viejo y no tiene artículos capturados, el backend
   * devuelve un renglón inventado que dice "Contrato" con el monto que ya
   * tenía. Es la red de seguridad para que no se le borre el total.
   */
  listarArticulos(idContrato: number): Observable<ContratoArticulo[]> {
    return this.http.get<ContratoArticulo[]>(`${this.apiUrl}/${idContrato}/articulos`);
  }

  /**
   * MATRIZ "0/AA" - Los años que tienen adicionales, para pintar los
   * renglones fijos arriba de la lista de Órdenes de Trabajo.
   *
   * Respuesta: [ {anio: 2026, etiqueta: '0/26'}, {anio: 2025, etiqueta: '0/25'} ]
   *
   * OJO: estos NO son O.T. de verdad. Son una consulta por año que se
   * pinta como si fuera una O.T. más. Los adicionales siguen sin O.T.
   */
  listarAniosAdicionales(): Observable<AnioAdicionales[]> {
    return this.http.get<AnioAdicionales[]>(`${this.apiUrl}/adicionales/anios`);
  }

  /**
   * MATRIZ "0/AA" - La hoja completa de un año: todos los adicionales con
   * su anticipo, sus pagos acomodados en columnas, totales y porcentaje.
   * Si no se manda año, el backend usa el actual.
   */
  obtenerMatrizAdicionales(anio?: number): Observable<MatrizAdicionales> {
    let params = new HttpParams();
    if (anio) {
      params = params.set('anio', anio);
    }
    return this.http.get<MatrizAdicionales>(`${this.apiUrl}/adicionales/matriz`, { params });
  }

  crear(contrato: any): Observable<any> {
    return this.http.post(this.apiUrl, contrato);
  }

  actualizar(id: number, contrato: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, contrato);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }

  buscarAlumno(texto: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/buscar-alumno?texto=${encodeURIComponent(texto)}`);
  }
}

/**
 * Modo en que debe arrancar la pantalla de Contratos, según el rol
 * y según si el corte de hoy está abierto o no.
 *
 * Lo manda el backend para que el frontend sepa qué pintar.
 */
export interface ModoPantallaContratos {
  modo: 'SOLO_HOY' | 'CORTE_CERRADO' | 'BUSCAR_PRIMERO' | 'SIN_ACCESO';
  rol: string;
  fechaHoy: string; // formato yyyy-MM-dd
  corteHoyTrabado: boolean;
}

/**
 * Un renglón del apartado "Artículos Adquiridos".
 *
 * La SUMA de los montos es el total del contrato. Por eso el campo Total
 * de la pantalla está en solo lectura: lo calcula el servidor sumando
 * estos renglones, no se teclea.
 *
 * El id llega vacío en los renglones que apenas se están capturando.
 */
export interface ContratoArticulo {
  idContratoArticulo?: number;
  idContrato?: number;
  descripcion: string;
  monto: number;
  orden?: number;
}

/** Un año con adicionales: el renglón fijo "0/26" de la lista de O.T. */
export interface AnioAdicionales {
  anio: number;
  etiqueta: string; // "0/26"
}

/** Una celda FOLIO+PAGO de la matriz. Las devoluciones vienen en negativo. */
export interface CeldaPago {
  folio: string;
  monto: number;
  fecha: string;
  esDevolucion: boolean;
}

/**
 * Un renglón de la matriz = un adicional.
 * 'pagos' siempre trae tantos elementos como columnasPago; las celdas
 * que ese alumno no usó llegan en null.
 */
export interface FilaAdicional {
  numero: number;
  idContrato: number;
  folioContrato: string;
  ad: string;
  nombreAlumno: string;
  carrera: string;
  escuela: string;
  generacion: string;
  concepto: string;
  estado: string;
    fechaEntrega: string;
  /** Global de recibos físicos anteriores (arrastre de una recontratación). */
  recibosAnteriores: number;
  /** Solo el anticipo del propio contrato: lo que sí entró a la caja ese día. */
  anticipo: number;
  pagos: (CeldaPago | null)[];
  total: number;
  abonado: number;
  resta: number;
  porcentaje: number;
  cancelado: boolean;
  vencido: boolean;
}

/** La hoja completa "0/26" con sus totales del pie. */
export interface MatrizAdicionales {
  anio: number;
  etiqueta: string;
  columnasPago: number;
  filas: FilaAdicional[];
  totalRecibosAnteriores: number;
  totalAnticipos: number;
  totalesPorColumna: number[];
  totalGeneral: number;
  abonadoGeneral: number;
  restaGeneral: number;
  cantidadContratos: number;
  cantidadCancelados: number;
}