import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Entrega {
  private apiUrl = `${environment.apiUrl}/entregas`;

  constructor(private http: HttpClient) {}

  /**
   * Los alumnos de una O.T. con su saldo y si ya se les entregó.
   * Es lo que llena la tabla de la pantalla.
   */
  listarRenglones(idOrdenTrabajo: number): Observable<any[]> {
    const params = new HttpParams().set('idOrdenTrabajo', idOrdenTrabajo);
    return this.http.get<any[]>(`${this.apiUrl}/renglones`, { params });
  }

  /** Las entregas que se hicieron con saldo pendiente (revisión del jefe). */
  listarConAdeudo(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/con-adeudo`);
  }

  /**
   * Registra la entrega. Solo se manda el contrato y el comentario;
   * el saldo y la fecha los pone el servidor.
   */
  entregar(idContrato: number, comentarios: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/entregar`, {
      idContrato,
      comentarios,
    });
  }

  /** Solo Jefe. Deshace una entrega registrada por error. */
  eliminar(idEntrega: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${idEntrega}`, { responseType: 'text' });
  }
}



