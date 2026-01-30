# 🐄 Ganadería La Vega - Sistema de Gestión

Sistema de gestión para control de costos, gastos y producción ganadera.

## 🚀 Despliegue en Vercel (5 minutos)

### Paso 1: Crear cuenta en GitHub
1. Ir a [github.com](https://github.com)
2. Click en "Sign up"
3. Completar el registro con tu email

### Paso 2: Crear repositorio
1. Una vez logueado, click en el botón "+" arriba a la derecha
2. Seleccionar "New repository"
3. Nombre: `ganaderia-lavega`
4. Dejar como "Public"
5. Click en "Create repository"

### Paso 3: Subir archivos
1. En el repositorio recién creado, click en "uploading an existing file"
2. Arrastrar TODOS los archivos de esta carpeta (incluyendo subcarpetas)
3. Click en "Commit changes"

### Paso 4: Conectar con Vercel
1. Ir a [vercel.com](https://vercel.com)
2. Click en "Sign up" → "Continue with GitHub"
3. Autorizar Vercel a acceder a tu GitHub
4. Click en "Add New..." → "Project"
5. Seleccionar el repositorio `ganaderia-lavega`
6. Click en "Deploy"
7. ¡Esperar 1-2 minutos y listo!

### Paso 5: Acceder a tu app
- Vercel te dará una URL como: `ganaderia-lavega.vercel.app`
- ¡Esta es tu aplicación en línea!

---

## 📱 Instalar como App en el Celular

### iPhone:
1. Abrir Safari
2. Ir a tu URL de Vercel
3. Tocar el ícono de compartir (cuadrado con flecha)
4. Seleccionar "Agregar a pantalla de inicio"

### Android:
1. Abrir Chrome
2. Ir a tu URL de Vercel
3. Tocar los 3 puntos del menú
4. Seleccionar "Agregar a pantalla de inicio"

---

## 👥 Usuarios del Sistema

| Usuario | Rol | Acceso |
|---------|-----|--------|
| Administrador | Control total | Todo |
| Clemente | Administrador fincas | Consulta + registro |
| Contadora | Carga de facturas | Registro + pendientes |

---

## 📂 Estructura del Proyecto

```
ganaderia-lavega/
├── public/
│   ├── favicon.svg      # Ícono de la app
│   ├── manifest.json    # Configuración PWA
│   └── sw.js            # Service Worker (offline)
├── src/
│   ├── App.jsx          # Componente principal
│   ├── main.jsx         # Punto de entrada
│   └── index.css        # Estilos Tailwind
├── index.html           # HTML principal
├── package.json         # Dependencias
├── vite.config.js       # Configuración Vite
├── tailwind.config.js   # Configuración Tailwind
└── postcss.config.js    # Configuración PostCSS
```

---

## 🔧 Desarrollo Local (Opcional)

Si quieres hacer cambios localmente:

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Construir para producción
npm run build
```

---

## 📞 Soporte

Para dudas o mejoras del sistema, contactar al administrador.

---

*Versión 1.0 - Enero 2025*
