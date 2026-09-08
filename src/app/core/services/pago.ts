import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Pago {
  private apiUrl = `${environment.apiUrl}/pagos`;

  constructor(private http: HttpClient) {}

  listar(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  /**
   * Lista paginada. Los filtros son opcionales: si van vacíos,
   * no se agregan a la URL y el backend los ignora.
   */
  listarPaginado(
    pagina: number,
    tamanio: number,
    texto?: string,
    desde?: string,
    hasta?: string
  ): Observable<any> {
    let params = new HttpParams()
      .set('pagina', pagina)
      .set('tamanio', tamanio);

    if (texto && texto.trim()) {
      params = params.set('texto', texto.trim());
    }
    if (desde) {
      params = params.set('desde', desde);
    }
    if (hasta) {
      params = params.set('hasta', hasta);
    }

    return this.http.get<any>(`${this.apiUrl}/pagina`, { params });
  }

  crear(pago: any): Observable<any> {
    return this.http.post(this.apiUrl, pago);
  }

  actualizar(id: number, pago: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, pago);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }

    /**
   * Cobro sin contrato (renta de toga, etc.).
   * El backend crea el contrato invisible y le cuelga el pago en una sola
   * transacción. Ver POST /api/pagos/renta.
   */
  crearRenta(datos: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/renta`, datos);
  }
}