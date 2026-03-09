# Ganadería La Vega - Resumen del Proyecto

## Última actualización: 9 de Marzo 2026

## Resumen del día
- **T5 (Costo/kg dashboard)**: ✅ COMPLETADA. VentasTotales ahora muestra Costo Prom/kg y Utilidad/kg en cards + tabla comparativa anual con Precio/kg, Costo/kg, Utilidad/kg, Ingresos y Costos por año.
- **T10 (Muerte de animal)**: ✅ COMPLETADA. Tercer modo en VentaTrasladoView con causa (dropdown) y observaciones. Cambia estado a "Muerto".
- **T11 (Agregar pesajes)**: ✅ COMPLETADA. Cuarto modo en VentaTrasladoView. Calcula automáticamente edad_meses y gdp_vida.

## Estado de Tareas — TODAS COMPLETADAS
| Tarea | Descripción | Estado |
|-------|-------------|--------|
| T1 | Auto-actualizar indicadores (días abiertos, lactancia, gestación) | ✅ DONE |
| T2 | Ganancia g/día al destete | ✅ DONE |
| T3 | Agregar "Preñada" en palpaciones + campo gestación | ✅ DONE |
| T4 | Edad de animales (meses/años) | ✅ DONE |
| T5 | Costo promedio por kg vendido en dashboard | ✅ DONE |
| T6 | Auto tipo animal (cría→ML/HL→NV→VP) | ✅ DONE |
| T7 | (Completada) | ✅ DONE |
| T8 | Venta de animales (individual y lote) | ✅ DONE |
| T9 | Traslado de animales entre fincas | ✅ DONE |
| T10 | Registrar muerte de un animal | ✅ DONE |
| T11 | Agregar pesajes nuevos | ✅ DONE |

## Issues Pendientes
- **File upload pesajes stuck**: Al cargar archivo de pesajes se queda en "Procesando..." sin completar. Pendiente investigar CargaArchivos.jsx.

## Arquitectura
- **App.jsx**: ~5,230 líneas
- **supabase.js**: CRUD completo incluyendo insertVentaAnimal, insertPesaje, insertPesajesBatch, insertTraslado, getTraslados
- **Componentes separados**: Login.jsx, CargaArchivos.jsx, KPITrends.jsx, Contabilidad.jsx

## VentaTrasladoView - 4 Modos
- **Venta**: animales + peso + precio/kg → ventas + estado "Vendido"
- **Traslado**: animales + finca destino → traslados + cambia finca
- **Muerte**: animales + causa + obs → estado "Muerto"
- **Pesaje**: animales + fecha + peso → pesajes con edad y GDP auto

## Errores Comunes y Soluciones
1. **"column X does not exist"**: Verificar columnas en Supabase ANTES del código. Ejecutar migration SQL primero.
2. **Inventario posición variable**: Buscar "HACIENDA BARILOCHE" dinámicamente, no posiciones fijas.
3. **Categorías**: Cálculo dinámico tiene prioridad sobre categoriaActual del DB.
4. **Ventas animal vs lote**: Ventas nuevas tienen campo `animal`. Históricas no.
5. **Estado Vendido/Muerto**: SIEMPRE actualizar `estado` en nacimientos.
6. **Pesajes manuales**: Calcular edad_meses y gdp_vida en frontend antes de enviar.
7. **Costo/kg**: costos totales / kg vendidos. Si kg=0, mostrar "—".
