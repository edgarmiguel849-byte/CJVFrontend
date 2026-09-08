import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CierreCaja {
  private apiUrl = `${environment.apiUrl}/cierres-caja`;

  constructor(private http: HttpClient) {}

  /**
   * Busca el cierre guardado de un día.
   * Si ese día todavía no se cierra, el backend responde 204 y aquí
   * llega null. Por eso la pantalla siempre debe checar si vino vacío.
   */
  buscarPorFecha(fecha: string): Observable<any> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any>(`${this.apiUrl}/por-fecha`, { params });
  }

  /** Historial de cierres, del más reciente al más viejo. */
  listarHistorial(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/historial`);
  }

  /**
   * Envía el cierre del día. Solo se manda lo contado y el comentario;
   * el resto de los números los calcula el servidor.
   */
  enviar(fecha: string, efectivoContado: number, comentarios: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/enviar`, {
      fecha,
      efectivoContado,
      comentarios,
    });
  }

  /** Solo Jefe. */
  autorizar(idCierre: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${idCierre}/autorizar`, {});
  }

  /** Solo Jefe. Devuelve un cierre autorizado al estado ENVIADO. */
  reabrir(idCierre: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${idCierre}/reabrir`, {});
  }

  /** Solo Jefe, y solo si no está autorizado. */
  eliminar(idCierre: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${idCierre}`, { responseType: 'text' });
  }
}