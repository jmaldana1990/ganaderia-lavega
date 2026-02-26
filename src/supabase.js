import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'sb-dzykvitmgkrucicxvicz-auth-token',
    flowType: 'implicit',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    lock: (name, acquireTimeout, fn) => fn(),
  },
})

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
    comentario: n.comentario,
    categoriaActual: n.categoria_actual,
    fincaDB: n.finca
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

// Actualizar un registro de nacimiento (destetes, cambios de estado, etc.)
export async function updateNacimiento(id, updates) {
  // Rename año to avoid encoding issues
  const clean = { ...updates };
  if ('año' in clean) {
    clean['año'] = clean['año'];
  }
  const res = await supabase
    .from('nacimientos')
    .update(clean)
    .eq('id', id);
  if (res.error) throw res.error;
  return { id, ...updates };
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
  const { data, error } = await supabase
    .from('costos')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(5000)
  if (error) throw error
  return data
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
  const { data, error } = await supabase
    .from('pesajes')
    .select('*')
    .order('fecha_pesaje', { ascending: false })
    .limit(5000)
  if (error) throw error
  return data
}

// ==================== PALPACIONES ====================
export async function getPalpaciones() {
  const { data, error } = await supabase
    .from('palpaciones')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(3000)
  if (error) throw error
  return data
}

export async function insertPalpacion(registro) {
  const { data, error } = await supabase
    .from('palpaciones')
    .insert(registro)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePalpacion(id, updates) {
  const { data, error } = await supabase
    .from('palpaciones')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePalpacion(id) {
  const { error } = await supabase
    .from('palpaciones')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ==================== SERVICIOS ====================
export async function getServicios() {
  const { data, error } = await supabase
    .from('servicios')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(3000)
  if (error) throw error
  return data
}

export async function insertServicio(registro) {
  const { data, error } = await supabase
    .from('servicios')
    .insert(registro)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateServicio(id, updates) {
  const { data, error } = await supabase
    .from('servicios')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteServicio(id) {
  const { error } = await supabase
    .from('servicios')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ==================== DESTETES ====================
export async function getDestetes() {
  const { data, error } = await supabase
    .from('destetes')
    .select('*')
    .order('fecha_destete', { ascending: false })
    .limit(3000)
  if (error) throw error
  return data
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

// ==================== LLUVIAS ====================
export async function getLluvias(finca = null) {
  let query = supabase
    .from('lluvias')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(2000)

  if (finca) {
    query = query.eq('finca', finca)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function insertLluviasBatch(registros) {
  const { data, error } = await supabase
    .from('lluvias')
    .upsert(registros, { onConflict: 'fecha,finca,pluviometro' })
    .select()
  if (error) throw error
  return data
}

export async function updateLluvia(id, updates) {
  const { data, error } = await supabase
    .from('lluvias')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteLluvia(id) {
  const { error } = await supabase
    .from('lluvias')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ==================== USUARIOS ====================
export async function getUserRole(email) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('email', email)
    .single()
  if (error) return null
  return data?.rol || null
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

// ==================== RPC FUNCTIONS ====================
export async function getRpcDashboardTotales(año) {
  const { data, error } = await supabase.rpc('get_dashboard_totales', { p_año: año })
  if (error) throw error
  return data?.[0] || null
}

export async function getRpcLluviasMensual(finca = null) {
  const { data, error } = await supabase.rpc('get_lluvias_mensual', { p_finca: finca })
  if (error) throw error
  return data || []
}

export async function getRpcLluviasAnuales(finca = null) {
  const { data, error } = await supabase.rpc('get_lluvias_anuales', { p_finca: finca })
  if (error) throw error
  return data || []
}

export async function getRpcFertilidad(finca, año) {
  const { data, error } = await supabase.rpc('get_fertilidad_kpi', { p_finca: finca, p_año: año })
  if (error) throw error
  return data?.[0] || null
}

export async function getRpcIep(finca = 'La Vega') {
  const { data, error } = await supabase.rpc('get_iep_promedio', { p_finca: finca })
  if (error) throw error
  return data?.[0] || null
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
  
  await updateCosto(costoId, {
    factura_url: urlData.publicUrl,
    factura_nombre: file.name,
    factura_fecha: new Date().toISOString()
  })
  
  return urlData.publicUrl
}

export async function deleteFactura(costoId, facturaUrl) {
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
  
  const freq = {}
  data.forEach(d => {
    const key = d.comentarios.trim()
    if (!freq[key]) freq[key] = { texto: key, count: 0, centro: d.centro, categoria: d.categoria }
    freq[key].count++
  })
  
  return Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 5)
}

// ---- Caja Menor ----
export async function getCajaMenor() {
  const { data, error } = await supabase
    .from('caja_menor')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(2000)
  if (error) { console.error('getCajaMenor:', error); return [] }
  return data || []
}

export async function insertCajaMenor(registro) {
  const { data, error } = await supabase.from('caja_menor').insert([registro]).select()
  if (error) throw error
  return data?.[0]
}

export async function updateCajaMenor(id, updates) {
  const { data, error } = await supabase.from('caja_menor').update(updates).eq('id', id).select()
  if (error) throw error
  return data?.[0]
}

export async function deleteCajaMenor(id) {
  const { error } = await supabase.from('caja_menor').delete().eq('id', id)
  if (error) throw error
}

export async function uploadFacturaCajaMenor(cajaId, file) {
  const ext = file.name.split('.').pop()
  const path = `caja_menor/${cajaId}_${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from('facturas').upload(path, file)
  if (upErr) throw upErr
  const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(path)
  const { error: dbErr } = await supabase.from('caja_menor').update({
    factura_url: urlData.publicUrl,
    factura_nombre: file.name
  }).eq('id', cajaId)
  if (dbErr) throw dbErr
  return urlData.publicUrl
}
