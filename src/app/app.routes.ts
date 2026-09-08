import { Routes } from '@angular/router';
import { Inicio } from './features/inicio/pages/inicio/inicio';
import { Login } from './features/auth/pages/login/login';
import { Contratos } from './features/contratos/pages/contratos/contratos';
import { ContratosAdicionales } from './features/contratos-adicionales/pages/contratos-adicionales/contratos-adicionales';
import { Pagos } from './features/pagos/pages/pagos/pagos';
import { Usuarios } from './features/usuarios/pages/usuarios/usuarios';
import { BitacoraComponent } from './features/bitacora/pages/bitacora/bitacora';
import { OrdenesTrabajo } from './features/ordenes-trabajo/pages/ordenes-trabajo/ordenes-trabajo';
import { MatrizOt } from './features/ordenes-trabajo/pages/matriz-ot/matriz-ot';
import { MatrizAdicionalesComponent } from './features/ordenes-trabajo/pages/matriz-adicionales/matriz-adicionales';
import { BuscarAlumno } from './features/buscar-alumno/pages/buscar-alumno/buscar-alumno';
import { Comisiones } from './features/comisiones/pages/comisiones/comisiones';
import { Egresos } from './features/egresos/pages/egresos/egresos';
import { Entregas } from './features/entregas/pages/entregas/entregas';
import { CierreCaja } from './features/cierre-caja/pages/cierre-caja/cierre-caja';
import { MainLayout } from './layout/main-layout/main-layout';
import { authGuard } from './core/guards/auth-guard';


export const routes: Routes = [
  {
    path: 'login',
    component: Login
  },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', component: Inicio },
      { path: 'contratos', component: Contratos },
      { path: 'contratos-adicionales', component: ContratosAdicionales },
      { path: 'pagos', component: Pagos },
      { path: 'ordenes-trabajo', component: OrdenesTrabajo },
      { path: 'ordenes-trabajo/:id/matriz', component: MatrizOt },

      // Matriz de adicionales "0/AA". El :anio es el año, no un id de O.T.
      // (no existe una O.T. real detrás; es una consulta por año).
      { path: 'matriz-adicionales/:anio', component: MatrizAdicionalesComponent },

      { path: 'buscar-alumno', component: BuscarAlumno },
      { path: 'entregas', component: Entregas },
      { path: 'reportes', component: Comisiones },
      { path: 'egresos', component: Egresos },
      { path: 'cierre-caja', component: CierreCaja },
      { path: 'usuarios', component: Usuarios },
      { path: 'bitacora', component: BitacoraComponent }
    ]
  },

  // Red de seguridad: cualquier dirección que no exista (incluidas las
  // viejas /escuelas, /carreras, /clientes) redirige a Inicio en vez de
  // dejar la pantalla en blanco. Debe ir SIEMPRE al final.
  {
    path: '**',
    redirectTo: ''
  }
];