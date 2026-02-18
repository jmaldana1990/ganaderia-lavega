import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dzykvitmgkrucicxvicz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6eWt2aXRtZ2tydWNpY3h2aWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNDU4MTksImV4cCI6MjA4NTcyMTgxOX0.lE2a1jj34r_NRZ3uEuPinllG6VOQBE4TQbtbwXngHg4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ==================== NACIMIENTOS ====================
export async function getNacimientos() {
  const { data, error } = await supabase
    .from('nacimientos')
    .select('*')
    .order('fecha', { ascending: false })
  
  if (error) throw error
  
  return data.map(n => ({
    id: n.id,
    cria: n.cria,
    fecha: n.fecha,
    año: n.año,
    mes: n.mes,
    sexo: n.sexo,
    madre: n.madre,
    padre: n.padre,
    pesoNacer: n.peso_nacer,
    pesoDestete: n.peso_destete,
    fechaDestete: n.fecha_destete,
    añoDestete: n.año_destete,
    edadDestete: n.edad_destete,
    grDiaVida: n.gr_dia_vida,
    estado: n.estado,
    comentario: n.comentario
  }))
}

export async function upsertNacimientos(registros) {
  const dbRecords = registros.map(r => ({
    cria: r.cria,
    fecha: r.fecha,
    año: r.año,
    mes: r.mes,
    sexo: r.sexo,
    madre: r.madre,
    padre: r.padre,
    peso_nacer: r.pesoNacer,
    peso_destete: r.pesoDestete,
    fecha_destete: r.fechaDestete,
    año_destete: r.añoDestete,
    edad_destete: r.edadDestete,
    gr_dia_vida: r.grDiaVida,
    estado: r.estado,
    comentario: r.comentario
  }))

  const { data, error } = await supabase
    .from('nacimientos')
    .upsert(dbRecords, { onConflict: 'cria' })
    .select()
  
  if (error) throw error
  return data
}

