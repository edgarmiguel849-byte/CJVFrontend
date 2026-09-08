import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Escuela {
  private apiUrl = `${environment.apiUrl}/escuelas`;

  constructor(private http: HttpClient) {}

  listar(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  crear(escuela: any): Observable<any> {
    return this.http.post(this.apiUrl, escuela);
  }

  actualizar(id: number, escuela: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, escuela);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
