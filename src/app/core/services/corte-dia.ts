import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CorteDia {
  private apiUrl = `${environment.apiUrl}/corte-dia`;

  constructor(private http: HttpClient) {}

  obtener(fecha: string): Observable<any> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any>(this.apiUrl, { params });
  }
}
