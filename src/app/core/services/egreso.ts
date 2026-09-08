import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Cómo debe arrancar la pantalla de Egresos. Lo decide el SERVIDOR.
 *
 * Son los mismos cuatro modos y los mismos nombres que usa Contratos, a
 * propósito: no vale la pena que la pantalla de Egresos invente un segundo
 * vocabulario para la misma regla.
 *
 *  - SOLO_HOY       Mostrador con el día abierto. Solo ve los de hoy; las
 *                   fechas se las pisa el servidor aunque mande otras.
 *  - CORTE_CERRADO  Mostrador con el corte ya entregado. No ve nada.
 *  - BUSCAR_PRIMERO Jefe/Admin. Pantalla en blanco hasta que filtren.
 *  - SIN_ACCESO     Rol desconocido. Nada.
 *
 * Esto es SOLO para pintar. Si alguien lo manipula, la lista sigue
 * llegando vacía y el guardado sigue rebotando: los candados viven en
 * EgresoService, no aquí.
 */
export interface ModoPantallaEgresos {
  modo: 'SOLO_HOY' | 'CORTE_CERRADO' | 'BUSCAR_PRIMERO' | 'SIN_ACCESO';
  rol: string;
  fechaHoy: string; // formato yyyy-MM-dd
  corteHoyTrabado: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Egreso {
  private apiUrl = `${environment.apiUrl}/egresos`;

  constructor(private http: HttpClient) {}

  obtenerModoPantalla(): Observable<ModoPantallaEgresos> {
    return this.http.get<ModoPantallaEgresos>(`${this.apiUrl}/modo-pantalla`);
  }

  /**
   * OJO: este endpoint quedó restringido a Jefe/Administrador en el
   * backend. Ninguna pantalla lo usa hoy; si algún día se ocupa desde
   * Mostrador va a devolver 403.
   */
  listar(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  /** También restringido a Jefe/Administrador. Lo usa Comisiones. */
  listarPorRango(desde: string, hasta: string): Observable<any[]> {
    const params = new HttpParams()
      .set('desde', desde)
      .set('hasta', hasta);
    return this.http.get<any[]>(`${this.apiUrl}/rango`, { params });
  }

  /**
   * Lista paginada. Los filtros son opcionales: si van vacíos,
   * no se agregan a la URL y el backend los ignora.
   * La respuesta viene envuelta: { pagina: {...}, totalMonto: 0 }
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

  crear(egreso: any): Observable<any> {
    return this.http.post(this.apiUrl, egreso);
  }

  actualizar(id: number, egreso: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, egreso);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }
}