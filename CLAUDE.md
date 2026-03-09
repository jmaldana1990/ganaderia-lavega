# Ganadería La Vega - Resumen del Proyecto

## Última actualización: 9 de Marzo 2026

## Resumen del día
- **T8 (Venta de animales)**: ✅ COMPLETADA. Se creó el componente VentaTrasladoView con modo toggle Venta/Traslado. Soporta venta individual y por lote (selección múltiple de animales). Al vender, el animal cambia estado a "Vendido" en nacimientos y se registra la venta vinculada al animal en la tabla ventas.
- **T9 (Traslado de animales)**: ✅ COMPLETADA. Integrado en el mismo componente VentaTrasladoView. Permite trasladar uno o varios animales entre fincas (La Vega ↔ Bariloche). Actualiza la finca del animal en nacimientos y registra el traslado en tabla nueva `traslados`.
- **SQL Migration ejecutada**: T8_T9_migration.sql agrega columnas a ventas (animal, observaciones, peso_venta, finca, registrado_por), crea tabla traslados, y agrega columnas pendientes a servicios (tecnico, donadora, embrion, observaciones, registrado_por).
- **Sidebar limpiado**: Se eliminó la sección de estadísticas del sidebar (Fuente, nacimientos, costos, inventarios, ventas).

## Estado de Tareas
| Tarea | Descripción | Estado |
|-------|-------------|--------|
| T1 | Auto-actualizar indicadores (días abiertos, lactancia, gestación) | ✅ DONE |
| T2 | Ganancia g/día al destete | ✅ DONE |
| T3 | Agregar "Preñada" en palpaciones + campo gestación | ✅ DONE |
| T4 | Edad de animales (meses < 24m, años >= 24m) | ✅ DONE |
| T5 | Costo promedio por kg vendido en dashboard | ⏳ PENDIENTE |
| T6 | Auto tipo animal (cría→ML/HL→NV→VP) | ✅ DONE |
| T7 | (Completada) | ✅ DONE |
| T8 | Venta de animales (individual y lote) | ✅ DONE |
| T9 | Traslado de animales entre fincas | ✅ DONE |
| T10 | Registrar muerte de un animal | ⏳ PENDIENTE |
| T11 | Agregar pesajes nuevos (manual individual) | ⏳ PENDIENTE |

## Issues Pendientes
- **File upload pesajes stuck**: Al cargar archivo de pesajes se queda en "Procesando..." sin completar. Pendiente de investigar en CargaArchivos.jsx.

## Arquitectura
- **App.jsx**: ~5,000 líneas. Componente principal con todas las vistas.
- **supabase.js**: CRUD para nacimientos, costos, inventario, ventas, pesajes, palpaciones, servicios, destetes, traslados, lluvias, caja_menor, hato_reproductivo.
- **Componentes separados**: Login.jsx, CargaArchivos.jsx, KPITrends.jsx, Contabilidad.jsx
- **Datos locales**: ventas-ganado.js, inventario-fincas.js, nacimientos-lavega.js, gastos-historicos.js

## Menú del Sidebar
1. Dashboard
2. Finca La Vega
3. Finca Bariloche
4. Hato General
5. **Venta / Traslado** ← NUEVO (T8/T9)
6. Ventas Totales
7. Costos y Gastos
8. Contabilidad

## Supabase - Tablas
- nacimientos (cria, fecha, sexo, madre, padre, peso_nacer, peso_destete, fecha_destete, estado, finca, categoria_actual, etc.)
- ventas (fecha, año, mes, tipo, kg, precio, valor, cliente, factura, **animal**, **finca**, **observaciones**, **peso_venta**, **registrado_por**)
- **traslados** (animal, fecha, finca_origen, finca_destino, observaciones, registrado_por) ← NUEVA
- costos, pesajes, palpaciones, servicios, destetes, inventario, lluvias, caja_menor, hato_reproductivo, cargas_log, usuarios

## Errores Comunes y Soluciones
1. **Error "column X does not exist" al guardar**: Siempre verificar que las columnas existan en Supabase ANTES de hacer el código que las usa. Ejecutar migration SQL primero.
2. **Datos de inventario en posición variable**: Los archivos de movimientos mensuales tienen la tabla de inventario de Bariloche en posiciones diferentes. Usar búsqueda dinámica de "HACIENDA BARILOCHE" en lugar de posiciones fijas.
3. **Categorías de animales**: El cálculo dinámico de categoría (getCategoriaAnimal en línea ~50) tiene prioridad sobre categoriaActual del DB. Solo usar DB como fallback.
4. **Ventas vinculadas a animales**: Las ventas nuevas registradas desde VentaTrasladoView incluyen campo `animal`. Las ventas históricas cargadas desde ventas-ganado.js NO tienen este campo (son por lote).
5. **Estado Vendido/Muerto**: Al vender o registrar muerte, SIEMPRE actualizar el campo `estado` en nacimientos para que el animal desaparezca del filtro "Activos" en Hato General.
