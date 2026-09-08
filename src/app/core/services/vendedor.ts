import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Vendedor {
  private apiUrl = `${environment.apiUrl}/vendedores`;

  constructor(private http: HttpClient) {}

  // Todos (para la pantalla de administración de vendedores)
  listar(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  // Solo activos (para el desplegable de "Ejecutivo de ventas" en O.T.)
  listarActivos(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/activos`);
  }

  crear(vendedor: any): Observable<any> {
    return this.http.post(this.apiUrl, vendedor);
  }

  actualizar(id: number, vendedor: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, vendedor);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }
}