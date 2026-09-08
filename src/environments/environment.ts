// DESARROLLO (cuando programas con `ng serve`).
// Apunta al backend que corres en tu propia máquina desde IntelliJ.
//
// OJO: el backend de IntelliJ vive en el puerto 8081 (lo fuerza el
// Run Configuration con --server.port=8081). El 8080 es del JAR VIEJO
// que usan los trabajadores: si apuntas ahí, Angular habla con el
// sistema viejo y no vas a ver ninguno de los cambios nuevos.
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8081/api',
};