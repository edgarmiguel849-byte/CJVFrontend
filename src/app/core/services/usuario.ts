import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Usuario {
  private apiUrl = `${environment.apiUrl}/usuarios`;

  constructor(private http: HttpClient) {}

  listar(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  // Solo usuarios marcados como vendedora (para el dropdown de O.T.)
  listarVendedoras(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/vendedoras`);
  }

  // Solo jefes, con id y nombre. Lo puede pedir el mostrador para
  // el selector de "quién autoriza" una devolución (RN-11).
  listarJefes(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/jefes`);
  }

  crear(usuario: any): Observable<any> {
    return this.http.post(this.apiUrl, usuario);
  }

  actualizar(id: number, usuario: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, usuario);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }
}







