import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Los tres talonarios. Cada uno lleva su PROPIO recorrido por el
 * abecedario (de la A a la Y; la Z está apartada para devoluciones), así
 * que el folio C2672 de recibos y el C2672 de contratos son papeles
 * distintos. Por eso el tipo viaja siempre junto al folio.
 */
export type TipoFolio = 'RECIBO' | 'CONTRATO' | 'ADICIONAL';

/**
 * Un folio del talonario que NO se usó: se echó a perder y solo se
 * registró el número con su fecha, para que el talonario cuadre.
 *
 * Es el ROJO del reporte de control. No es un contrato ni un pago: vive
 * en su propia tabla y no toca cortes, comisiones ni matrices.
 */
export interface FolioNoUtilizado {
  idFolioNoUtilizado?: number;
  tipo: TipoFolio;
  folio: string;
  fecha: string; // formato yyyy-MM-dd
  usuario?: any;
}

/**
 * Un renglón del reporte de control de folios.
 *
 * VERDE (usado = true)  -> existe un pago o un contrato con ese folio.
 * ROJO  (usado = false) -> está marcado como no utilizado.
 *
 * El color NO depende del dinero ni del estado del contrato. Un contrato
 * CANCELADO que sí se cobró va verde: lo único que se pregunta es si el
 * papel llegó a existir.
 */
export interface FolioControl {
  folio: string;
  usado: boolean;
  fecha: string;       // yyyy-MM-dd
  descripcion: string; // nombre del alumno; vacío en los rojos
  monto: number;
}

@Injectable({
  providedIn: 'root',
})
export class FolioNoUtilizadoService {
  private apiUrl = `${environment.apiUrl}/folios-no-utilizados`;

  constructor(private http: HttpClient) {}

  /**
   * Los folios muertos de un talonario, opcionalmente acotados por fecha.
   *
   * Las fechas van en 'yyyy-MM-dd'. Se mandan solo si traen valor: un
   * parámetro vacío haría que el servidor lo interprete como filtro.
   */
  listar(
    tipo: TipoFolio,
    desde?: string | null,
    hasta?: string | null
  ): Observable<FolioNoUtilizado[]> {
    let params = new HttpParams().set('tipo', tipo);

    if (desde) {
      params = params.set('desde', desde);
    }
    if (hasta) {
      params = params.set('hasta', hasta);
    }

    return this.http.get<FolioNoUtilizado[]>(this.apiUrl, { params });
  }

  /**
   * El reporte de control: verdes y rojos de un talonario, ya ordenados
   * por folio (que al ser letra + 4 dígitos equivale a "abecedario y de
   * menor a mayor").
   *
   * SOLO lo puede consultar el Jefe: el backend devuelve 403 a los demás.
   *
   * OJO: solo salen los folios que EXISTEN en la base. Un folio del
   * talonario que nadie tocó no aparece; para eso haría falta registrar
   * el rango de cada serie, que se dejó para después.
   */
  control(
    tipo: TipoFolio,
    desde?: string | null,
    hasta?: string | null
  ): Observable<FolioControl[]> {
    let params = new HttpParams().set('tipo', tipo);

    if (desde) {
      params = params.set('desde', desde);
    }
    if (hasta) {
      params = params.set('hasta', hasta);
    }

    return this.http.get<FolioControl[]>(`${this.apiUrl}/control`, { params });
  }

  /**
   * Marca un folio como no utilizado.
   *
   * Solo se mandan tres campos. El usuario lo pone el SERVIDOR desde el
   * token: si se mandara desde aquí, cualquiera podría registrar folios a
   * nombre de otra persona.
   *
   * El servidor rechaza el folio si ya existe como contrato o como pago
   * real, para que ninguno pueda salir verde y rojo al mismo tiempo.
   */
  registrar(
    tipo: TipoFolio,
    folio: string,
    fecha: string
  ): Observable<FolioNoUtilizado> {
    return this.http.post<FolioNoUtilizado>(this.apiUrl, {
      tipo,
      folio,
      fecha,
    });
  }

  /**
   * Quita la marca. Hace falta porque marcar un folio equivocado es fácil
   * y, sin esto, ese número quedaría bloqueado: no se podría capturar
   * después el contrato o el recibo de verdad.
   */
  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}