import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Comision {
  private apiUrl = `${environment.apiUrl}/comisiones`;

  constructor(private http: HttpClient) {}

  // Trae el reporte de comisiones entre dos fechas (formato yyyy-MM-dd)
  reporte(desde: string, hasta: string): Observable<any> {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta);
    return this.http.get<any>(this.apiUrl, { params });
  }
}


