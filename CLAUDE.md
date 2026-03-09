# Ganadería La Vega - Resumen del Proyecto

## Última actualización: 9 de Marzo 2026

## Resumen del día
- T5-T11: Todas completadas (costo/kg, ventas, traslados, muerte, pesajes).
- **T12 (Registros genealógicos)**: ✅ COMPLETADA. Nuevo tab "📋 Registros" en La Vega. Tabla `genealogia` en Supabase con campos comunes + JSONB para datos extras por raza. Soporta BON, Angus, Red Angus, Brangus. Incluye: pedigree (padre/madre/abuelos), EPDs (Angus), performance data, PDF upload, vinculación con animal del hato. Ficha modal con árbol de pedigree visual.

## Estado de Tareas — TODAS COMPLETADAS
| T1-T7 | Indicadores, GDP, palpaciones, edad, costo/kg, tipo animal | ✅ |
| T8 | Venta animales | ✅ |
| T9 | Traslado animales | ✅ |
| T10 | Muerte animal | ✅ |
| T11 | Pesajes manuales per finca | ✅ |
| T12 | Registros genealógicos puros | ✅ |

## Issues Pendientes
- File upload pesajes stuck en "Procesando..."

## Arquitectura
- **App.jsx**: ~5,900 líneas, 20 componentes
- **supabase.js**: CRUD completo incl. genealogia + uploadRegistroPDF
- **VentaTrasladoView**: 3 modos (venta/traslado/muerte)
- **PesajesManualView**: tab dentro de cada FincaView
- **RegistrosGenealogiaView**: tab "Registros" en La Vega only

## Supabase - Tablas
- genealogia (numero, nombre, raza, sexo, color, fecha_nacimiento, registro_num, asociacion, padre/madre nombre+registro, criador, propietario, datos_extras JSONB, pdf_url, animal_hato_id)
- nacimientos, ventas, traslados, costos, pesajes, palpaciones, servicios, destetes, inventario, lluvias, caja_menor, hato_reproductivo

## Errores Comunes
1. Verificar columnas Supabase ANTES del código
2. Inventario Bariloche: buscar dinámicamente
3. Categorías: cálculo dinámico > categoriaActual DB
4. Ventas nuevas tienen campo `animal`, históricas no
5. Estado Vendido/Muerto: SIEMPRE actualizar en nacimientos
6. Pesajes: calcular edad y GDP en frontend
7. Costo/kg: costos/kg vendidos, si kg=0 mostrar "—"
8. Genealogía: datos_extras es JSONB, contiene epds/performance/pedigree_extendido según raza