export async function insertNacimiento(registro) {
  const { data, error } = await supabase
    .from('nacimientos')
    .insert(registro)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateNacimiento(id, updates) {
  const { data, error } = await supabase
    .from('nacimientos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteNacimiento(id) {
  const { error } = await supabase
    .from('nacimientos')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ==================== INVENTARIO ====================
export async function getInventario() {
  const { data, error } = await supabase
    .from('inventario')
    .select('*')
    .order('año', { ascending: false })
    .order('mes', { ascending: false })
  
  if (error) throw error
  
  // Transformar a formato compatible con App.jsx (incluye periodo y t)
  return data.map(i => ({
    id: i.id,
    año: i.año,
    mes: i.mes,
    periodo: `${i.año}-${String(i.mes).padStart(2, '0')}`,
    finca: i.finca,
    vp: i.vp,
    vh: i.vh,
    nas: i.nas,
    ch: i.ch,
    cm: i.cm,
    t: i.toros || 0,
    hl: i.hl,
    ml: i.ml,
    hd: 0,
    md: 0,
    mc: 0,
    total: i.total,
    toros: i.toros,
    caballos: i.caballos
  }))
}

export async function upsertInventario(registros) {
  const dbRecords = registros.map(r => ({
    año: r.año,
    mes: r.mes,
    finca: r.finca || 'La Vega',
    vp: r.VP || r.vp || 0,
    vh: r.VH || r.vh || 0,
    nas: r.NAS || r.nas || 0,
    ch: r.CH || r.ch || 0,
    cm: r.CM || r.cm || 0,
    hl: r.HL || r.hl || 0,
    ml: r.ML || r.ml || 0,
    total: r.TOTAL || r.total || 0,
    toros: r.TOROS || r.toros || 0,
    caballos: r.CABALLOS || r.caballos || 0
  }))

  const { data, error } = await supabase
    .from('inventario')
    .upsert(dbRecords, { onConflict: 'año,mes,finca' })
    .select()
  
  if (error) throw error
  return data
}

// ==================== COSTOS ====================
export async function getCostos() {
  let allData = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('costos')
      .select('*')
      .order('fecha', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allData
}

// ==================== VENTAS ====================
export async function getVentas() {
  const { data, error } = await supabase
    .from('ventas')
    .select('*')
    .order('fecha', { ascending: false })
  
  if (error) throw error
  return data
}

export async function deleteVenta(id) {
  const { error } = await supabase
    .from('ventas')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

export async function updateVenta(id, updates) {
  const { data, error } = await supabase
    .from('ventas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// ==================== HATO REPRODUCTIVO ====================
export async function getHatoReproductivo(finca = null) {
  let query = supabase
    .from('hato_reproductivo')
    .select('*')
    .order('categoria', { ascending: true })
    .order('numero', { ascending: true })

  if (finca) {
    query = query.eq('finca', finca)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function upsertHatoReproductivo(registros) {
  const dbRecords = registros.map(r => ({
    numero: r.numero,
    finca: r.finca || 'La Vega',
    categoria: r.categoria,
    edad_anos: r.edad_anos,
    estado_actual: r.estado_actual,
    grupo: r.grupo,
    dias_posparto: r.dias_posparto || 0,
    num_partos: r.num_partos || 0,
    cria_actual: r.cria_actual,
    sexo_cria: r.sexo_cria,
    fecha_ultimo_parto: r.fecha_ultimo_parto,
    dias_gestacion: r.dias_gestacion || 0,
    piep: r.piep || 0,
    pduc: r.pduc || 0,
    fecha_carga: new Date().toISOString().split('T')[0]
  }))

  let total = 0
  for (let i = 0; i < dbRecords.length; i += 200) {
    const batch = dbRecords.slice(i, i + 200)
    const { data, error } = await supabase
      .from('hato_reproductivo')
      .upsert(batch, { onConflict: 'numero,finca' })
      .select()

    if (error) throw error
    total += data?.length || 0
  }

  return { total, registros: dbRecords.length }
}

export async function insertCosto(registro) {
  const { data, error } = await supabase
    .from('costos')
    .insert(registro)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function updateCosto(id, updates) {
  const { data, error } = await supabase
    .from('costos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function deleteCosto(id) {
  const { error } = await supabase
    .from('costos')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

// ==================== PESAJES ====================
export async function getPesajes() {
  let allData = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('pesajes')
      .select('*')
      .order('fecha_pesaje', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allData
}

// ==================== PALPACIONES ====================
export async function getPalpaciones() {
  let allData = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('palpaciones')
      .select('*')
      .order('fecha', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allData
}

// ==================== SERVICIOS ====================
export async function getServicios() {
  let allData = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('servicios')
      .select('*')
      .order('fecha', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allData
}

// ==================== DESTETES ====================
export async function getDestetes() {
  let allData = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('destetes')
      .select('*')
      .order('fecha_destete', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allData
}

// ==================== LOG DE CARGAS ====================
export async function logCarga(tipo, nombre, procesados, nuevos, actualizados, email) {
  const { error } = await supabase
    .from('cargas_log')
    .insert({
      tipo_archivo: tipo,
      nombre_archivo: nombre,
      registros_procesados: procesados,
      registros_nuevos: nuevos,
      registros_actualizados: actualizados,
      usuario_email: email
    })
  
  if (error) console.error('Error logging carga:', error)
}

// ==================== AUTENTICACIÓN ====================
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}

// ==================== VERIFICAR CONEXIÓN ====================
export async function checkConnection() {
  try {
    const { error } = await supabase.from('nacimientos').select('id').limit(1)
    return !error
  } catch {
    return false
  }
}

// ==================== ROLES DE USUARIO ====================
export async function getUserRole(email) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('rol, nombre')
    .eq('email', email)
    .eq('activo', true)
    .single()
  
  if (error || !data) return { rol: 'admin', nombre: null } // sin registro = admin por defecto
  return data
}

// ==================== FACTURAS (STORAGE) ====================
export async function uploadFactura(costoId, file) {
  const ext = file.name.split('.').pop()
  const path = `${costoId}/${Date.now()}.${ext}`
  
  const { data, error } = await supabase.storage
    .from('facturas')
    .upload(path, file, { upsert: true })
  
  if (error) throw error
  
  const { data: urlData } = supabase.storage
    .from('facturas')
    .getPublicUrl(path)
  
  // Actualizar el costo con la URL de la factura
  await updateCosto(costoId, {
    factura_url: urlData.publicUrl,
    factura_nombre: file.name,
    factura_fecha: new Date().toISOString()
  })
  
  return urlData.publicUrl
}

export async function deleteFactura(costoId, facturaUrl) {
  // Extraer el path del URL
  const urlParts = facturaUrl.split('/facturas/')
  if (urlParts.length > 1) {
    const path = urlParts[1]
    await supabase.storage.from('facturas').remove([path])
  }
  
  await updateCosto(costoId, {
    factura_url: null,
    factura_nombre: null,
    factura_fecha: null
  })
}

// ==================== AUTO-COMENTARIO ====================
export async function getComentariosSugeridos(proveedor) {
  const { data, error } = await supabase
    .from('costos')
    .select('comentarios, centro, categoria')
    .ilike('proveedor', proveedor)
    .not('comentarios', 'is', null)
    .not('comentarios', 'eq', '')
    .order('fecha', { ascending: false })
    .limit(50)
  
  if (error || !data) return []
  
  // Agrupar por comentario y contar frecuencia
  const freq = {}
  data.forEach(d => {
    const key = d.comentarios.trim()
    if (!freq[key]) freq[key] = { texto: key, count: 0, centro: d.centro, categoria: d.categoria }
    freq[key].count++
  })
  
  return Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 5)
}

// ==================== CAJA MENOR ====================
export async function getCajaMenor() {
  const { data, error } = await supabase
    .from('caja_menor')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data || []
}

export async function insertCajaMenor(registro) {
  const { data, error } = await supabase
    .from('caja_menor')
    .insert(registro)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function updateCajaMenor(id, updates) {
  const { data, error } = await supabase
    .from('caja_menor')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function deleteCajaMenor(id) {
  const { error } = await supabase
    .from('caja_menor')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

export async function uploadFacturaCajaMenor(registroId, file) {
  const ext = file.name.split('.').pop()
  const path = `caja-menor/${registroId}/${Date.now()}.${ext}`
  
  const { data, error } = await supabase.storage
    .from('facturas')
    .upload(path, file, { upsert: true })
  
  if (error) throw error
  
  const { data: urlData } = supabase.storage
    .from('facturas')
    .getPublicUrl(path)
  
  await updateCajaMenor(registroId, {
    factura_url: urlData.publicUrl,
    factura_nombre: file.name
  })
  
  return urlData.publicUrl
}
