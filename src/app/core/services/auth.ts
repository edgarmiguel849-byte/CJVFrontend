import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private apiUrl = `${environment.apiUrl}/login`;

  constructor(private http: HttpClient) {}

  login(nombreUsuario: string, contrasena: string): Observable<any> {
    return this.http.post(this.apiUrl, { nombreUsuario, contrasena });
  }
}