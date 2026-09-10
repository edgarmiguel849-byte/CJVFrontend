import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CierreCaja {
  private apiUrl = `${environment.apiUrl}/cierres-caja`;

  constructor(private http: HttpClient) {}

  /**
   * Lo que YO tengo pendiente de entregar de ese día: mis movimientos que
   * todavía no viajan en ningún corte, con el efectivo que debería haber
   * en mi cajón.
   *
   * Es la vista previa de lo que voy a firmar. No lleva parámetro de
   * usuario a propósito: el servidor lo saca del token, así que nadie
   * puede pedir el corte de otra persona.
   */
  miCorte(fecha: string): Observable<any> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any>(`${this.apiUrl}/mi-corte`, { params });
  }

  /**
   * MI corte YA ENTREGADO de ese día, con sus cifras congeladas: usuario,
   * efectivo esperado, efectivo contado, diferencia y comentarios.
   *
   * Es lo que la pantalla necesita para pintar el panel de "ya entregado"
   * y la hoja impresa. Sin esto, al recargar el panel sale vacío y el
   * papel sale sin cifras.
   *
   * Cuando todavía no entrego, el servidor responde 204 y Angular lo
   * convierte en null. NO necesita catchError: no haber entregado no es
   * un error. Ojo: el tipo any se traga ese null, así que quien lo use
   * tiene que preguntar por él a mano.
   *
   * Un corte REABIERTO tampoco cuenta como entregado: también llega null,
   * porque la pantalla debe volver al modo de captura.
   */
  miCorteEntregado(fecha: string): Observable<any> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any>(`${this.apiUrl}/mi-corte-entregado`, { params });
  }

  /** ¿Ya entregué mi corte de ese día? */
  yaEntregue(fecha: string): Observable<boolean> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<boolean>(`${this.apiUrl}/ya-entregue`, { params });
  }

  /**
   * TODOS los cortes de un día, cada uno con su dueño y su estado.
   * Solo Jefe: un día puede tener el de Tete entregado, el de Adri
   * abierto y dos del Administrativo.
   */
  listarDelDia(fecha: string): Observable<any[]> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any[]>(`${this.apiUrl}/del-dia`, { params });
  }

  /**
   * EL SEMÁFORO DEL MES para el calendario del Jefe.
   *
   * Devuelve un renglón por cada día que TENGA cortes:
   *   { fecha, color, totalCortes, autorizados, hayReabiertos }
   *
   * Los colores los decide el servidor, no esta pantalla:
   *   VERDE    -> todos los cortes de ese día están autorizados.
   *   AMARILLO -> unos sí y otros no, o hay alguno reabierto.
   *   ROJO     -> hay cortes y ninguno autorizado.
   *
   * OJO: los días SIN ningún corte no vienen en la lista. El calendario
   * los pinta grises por ausencia; así no viaja un mes entero de
   * renglones vacíos. Un domingo y un martes en que nadie entregó se ven
   * igual, porque el sistema no sabe quién trabajó cada día.
   *
   * El mes va de 1 a 12, como lo dice la gente — NO de 0 a 11 como el
   * objeto Date de JavaScript. Quien llame desde un Date tiene que
   * sumarle 1 al getMonth().
   */
  estadosDelMes(anio: number, mes: number): Observable<any[]> {
    const params = new HttpParams()
      .set('anio', anio)
      .set('mes', mes);
    return this.http.get<any[]>(`${this.apiUrl}/estados-del-mes`, { params });
  }

  /**
   * OJO - PROVISIONAL, no usar en pantallas nuevas.
   *
   * Devuelve el PRIMER corte del día. Con un solo corte se comporta como
   * siempre, pero con varios MIENTE: le enseña a Adri el corte de Tete.
   * Sigue aquí nada más para que la pantalla vieja no truene mientras se
   * rehace. Usa listarDelDia() o miCorte() según a quién le toque ver.
   */
  buscarPorFecha(fecha: string): Observable<any> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<any>(`${this.apiUrl}/por-fecha`, { params });
  }

  /** Historial de cierres, del más reciente al más viejo. Solo Jefe. */
  listarHistorial(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/historial`);
  }

  /**
   * Entrego MI corte del día. Solo se manda lo contado y el comentario;
   * el resto de los números los calcula el servidor.
   */
  enviar(fecha: string, efectivoContado: number, comentarios: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/enviar`, {
      fecha,
      efectivoContado,
      comentarios,
    });
  }

  /** Solo Jefe. */
  autorizar(idCierre: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${idCierre}/autorizar`, {});
  }

  /** Solo Jefe. Devuelve un corte entregado al estado REABIERTO. */
  reabrir(idCierre: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${idCierre}/reabrir`, {});
  }

  /** Solo Jefe, y solo si no está autorizado. */
  eliminar(idCierre: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${idCierre}`, { responseType: 'text' });
  }
}