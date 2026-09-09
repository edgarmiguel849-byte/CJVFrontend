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
   * Lo que YO tengo pendiente de entregar de ese día: mis movimientos que
   * todavía no viajan en ningún corte, con el efectivo que debería haber
   * en mi cajón.
   *
   * Es la vista previa de lo que voy a firmar. No lleva parámetro de
   * usuario a propósito: el servidor lo saca del token, así que nadie
   * puede pedir el corte de otra persona.
   */
  miCorte(fecha: string): Observable<any> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any>(`${this.apiUrl}/mi-corte`, { params });
  }

  /** ¿Ya entregué mi corte de ese día? */
  yaEntregue(fecha: string): Observable<boolean> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<boolean>(`${this.apiUrl}/ya-entregue`, { params });
  }

  /**
   * TODOS los cortes de un día, cada uno con su dueño y su estado.
   * Solo Jefe: un día puede tener el de Tete entregado, el de Adri
   * abierto y dos del Administrativo.
   */
  listarDelDia(fecha: string): Observable<any[]> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any[]>(`${this.apiUrl}/del-dia`, { params });
  }

  /**
   * OJO - PROVISIONAL, no usar en pantallas nuevas.
   *
   * Devuelve el PRIMER corte del día. Con un solo corte se comporta como
   * siempre, pero con varios MIENTE: le enseña a Adri el corte de Tete.
   * Sigue aquí nada más para que la pantalla vieja no truene mientras se
   * rehace. Usa listarDelDia() o miCorte() según a quién le toque ver.
   */
  buscarPorFecha(fecha: string): Observable<any> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any>(`${this.apiUrl}/por-fecha`, { params });
  }

  /** Historial de cierres, del más reciente al más viejo. Solo Jefe. */
  listarHistorial(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/historial`);
  }

  /**
   * Entrego MI corte del día. Solo se manda lo contado y el comentario;
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

  /** Solo Jefe. Devuelve un corte entregado al estado REABIERTO. */
  reabrir(idCierre: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${idCierre}/reabrir`, {});
  }

  /** Solo Jefe, y solo si no está autorizado. */
  eliminar(idCierre: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${idCierre}`, { responseType: 'text' });
  }
}