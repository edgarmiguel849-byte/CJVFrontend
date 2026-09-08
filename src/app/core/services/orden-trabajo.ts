import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class OrdenTrabajo {
  private apiUrl = `${environment.apiUrl}/ordenes-trabajo`;

  constructor(private http: HttpClient) {}

  listar(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  buscarPorCarrera(texto: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}?carrera=${encodeURIComponent(texto)}`);
  }

  buscarPorNumeroAnio(numero: number, anio: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/buscar?numero=${numero}&anio=${anio}`);
  }

  crear(ordenTrabajo: any): Observable<any> {
    return this.http.post(this.apiUrl, ordenTrabajo);
  }

  actualizar(id: number, ordenTrabajo: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, ordenTrabajo);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }
  matriz(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/matriz`);
  }
}