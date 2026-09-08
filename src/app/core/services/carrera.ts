import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Carrera {
  private apiUrl = `${environment.apiUrl}/carreras`;

  constructor(private http: HttpClient) {}

  listar(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  crear(carrera: any): Observable<any> {
    return this.http.post(this.apiUrl, carrera);
  }

  actualizar(id: number, carrera: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, carrera);
  }

eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }
}


