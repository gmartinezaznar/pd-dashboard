import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as d3 from "d3";

// ── Supabase config ────────────────────────────────────────────────────────
const SB_URL  = "https://yajtkaumgxnzarvslzgn.supabase.co";
const SB_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhanRrYXVtZ3huemFydnNsemduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTA1NDcsImV4cCI6MjA4ODc2NjU0N30._QKK3rZtCYPuMO2l9j3lsOPa7gJ-hhp2Idzf_QBQgjs";
const ROW_ID  = "pd-dashboard-v1";
const HEADERS = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` };

async function dbLoad() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/entities?id=eq.${ROW_ID}&select=data`, { headers: HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length ? rows[0].data : null;
  } catch { return null; }
}

async function dbSave(d) {
  try {
    await fetch(`${SB_URL}/rest/v1/entities`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ id: ROW_ID, data: d, updated_at: new Date().toISOString() })
    });
  } catch {}
}

// ── Auth ───────────────────────────────────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function authLogin(username, password) {
  try {
    const hash = await sha256(password);
    const res = await fetch(
      `${SB_URL}/rest/v1/users?username=eq.${encodeURIComponent(username.toLowerCase().trim())}&active=eq.true&select=id,username,display_name,role`,
      { headers: HEADERS }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows.length) return null;
    // Verify password hash
    const res2 = await fetch(
      `${SB_URL}/rest/v1/users?id=eq.${rows[0].id}&password_hash=eq.${hash}&select=id`,
      { headers: HEADERS }
    );
    if (!res2.ok) return null;
    const check = await res2.json();
    if (!check.length) return null;
    return rows[0]; // { id, username, display_name, role }
  } catch { return null; }
}

const SESSION_KEY = "pd_session";
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function saveSession(user) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

// ── Breakpoint hook ────────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

// ── Province data ──────────────────────────────────────────────────────────
const CENTROIDS = {
  "A Coruña":[-8.40,43.19],"Lugo":[-7.55,43.01],"Ourense":[-7.86,42.34],"Pontevedra":[-8.64,42.43],
  "Asturias":[-5.86,43.36],"Cantabria":[-3.99,43.18],"Vizcaya":[-2.93,43.22],"Guipúzcoa":[-2.12,43.15],
  "Álava":[-2.73,42.84],"Navarra":[-1.65,42.82],"La Rioja":[-2.44,42.28],"Huesca":[-0.09,42.14],
  "Zaragoza":[-0.88,41.65],"Teruel":[-1.10,40.34],"León":[-5.56,42.60],"Zamora":[-5.74,41.50],
  "Salamanca":[-5.66,40.96],"Burgos":[-3.68,42.34],"Valladolid":[-4.72,41.65],"Palencia":[-4.53,42.01],
  "Segovia":[-4.12,40.95],"Ávila":[-4.70,40.66],"Soria":[-2.47,41.76],"Girona":[2.82,41.98],
  "Barcelona":[2.17,41.55],"Lleida":[0.62,41.62],"Tarragona":[1.25,41.12],"Castellón":[-0.05,40.14],
  "Valencia":[-0.38,39.47],"Alicante":[-0.48,38.34],"Murcia":[-1.13,37.98],"Guadalajara":[-2.63,40.63],
  "Cuenca":[-2.13,39.98],"Toledo":[-4.03,39.86],"Ciudad Real":[-3.92,38.99],"Albacete":[-1.85,38.99],
  "Cáceres":[-6.37,39.47],"Badajoz":[-6.97,38.88],"Huelva":[-6.95,37.26],"Sevilla":[-5.98,37.39],
  "Córdoba":[-4.78,37.89],"Jaén":[-3.79,37.78],"Granada":[-3.60,37.18],"Málaga":[-4.42,36.72],
  "Cádiz":[-5.67,36.53],"Almería":[-2.46,37.21],"Madrid":[-3.71,40.42],
  "Viana do Castelo":[-8.83,41.69],"Braga":[-8.43,41.55],"Vila Real":[-7.75,41.30],
  "Bragança":[-6.76,41.81],"Porto":[-8.61,41.15],"Aveiro":[-8.64,40.64],
  "Viseu":[-7.91,40.66],"Guarda":[-7.27,40.54],"Coimbra":[-8.42,40.21],
  "Castelo Branco":[-7.49,39.82],"Leiria":[-8.80,39.74],"Santarém":[-8.68,39.24],
  "Portalegre":[-7.43,39.30],"Lisboa":[-9.14,38.72],"Setúbal":[-8.89,38.52],
  "Évora":[-7.91,38.57],"Beja":[-7.87,37.96],"Faro":[-7.93,37.02],
};
const CANARIAS = ["Las Palmas","Santa Cruz de Tenerife"];
// Use display names in the province selector
const ALL_PROVS = [
  "A Coruña","Lugo","Ourense","Pontevedra","Asturias","Cantabria","Vizcaya","Guipúzcoa",
  "Álava","Navarra","La Rioja","Huesca","Zaragoza","Teruel","León","Zamora","Salamanca",
  "Burgos","Valladolid","Palencia","Segovia","Ávila","Soria","Girona","Barcelona","Lleida",
  "Tarragona","Castellón","Valencia","Alicante","Murcia","Guadalajara","Cuenca","Toledo",
  "Ciudad Real","Albacete","Cáceres","Badajoz","Huelva","Sevilla","Córdoba","Jaén",
  "Granada","Málaga","Cádiz","Almería","Madrid",
  "Baleares",
  "Las Palmas","Santa Cruz de Tenerife",
  // Portugal
  "Viana do Castelo","Braga","Vila Real","Bragança","Porto","Aveiro","Viseu","Guarda",
  "Coimbra","Castelo Branco","Leiria","Santarém","Portalegre","Lisboa","Setúbal","Évora","Beja","Faro",
  // Extra
  "Andorra","Internacional",
];

const PC = { premium:"#1E3A8A", specialist:"#0891B2", prospect:"#78716C", none:"#E2E8F0" };

function levelColor(e) {
  if (!e) return PC.none;
  if (e.type === "prospect") return PC.prospect;
  return e.level === "premium" ? PC.premium : PC.specialist;
}
function levelBg(e) {
  if (!e || e.type==="prospect") {
    if (e?.stage==="Parado") return "#FEE2E2";
    return "#FEF3C7";
  }
  return e.level==="premium" ? "#EEF2FF" : "#ECFEFF";
}
function levelText(e) {
  if (!e || e.type==="prospect") {
    if (e?.stage==="Parado") return "#DC2626";
    return "#B45309";
  }
  return e.level==="premium" ? "#3730A3" : "#0E7490";
}
function levelLabel(e) {
  if (!e) return "";
  if (e.type==="prospect") return e.stage?.split(" ")[0] || "Prospecto";
  return e.level==="premium" ? "Premium" : "Specialist";
}

// ── Seed ──────────────────────────────────────────────────────────────────
const SEED = {
  partners:[
    { id:"p1", type:"active", level:"premium", name:"Centregràfic Serveis TIC Catalunya SL",
      city:"Barcelona", provinces:["Barcelona","Girona","Lleida","Tarragona"],
      arr:526831, accounts:664, booking2026:301669, since:"2018-03-01",
      contacts:[
        {id:"c1",name:"Joan Puigdomènech",role:"Director Comercial",email:"joan@centregrafic.com",phone:"+34 93 444 55 66"},
        {id:"c2",name:"Marta Soler",role:"Responsable Técnica",email:"marta@centregrafic.com",phone:"+34 93 444 55 67"},
      ],
      updates:[
        {id:"u1",date:"2026-03-05",author:"Isabel B.",text:"Reunión trimestral. Confirman objetivo de 200 NB para 2026."},
        {id:"u2",date:"2026-01-15",author:"Toni C.",text:"Cierre Q4 2025. ARR récord. NPS 9.2."},
      ]},
    { id:"p2", type:"active", level:"premium", name:"MRM Foodservice Solutions SL",
      city:"Madrid", provinces:["Madrid","Toledo","Guadalajara","Cuenca"],
      arr:327974, accounts:459, booking2026:115484, since:"2019-06-15",
      contacts:[{id:"c3",name:"María Rodríguez",role:"CEO",email:"maria@mrmfoodservice.com",phone:"+34 91 333 22 11"}],
      updates:[{id:"u3",date:"2026-02-20",author:"Toni C.",text:"Presentación del nuevo programa de márgenes. Buena recepción."}]},
    { id:"p3", type:"active", level:"premium", name:"Gihar Digital SL",
      city:"Valencia", provinces:["Valencia","Alicante","Castellón","Murcia"],
      arr:211170, accounts:524, booking2026:70985, since:"2020-01-10",
      contacts:[{id:"c4",name:"Gabriel Hernández",role:"Director General",email:"gabriel@gihar.es",phone:"+34 96 555 44 33"}],
      updates:[{id:"u4",date:"2026-03-01",author:"Isabel B.",text:"Solicitan apoyo en feria Hostelería Madrid 2026."}]},
    { id:"p4", type:"active", level:"premium", name:"Nubar Cloud Technologies SL",
      city:"Zaragoza", provinces:["Zaragoza","Huesca","Teruel","Navarra","La Rioja","Soria"],
      arr:136000, accounts:189, booking2026:70040, since:"2020-05-01",
      contacts:[{id:"c5",name:"Núria Balaguer",role:"Partner Manager",email:"nuria@nubar.cloud",phone:"+34 976 111 222"}],
      updates:[{id:"u5",date:"2026-02-15",author:"Toni C.",text:"Expansión a Navarra en curso. 3 nuevas cuentas en enero."}]},
    { id:"p5", type:"active", level:"specialist", name:"TIM Servicios Informáticos En La Red SL",
      city:"Bilbao", provinces:["Vizcaya","Guipúzcoa","Álava","Cantabria"],
      arr:61991, accounts:161, booking2026:53137, since:"2021-04-20",
      contacts:[{id:"c6",name:"Teresa Iglesias",role:"Directora Técnica",email:"teresa@timred.com",phone:"+34 94 222 11 00"}],
      updates:[{id:"u6",date:"2026-02-10",author:"Toni C.",text:"Churn ligeramente por encima del 3%. Revisión de cartera programada."}]},
    { id:"p6", type:"active", level:"specialist", name:"Restauratech Digital Food Solutions",
      city:"Sevilla", provinces:["Sevilla","Cádiz","Huelva","Córdoba","Málaga","Granada","Jaén","Almería"],
      arr:131590, accounts:170, booking2026:52386, since:"2020-09-01",
      contacts:[{id:"c7",name:"Raúl Sánchez",role:"CEO",email:"raul@restauratech.com",phone:"+34 95 666 77 88"}],
      updates:[{id:"u7",date:"2026-03-08",author:"Isabel B.",text:"Excelente NPS 9.4. Propuesta bonus churn H1 aplicable."}]},
    { id:"p7", type:"active", level:"specialist", name:"Megaprint Canarias 2004 SLU",
      city:"Las Palmas", provinces:["Las Palmas","Santa Cruz de Tenerife"],
      arr:4370, accounts:11, booking2026:3893, since:"2026-03-04",
      contacts:[{id:"c8",name:"Ismael Martín Díaz Ríos",role:"Administrador",email:"info@megaprintcanarias.com",phone:"+34 928 000 111"}],
      updates:[{id:"u8",date:"2026-03-04",author:"Isabel B.",text:"Alta como nuevo Specialist. Contrato firmado. Territorio: Canarias."}]},
    { id:"p8", type:"active", level:"specialist", name:"La Tarongeta Informàtica SL",
      city:"Lleida", provinces:["Lleida"],
      arr:117349, accounts:123, booking2026:41204, since:"2019-11-01",
      contacts:[{id:"c9",name:"Pau Tarongeta",role:"Director",email:"pau@tarongeta.com",phone:"+34 973 555 666"}],
      updates:[]},
  ],
  prospects:[
    { id:"pr1", type:"prospect", name:"Tecnotapas Levante SL",
      city:"Alicante", provinces:[], stage:"Negociación",
      notes:"Interesados en cubrir Alicante y Murcia.",
      contacts:[{id:"cp1",name:"Andrés Molina",role:"CEO",email:"andres@tecnotapas.com",phone:"+34 96 888 99 00"}],
      updates:[{id:"u9",date:"2026-02-28",author:"Toni C.",text:"Primera reunión. Perfil sólido, 8 años en sector."}]},
    { id:"pr2", type:"prospect", name:"NorteDigital Hospitality SL",
      city:"A Coruña", provinces:[], stage:"Primer contacto",
      notes:"Referido por MRM. Sin experiencia previa con Revo.",
      contacts:[{id:"cp2",name:"Laura Fernández",role:"Directora Comercial",email:"laura@nortedigital.com",phone:"+34 981 111 222"}],
      updates:[{id:"u10",date:"2026-03-07",author:"Isabel B.",text:"Llamada inicial. Solicitan demo presencial en A Coruña."}]},
  ]
};

// ── Map ────────────────────────────────────────────────────────────────────
// ── Province name normalisation (GeoJSON names → our keys) ────────────────
const NAME_MAP = {
  // es-atlas uses INE codes + NAME_1 in Spanish
  "A Coruña":"A Coruña","La Coruña":"A Coruña","Coruña":"A Coruña",
  "Álava":"Álava","Alava":"Álava","Araba/Álava":"Álava","Araba":"Álava",
  "Albacete":"Albacete",
  "Alicante":"Alicante","Alacant/Alicante":"Alicante","Alicante/Alacant":"Alicante","Alacant":"Alicante",
  "Almería":"Almería","Almeria":"Almería",
  "Asturias":"Asturias","Ávila":"Ávila","Avila":"Ávila","Badajoz":"Badajoz",
  "Illes Balears":"Baleares","Baleares":"Baleares","Islas Baleares":"Baleares","Balears":"Baleares",
  "Barcelona":"Barcelona","Burgos":"Burgos","Cáceres":"Cáceres","Caceres":"Cáceres",
  "Cádiz":"Cádiz","Cadiz":"Cádiz","Cantabria":"Cantabria",
  "Castellón":"Castellón","Castellon":"Castellón","Castelló/Castellón":"Castellón","Castellón/Castelló":"Castellón","Castelló":"Castellón",
  "Ciudad Real":"Ciudad Real","Córdoba":"Córdoba","Cordoba":"Córdoba",
  "Cuenca":"Cuenca","Girona":"Girona","Gerona":"Girona","Granada":"Granada",
  "Guadalajara":"Guadalajara","Guipúzcoa":"Guipúzcoa","Gipuzkoa":"Guipúzcoa","Guipuzcoa":"Guipúzcoa",
  "Huelva":"Huelva","Huesca":"Huesca","Jaén":"Jaén","Jaen":"Jaén","León":"León","Leon":"León",
  "Lleida":"Lleida","Lérida":"Lleida","Lerida":"Lleida","Lugo":"Lugo","Madrid":"Madrid",
  "Málaga":"Málaga","Malaga":"Málaga","Murcia":"Murcia","Navarra":"Navarra","Ourense":"Ourense",
  "Orense":"Ourense","Palencia":"Palencia","Las Palmas":"Las Palmas","Pontevedra":"Pontevedra",
  "La Rioja":"La Rioja","Salamanca":"Salamanca","Santa Cruz de Tenerife":"Santa Cruz de Tenerife",
  "Segovia":"Segovia","Sevilla":"Sevilla","Soria":"Soria","Tarragona":"Tarragona",
  "Teruel":"Teruel","Toledo":"Toledo",
  "Valencia":"Valencia","València":"Valencia","València/Valencia":"Valencia","Valencia/València":"Valencia",
  "Valladolid":"Valladolid",
  "Vizcaya":"Vizcaya","Bizkaia":"Vizcaya","Zamora":"Zamora","Zaragoza":"Zaragoza",
  // Portugal districts
  "Aveiro":"Aveiro","Beja":"Beja","Braga":"Braga","Bragança":"Bragança","Braganca":"Bragança",
  "Castelo Branco":"Castelo Branco","Coimbra":"Coimbra","Évora":"Évora","Evora":"Évora",
  "Faro":"Faro","Guarda":"Guarda","Leiria":"Leiria","Lisboa":"Lisboa","Portalegre":"Portalegre",
  "Porto":"Porto","Santarém":"Santarém","Santarem":"Santarém","Setúbal":"Setúbal","Setubal":"Setúbal",
  "Viana do Castelo":"Viana do Castelo","Vila Real":"Vila Real","Viseu":"Viseu",
  // Andorra
  "Andorra":"Andorra","Andorre":"Andorra",
};
function normName(raw) {
  if (!raw) return raw;
  // Normalize Unicode to NFC to handle combining accents from GeoJSON
  const s = raw.normalize("NFC").trim();
  return NAME_MAP[s] || NAME_MAP[raw.trim()] || s;
}

// Andorra GeoJSON centroid approx
const ANDORRA_CENTROID = [1.5218, 42.5063];

// Provinces list for territory selector — includes Internacional
const SPAIN_PROVINCES = [
  "A Coruña","Álava","Albacete","Alicante","Almería","Asturias","Ávila","Badajoz",
  "Illes Balears","Barcelona","Burgos","Cáceres","Cádiz","Cantabria","Castellón",
  "Ciudad Real","Córdoba","Cuenca","Girona","Granada","Guadalajara","Guipúzcoa",
  "Huelva","Huesca","Jaén","León","Lleida","Lugo","Madrid","Málaga","Murcia",
  "Navarra","Ourense","Palencia","Las Palmas","Pontevedra","La Rioja","Salamanca",
  "Santa Cruz de Tenerife","Segovia","Sevilla","Soria","Tarragona","Teruel","Toledo",
  "Valencia","Valladolid","Vizcaya","Zamora","Zaragoza","Andorra","Internacional",
];

// Province centroid fallbacks (for label placement when GeoJSON centroid is off)
const LABEL_OVERRIDE = {
  "Baleares": [2.92, 39.57],
};

function IberianMap({ partners, prospects, selected, onSelect, hovered }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [geoSpain, setGeoSpain] = useState(null);
  const [geoPortugal, setGeoPortugal] = useState(null);
  const [geoAndorra, setGeoAndorra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [dims, setDims] = useState({w:580, h:480});
  const [geoHighlight, setGeoHighlight] = useState(null); // { province, label }

  // Responsive dims
  useEffect(()=>{
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const {width,height} = entries[0].contentRect;
      if (width>0 && height>0) setDims({w:width, h:height});
    });
    ro.observe(containerRef.current);
    return ()=>ro.disconnect();
  },[]);

  // Load GeoJSON from CDN
  useEffect(()=>{
    let cancelled = false;

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`) && window.topojson) { resolve(); return; }
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    async function fetchGeo() {
      try {
        // Load topojson client
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js");
        if (cancelled) return;

        // Use a single reliable combined Iberia GeoJSON source
        // Spain: naturalearth via unpkg (simple GeoJSON, no topojson needed)
        const [spRes, ptRes, adRes] = await Promise.all([
          fetch("https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/spain-provinces.geojson"),
          fetch("https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/portugal-districts.geojson"),
          fetch("https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"),
        ]);

        if (!spRes.ok) throw new Error(`Spain GeoJSON failed: ${spRes.status}`);
        if (!ptRes.ok) throw new Error(`Portugal GeoJSON failed: ${ptRes.status}`);

        const [spGeo, ptGeo] = await Promise.all([spRes.json(), ptRes.json()]);
        if (cancelled) return;

        setGeoSpain(spGeo.features || []);
        setGeoPortugal(ptGeo.features || []);

        // Extract Andorra from countries GeoJSON if available
        if (adRes.ok) {
          const adGeo = await adRes.json();
          const andorra = (adGeo.features||[]).find(f=>
            f.properties?.ADMIN==="Andorra"||f.properties?.name==="Andorra"||f.properties?.ISO_A2==="AD"
          );
          if (andorra && !cancelled) setGeoAndorra(andorra);
        }
        setLoading(false);
      } catch(e) {
        if (cancelled) return;
        // Fallback: try jsdelivr es-atlas TopoJSON
        try {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js");
          const res = await fetch("https://cdn.jsdelivr.net/npm/es-atlas@0.5.0/es/provinces.json");
          if (!res.ok) throw new Error("fallback also failed");
          const topo = await res.json();
          if (cancelled) return;
          const features = window.topojson.feature(topo, topo.objects.provinces).features;
          setGeoSpain(features);
          setGeoPortugal([]);
          setLoading(false);
        } catch(e2) {
          if (!cancelled) { setError(String(e.message)); setLoading(false); }
        }
      }
    }

    fetchGeo();
    return ()=>{ cancelled=true; };
  },[]);

  // Build province → [partners] lookup (supports multiple)
  const provMap = {};
  [...partners,...prospects].forEach(p=>(p.provinces||[]).forEach(pv=>{
    if (!provMap[pv]) provMap[pv] = [];
    provMap[pv].push(p);
  }));

  // Density color scale: 0=gray, 1=light blue … 4+=dark blue
  const DENSITY = ["#E2E8F0","#BFDBFE","#60A5FA","#2563EB","#1E3A8A"];
  const getProvColor = (norm) => DENSITY[Math.min((provMap[norm]||[]).length, DENSITY.length-1)];

  const handleClick = (norm, e) => {
    e.stopPropagation();
    if (tooltip?.norm === norm) { setTooltip(null); return; }
    const ps = provMap[norm] || [];
    if (!ps.length) { setTooltip(null); return; }
    const rect = containerRef.current?.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    setTooltip({ norm, partners: ps, x: clientX-(rect?.left||0), y: clientY-(rect?.top||0) });
  };

  // Build projection once dims+data are ready
  const projection = useMemo(()=>{
    if (!geoSpain || !geoPortugal) return null;
    const all = [...geoSpain, ...geoPortugal];
    const proj = d3.geoMercator();
    const pathGen = d3.geoPath().projection(proj);
    const peninsula = all.filter(f=>{
      const n = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||f.properties?.Distrito||"");
      return n !== "Las Palmas" && n !== "Santa Cruz de Tenerife";
    });
    proj.fitExtent([[10,10],[dims.w-10, dims.h-10]], {type:"FeatureCollection", features: peninsula});
    return proj;
  }, [geoSpain, geoPortugal, dims.w, dims.h]);

  const pathGen = projection ? d3.geoPath().projection(projection) : null;

  const HIGHLIGHT_COLOR = "#1E3A8A"; // Cegid blue

  const renderFeature = (f, i) => {
    if (!pathGen) return null;
    const raw = f.properties?.name || f.properties?.NAME_2 || f.properties?.NAME || f.properties?.Distrito || "";
    const norm = normName(raw);
    const ps = provMap[norm] || [];
    const isSelected = selected && ps.some(p => p.id === selected.id);
    const isHovered = hovered && (hovered.provinces||[]).includes(norm);
    const isGeoHL = geoHighlight?.province === norm;
    const d = pathGen(f);
    if (!d) return null;
    const [cx,cy] = LABEL_OVERRIDE[norm] ? projection(LABEL_OVERRIDE[norm]) : pathGen.centroid(f);
    const fill = getProvColor(norm);
    const label = norm.length>11 ? norm.substring(0,10)+"." : norm;
    const hasHighlight = selected || hovered || geoHighlight;
    const isHighlighted = isSelected || isHovered || isGeoHL;
    const activeFill = isGeoHL ? "#FEF08A" : (isHighlighted ? HIGHLIGHT_COLOR : fill);
    return (
      <g key={`${i}-${norm}`}
        onClick={(e) => handleClick(norm, e)}
        style={{cursor: ps.length ? "pointer" : "default"}}>
        <path d={d}
          fill={activeFill}
          opacity={hasHighlight && !isHighlighted ? 0.25 : 1}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={0.6}
          style={{transition:"opacity 0.15s, fill 0.15s",
            filter: tooltip?.norm===norm ? "brightness(0.88)" : "none"}}
        />
      </g>
    );
  };

  return (
    <div ref={containerRef} style={{position:"relative",width:"100%",height:"100%"}}>
      <svg ref={svgRef} viewBox={`0 0 ${dims.w} ${dims.h}`}
        style={{width:"100%",height:"100%",display:"block"}}
        onClick={()=>setTooltip(null)}>
        <rect width={dims.w} height={dims.h} fill="#DBEAFE" rx="8"/>

        {loading && (
          <text x={dims.w/2} y={dims.h/2} textAnchor="middle" fontSize="13"
            fill="#64748B" fontFamily="system-ui,sans-serif">Cargando mapa…</text>
        )}
        {error && (
          <>
            <text x={dims.w/2} y={dims.h/2-10} textAnchor="middle" fontSize="12"
              fill="#EF4444" fontFamily="system-ui,sans-serif">Error al cargar el mapa.</text>
            <text x={dims.w/2} y={dims.h/2+10} textAnchor="middle" fontSize="10"
              fill="#94A3B8" fontFamily="system-ui,sans-serif">{error}</text>
          </>
        )}

        {geoSpain && pathGen && geoSpain.map((f,i)=>{
          const norm = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||"");
          if (["Las Palmas","Santa Cruz de Tenerife","Ceuta","Melilla"].includes(norm)) return null;
          return renderFeature(f,i);
        })}
        {geoPortugal && pathGen && geoPortugal.map((f,i)=>renderFeature(f,`pt-${i}`))}

        {/* Exterior-only border for hovered/selected partner */}
        {pathGen && (()=>{
          const activeEntities = [];
          if (hovered) activeEntities.push({ entity: hovered });
          else if (selected) activeEntities.push({ entity: selected });

          return activeEntities.map(({ entity }) => {
            const provs = entity.provinces || [];
            if (!provs.length) return null;
            const allFeatures = [...(geoSpain||[]), ...(geoPortugal||[])];
            const matchingFeatures = allFeatures.filter(f => {
              const norm = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||f.properties?.Distrito||"");
              return provs.includes(norm);
            });
            if (!matchingFeatures.length) return null;
            const combinedD = matchingFeatures.map(f=>pathGen(f)).filter(Boolean).join(" ");
            const maskId = `mask-ext-${entity.id}`;
            // Exterior mask: black inside, white outside → clips stroke to exterior only
            return (
              <g key={`border-${entity.id}`} style={{pointerEvents:"none"}}>
                <defs>
                  <mask id={maskId}>
                    <rect width={dims.w} height={dims.h} fill="white"/>
                    <path d={combinedD} fill="black"/>
                  </mask>
                </defs>
                {/* Thick stroke, masked to exterior only → only outer border visible */}
                <path d={combinedD}
                  fill="none"
                  stroke="#93C5FD"
                  strokeWidth={4}
                  strokeLinejoin="round"
                  mask={`url(#${maskId})`}
                />
              </g>
            );
          });
        })()}

        {/* Labels on top — always visible over fills and borders */}
        <g style={{pointerEvents:"none"}}>
          {geoSpain && pathGen && geoSpain.map((f,i)=>{
            const norm = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||"");
            if (["Las Palmas","Santa Cruz de Tenerife","Ceuta","Melilla"].includes(norm)) return null;
            const [cx,cy] = LABEL_OVERRIDE[norm] ? projection(LABEL_OVERRIDE[norm]) : pathGen.centroid(f);
            if (!cx||!cy) return null;
            const label = norm.length>11 ? norm.substring(0,10)+"." : norm;
            return (
              <text key={`lbl-${i}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                fontSize={norm.length>9?"6":"7"} fill="rgba(255,255,255,0.92)"
                fontFamily="system-ui,sans-serif" fontWeight="600"
                style={{userSelect:"none"}}>{label}</text>
            );
          })}
          {geoPortugal && pathGen && geoPortugal.map((f,i)=>{
            const norm = normName(f.properties?.Distrito||f.properties?.name||"");
            const [cx,cy] = pathGen.centroid(f);
            if (!cx||!cy) return null;
            const label = norm.length>11 ? norm.substring(0,10)+"." : norm;
            return (
              <text key={`lbl-pt-${i}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                fontSize={norm.length>9?"6":"7"} fill="rgba(255,255,255,0.92)"
                fontFamily="system-ui,sans-serif" fontWeight="600"
                style={{userSelect:"none"}}>{label}</text>
            );
          })}
        </g>

        {/* Andorra — real shape if loaded, fallback circle */}
        {projection && (()=>{
          const ps = provMap["Andorra"] || [];
          const isSelected = selected && ps.some(p=>p.id===selected.id);
          const isHovered = hovered && (hovered.provinces||[]).includes("Andorra");
          const hasHighlight = selected || hovered;
          const isHighlighted = isSelected || isHovered;
          const fill = isHighlighted ? HIGHLIGHT_COLOR : DENSITY[Math.min(ps.length, DENSITY.length-1)];
          const opacity = hasHighlight && !isHighlighted ? 0.25 : 1;

          if (geoAndorra && pathGen) {
            const d = pathGen(geoAndorra);
            if (d) {
              const [cx,cy] = pathGen.centroid(geoAndorra);
              const maskId = "mask-andorra";
              return (
                <g style={{cursor:ps.length?"pointer":"default"}}
                  onClick={(e)=>{ e.stopPropagation(); handleClick("Andorra",e); }}>
                  <path d={d} fill={fill} opacity={opacity}
                    stroke="rgba(255,255,255,0.4)" strokeWidth={0.6}
                    style={{transition:"opacity 0.15s, fill 0.15s",
                      filter:tooltip?.norm==="Andorra"?"brightness(0.88)":"none"}}/>
                  {/* Exterior border via mask when highlighted */}
                  {isHighlighted && (
                    <g style={{pointerEvents:"none"}}>
                      <defs>
                        <mask id={maskId}>
                          <rect width={dims.w} height={dims.h} fill="white"/>
                          <path d={d} fill="black"/>
                        </mask>
                      </defs>
                      <path d={d} fill="none" stroke="#93C5FD"
                        strokeWidth={4} strokeLinejoin="round"
                        mask={`url(#${maskId})`}/>
                    </g>
                  )}
                  {/* Label */}
                  {cx && cy && (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                      fontSize="5" fill="rgba(255,255,255,0.92)"
                      fontFamily="system-ui,sans-serif" fontWeight="700"
                      style={{pointerEvents:"none",userSelect:"none"}}>AND</text>
                  )}
                </g>
              );
            }
          }

          // Fallback: circle
          const [ax,ay] = projection(ANDORRA_CENTROID);
          return (
            <g style={{cursor:ps.length?"pointer":"default"}}
              onClick={(e)=>{ e.stopPropagation(); handleClick("Andorra",e); }}>
              <circle cx={ax} cy={ay} r={8} fill={fill} opacity={opacity}
                stroke="rgba(255,255,255,0.4)" strokeWidth={0.6}
                style={{transition:"opacity 0.15s, fill 0.15s"}}/>
              <text x={ax} y={ay} textAnchor="middle" dominantBaseline="middle"
                fontSize="5" fill="rgba(255,255,255,0.92)"
                fontFamily="system-ui,sans-serif" fontWeight="700"
                style={{pointerEvents:"none",userSelect:"none"}}>AND</text>
            </g>
          );
        })()}      </svg>

      {/* Click tooltip */}
      {tooltip && (()=>{
        const tipW = 170;
        const tipX = Math.min(tooltip.x + 10, dims.w - tipW - 8);
        const tipY = Math.max(tooltip.y - 10, 4);
        return (
          <div onClick={e=>e.stopPropagation()} style={{
            position:"absolute", left:tipX, top:tipY, width:tipW,
            background:"rgba(15,23,42,0.92)", backdropFilter:"blur(6px)",
            borderRadius:9, padding:"9px 11px",
            fontFamily:"system-ui,sans-serif", zIndex:50,
            boxShadow:"0 4px 16px rgba(0,0,0,0.25)"
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,fontWeight:700,color:"white"}}>{tooltip.norm}</span>
              <button onClick={()=>setTooltip(null)} style={{background:"none",border:"none",
                color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>×</button>
            </div>
            {tooltip.partners.map(p=>(
              <div key={p.id} onClick={()=>{onSelect(p);setTooltip(null);}}
                style={{display:"flex",alignItems:"center",gap:7,padding:"5px 6px",
                  borderRadius:6,cursor:"pointer",marginBottom:2,
                  background:"rgba(255,255,255,0.07)"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.14)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}>
                <div style={{width:8,height:8,borderRadius:2,
                    background:levelColor(p),flexShrink:0}}/>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.85)",fontWeight:500,
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {p.name.split(" ").slice(0,3).join(" ")}
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Canarias inset */}
      <CanariasInset partners={partners} prospects={prospects}
        selected={selected} hovered={hovered} onSelect={onSelect} provMap={provMap}
        geoSpain={geoSpain} pathGen={pathGen} normName={normName}
        densityColors={DENSITY}/>

      {/* Locality search */}
      <LocalitySearch normName={normName} onHighlight={setGeoHighlight}/>

      {/* Density legend */}
      <div style={{position:"absolute",top:10,left:10,background:"rgba(255,255,255,0.95)",
        border:"1px solid #E2E8F0",borderRadius:8,padding:"8px 11px",
        fontFamily:"system-ui,sans-serif",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:9,fontWeight:800,color:"#475569",textTransform:"uppercase",
          letterSpacing:"0.06em",marginBottom:6}}>Partners / provincia</div>
        {[{n:0,l:"Sin asignar"},{n:1,l:"1 partner"},{n:2,l:"2 partners"},
          {n:3,l:"3 partners"},{n:4,l:"4 o más"}].map(item=>(
          <div key={item.n} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
            <div style={{width:14,height:9,borderRadius:2,flexShrink:0,
              background:DENSITY[Math.min(item.n,DENSITY.length-1)],
              border:"1px solid rgba(0,0,0,0.07)"}}/>
            <span style={{fontSize:10,color:"#475569",fontWeight:500}}>{item.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Province extraction from Nominatim result ─────────────────────────────
const COMMUNITY_TO_PROVINCE = {
  "Comunidad de Madrid": "Madrid",
  "Community of Madrid": "Madrid",
  "Madrid": "Madrid",
  "Andorra": "Andorra",
  "Andorre": "Andorra",
  "Principat d'Andorra": "Andorra",
  "Principado de Andorra": "Andorra",
  // Canarias
  "Las Palmas": "Las Palmas",
  "Santa Cruz de Tenerife": "Santa Cruz de Tenerife",
  "Canarias": "Las Palmas",
  // Comunidades → provincia única o más representativa
  "Región de Murcia": "Murcia",
  "Murcia": "Murcia",
  "La Rioja": "La Rioja",
  "Cantabria": "Cantabria",
  "Asturias": "Asturias",
  "Principado de Asturias": "Asturias",
  "Navarra": "Navarra",
  "Comunidad Foral de Navarra": "Navarra",
  "Extremadura": null, // ambiguous — two provinces
  "Islas Baleares": "Baleares",
  "Illes Balears": "Baleares",
};

function extractProvince(addr, normNameFn) {
  const candidates = [
    addr.province,
    addr.county,
    addr.state_district,
    addr.state,
  ].filter(Boolean);

  for (const raw of candidates) {
    if (COMMUNITY_TO_PROVINCE[raw] !== undefined) {
      return COMMUNITY_TO_PROVINCE[raw] || null;
    }
    const norm = normNameFn(raw);
    if (norm && ALL_PROVS.includes(norm)) return norm;
  }
  return null;
}

function extractLocality(addr) {
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    addr.locality ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    ""
  );
}

// ── Locality search (Nominatim autocomplete) ───────────────────────────────
function LocalitySearch({ normName, onHighlight }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const fetchSuggestions = async (q) => {
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=15&countrycodes=es,ad&accept-language=es`;
      const res = await fetch(url, { headers: { "Accept-Language": "es" } });
      const results = await res.json();

      const qLower = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
      const seen = new Set();
      const items = [];

      for (const r of results) {
        const addr = r.address || {};
        const locality = extractLocality(addr);
        const province = extractProvince(addr, normName);
        if (!province) continue;

        // Match against locality, display_name, or province — normalise accents for comparison
        const localityNorm = locality.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        const displayNorm = (r.display_name||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        const passes = localityNorm.includes(qLower) ||
                       displayNorm.includes(qLower) ||
                       province.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").includes(qLower);
        if (!passes) continue;

        const key = `${locality}-${province}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ locality, province, display: locality ? `${locality} (${province})` : province });
        if (items.length >= 7) break;
      }
      setSuggestions(items);
      setOpen(items.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (val) => {
    setQuery(val);
    setSelected(null);
    onHighlight(null);
    clearTimeout(timerRef.current);
    if (!val.trim()) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(() => fetchSuggestions(val), 350);
  };

  const choose = (item) => {
    setQuery(item.display);
    setSelected(item);
    onHighlight({ province: item.province, label: item.locality || item.province });
    setOpen(false);
    setSuggestions([]);
  };

  const clear = () => {
    setQuery(""); setSelected(null); setSuggestions([]);
    setOpen(false); onHighlight(null);
  };

  return (
    <div ref={wrapRef} style={{position:"absolute",top:10,right:10,zIndex:30,
      fontFamily:"system-ui,sans-serif",width:220}}>
      <div style={{position:"relative"}}>
        <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",
          fontSize:12,color:"#94A3B8",pointerEvents:"none"}}>
          {searching ? "⟳" : "🔍"}
        </span>
        <input
          value={query}
          onChange={e=>handleChange(e.target.value)}
          onFocus={()=>suggestions.length>0&&setOpen(true)}
          placeholder="Buscar localidad…"
          style={{width:"100%",boxSizing:"border-box",
            background:"rgba(255,255,255,0.97)",border:"1px solid #CBD5E1",
            borderRadius:open&&suggestions.length?"8px 8px 0 0":"8px",
            padding:"7px 28px 7px 28px",fontSize:11,
            fontFamily:"system-ui,sans-serif",color:"#1E293B",
            boxShadow:"0 2px 8px rgba(0,0,0,0.08)",outline:"none"}}/>
        {query && (
          <button onClick={clear} style={{position:"absolute",right:8,top:"50%",
            transform:"translateY(-50%)",background:"none",border:"none",
            cursor:"pointer",color:"#94A3B8",fontSize:14,padding:0,lineHeight:1}}>×</button>
        )}
      </div>

      {/* Dropdown suggestions */}
      {open && suggestions.length>0 && (
        <div style={{background:"white",border:"1px solid #CBD5E1",borderTop:"none",
          borderRadius:"0 0 8px 8px",boxShadow:"0 4px 12px rgba(0,0,0,0.1)",
          maxHeight:180,overflowY:"auto"}}>
          {suggestions.map((item,i)=>(
            <div key={i} onClick={()=>choose(item)}
              style={{padding:"7px 10px",fontSize:11,cursor:"pointer",
                borderBottom: i<suggestions.length-1?"1px solid #F1F5F9":"none",
                display:"flex",alignItems:"center",gap:6}}
              onMouseEnter={e=>e.currentTarget.style.background="#F0F7FF"}
              onMouseLeave={e=>e.currentTarget.style.background="white"}>
              <span style={{fontSize:12,flexShrink:0}}>📍</span>
              <span style={{color:"#1E293B",fontWeight:500}}>{item.locality}</span>
              <span style={{color:"#94A3B8",marginLeft:"auto",flexShrink:0}}>{item.province}</span>
            </div>
          ))}
        </div>
      )}

      {/* Selected result pill */}
      {selected && (
        <div style={{marginTop:4,background:"white",border:"1px solid #BBF7D0",
          borderRadius:7,padding:"5px 10px",fontSize:11,color:"#065F46",
          boxShadow:"0 2px 6px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",gap:5}}>
          <span>📍</span>
          <span><strong>{selected.locality||selected.province}</strong> → {selected.province}</span>
        </div>
      )}
    </div>
  );
}

// ── Canarias inset ─────────────────────────────────────────────────────────
function CanariasInset({ provMap, geoSpain, pathGen, normName, onSelect, selected, hovered, densityColors }) {
  const [sharedPopup, setSharedPopup] = useState(null);
  const W=200, H=100;
  const HIGHLIGHT_COLOR = "#1E3A8A";
  const getColor = (norm) => densityColors[Math.min((provMap[norm]||[]).length, densityColors.length-1)];

  const canFeatures = geoSpain ? geoSpain.filter(f=>{
    const n = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||"");
    return n==="Las Palmas"||n==="Santa Cruz de Tenerife";
  }) : [];

  const insetProj = useMemo(()=>{
    if (!canFeatures.length) return null;
    const proj = d3.geoMercator();
    proj.fitExtent([[4,4],[W-4,H-4]], {type:"FeatureCollection",features:canFeatures});
    return proj;
  },[canFeatures.length]);

  const insetPath = insetProj ? d3.geoPath().projection(insetProj) : null;

  // Determine active entity for highlight
  const activeEntity = hovered || selected || null;

  return (
    <div style={{position:"absolute",bottom:10,right:10,background:"white",
      border:"1.5px solid #CBD5E1",borderRadius:8,padding:"6px 8px",
      boxShadow:"0 2px 8px rgba(0,0,0,0.08)",fontFamily:"system-ui,sans-serif"}}>
      <div style={{fontSize:9,fontWeight:800,color:"#475569",textTransform:"uppercase",
        letterSpacing:"0.07em",marginBottom:4}}>Canarias</div>
      {insetPath && canFeatures.length ? (
        <div style={{position:"relative"}}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{width:W,height:H,display:"block"}}>
            <rect width={W} height={H} fill="#DBEAFE" rx="4"/>

            {/* Fill pass */}
            {canFeatures.map((f,i)=>{
              const norm = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||"");
              const ps = provMap[norm] || [];
              const isHighlighted = activeEntity && ps.some(p=>p.id===activeEntity.id);
              const hasHighlight = !!activeEntity;
              const d = insetPath(f);
              const fill = getColor(norm);
              return (
                <g key={i} style={{cursor:ps.length?"pointer":"default"}}
                  onClick={()=>{
                    if (ps.length===1) onSelect(ps[0]);
                    else if (ps.length>1) setSharedPopup({norm, partners:ps});
                    else if (ps.length===0) setSharedPopup(null);
                    // Always show popup for any province with partners
                    if (ps.length>=1) setSharedPopup({norm, partners:ps});
                  }}>
                  <path d={d}
                    fill={isHighlighted ? HIGHLIGHT_COLOR : fill}
                    opacity={hasHighlight && !isHighlighted ? 0.25 : 1}
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth={0.6}
                    style={{transition:"opacity 0.15s, fill 0.15s"}}/>
                </g>
              );
            })}

            {/* Exterior border overlay via mask */}
            {activeEntity && insetPath && (()=>{
              const provs = activeEntity.provinces || [];
              const matchingFeatures = canFeatures.filter(f => {
                const norm = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||"");
                return provs.includes(norm);
              });
              if (!matchingFeatures.length) return null;
              const combinedD = matchingFeatures.map(f=>insetPath(f)).filter(Boolean).join(" ");
              const maskId = `can-mask-${activeEntity.id}`;
              return (
                <g style={{pointerEvents:"none"}}>
                  <defs>
                    <mask id={maskId}>
                      <rect width={W} height={H} fill="white"/>
                      <path d={combinedD} fill="black"/>
                    </mask>
                  </defs>
                  <path d={combinedD}
                    fill="none" stroke="#93C5FD" strokeWidth={4}
                    strokeLinejoin="round" mask={`url(#${maskId})`}/>
                </g>
              );
            })()}

            {/* Labels on top */}
            <g style={{pointerEvents:"none"}}>
              {canFeatures.map((f,i)=>{
                const norm = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||"");
                const ps = provMap[norm] || [];
                const [cx,cy] = insetPath.centroid(f);
                if (!cx||!cy) return null;
                return (
                  <text key={`lbl-${i}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                    fontSize="6" fill={ps.length?"rgba(255,255,255,0.92)":"#94A3B8"}
                    fontFamily="system-ui,sans-serif" fontWeight="600"
                    style={{userSelect:"none"}}>
                    {norm==="Las Palmas"?"Las Palmas":"Sta. Cruz"}
                  </text>
                );
              })}
            </g>
          </svg>
          {/* Popup for Canarias — styled like main map tooltip */}
          {sharedPopup && (
            <div onClick={e=>e.stopPropagation()} style={{
              position:"absolute",bottom:"calc(100% + 6px)",right:0,
              background:"rgba(15,23,42,0.92)",backdropFilter:"blur(6px)",
              borderRadius:9,padding:"9px 11px",minWidth:160,zIndex:60,
              boxShadow:"0 4px 16px rgba(0,0,0,0.25)",fontFamily:"system-ui,sans-serif"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:700,color:"white"}}>{sharedPopup.norm}</span>
                <button onClick={()=>setSharedPopup(null)} style={{background:"none",border:"none",
                  color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>×</button>
              </div>
              {sharedPopup.partners.map(p=>(
                <div key={p.id} onClick={()=>{onSelect(p);setSharedPopup(null);}}
                  style={{display:"flex",alignItems:"center",gap:7,padding:"5px 6px",
                    borderRadius:6,cursor:"pointer",marginBottom:2,
                    background:"rgba(255,255,255,0.07)"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.14)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}>
                  <div style={{width:8,height:8,borderRadius:2,background:levelColor(p),flexShrink:0}}/>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.85)",fontWeight:500,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {p.name.split(" ").slice(0,3).join(" ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        CANARIAS.map(pv=>{
          const ps=provMap[pv]||[];
          return (
            <div key={pv} onClick={()=>ps.length===1&&onSelect(ps[0])}
              style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,cursor:ps.length?"pointer":"default"}}>
              <div style={{width:9,height:9,borderRadius:2,
                background:getColor(pv),flexShrink:0}}/>
              <span style={{fontSize:10,color:"#374151"}}>{pv}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Promote Modal ──────────────────────────────────────────────────────────
function PromoteModal({ entity, onClose, onPromote }) {
  const [level, setLevel] = useState("specialist");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:14,padding:24,width:"100%",maxWidth:340,
        fontFamily:"system-ui,sans-serif",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:16,fontWeight:800,color:"#1E293B",marginBottom:4}}>Convertir a distribuidor</div>
        <div style={{fontSize:13,color:"#64748B",marginBottom:18}}>{entity.name}</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {[{v:"premium",l:"Premium Partner",d:"Acceso a EARLY-3 y EARLY-12",c:"#1E3A8A",bg:"#EEF2FF"},
            {v:"specialist",l:"Specialist",d:"Descuentos base NB/RR",c:"#0891B2",bg:"#ECFEFF"}].map(opt=>(
            <div key={opt.v} onClick={()=>setLevel(opt.v)} style={{
              border:`2px solid ${level===opt.v?opt.c:"#E2E8F0"}`,borderRadius:10,
              padding:"12px 14px",cursor:"pointer",background:level===opt.v?opt.bg:"white",
              transition:"all 0.15s"}}>
              <div style={{fontSize:13,fontWeight:700,color:level===opt.v?opt.c:"#1E293B"}}>{opt.l}</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{opt.d}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{onPromote(entity.id,level);onClose();}}
            style={{flex:1,background:"#1E3A8A",color:"white",border:"none",borderRadius:8,
              padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Convertir</button>
          <button onClick={onClose} style={{flex:1,background:"#F1F5F9",color:"#64748B",border:"none",
            borderRadius:8,padding:"12px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── New Entity Modal ───────────────────────────────────────────────────────
function NewModal({ type, onClose, onSave }) {
  const [form, setForm] = useState({name:"",city:"",level:"specialist",stage:"Primer contacto",notes:""});
  const field = (key,ph,label) => (
    <div key={key}>
      <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
        letterSpacing:"0.05em",display:"block",marginBottom:4}}>{label}</label>
      <input value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
        style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
          fontSize:14,boxSizing:"border-box",fontFamily:"system-ui,sans-serif",color:"#1E293B"}}/>
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,
      display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"white",borderRadius:"16px 16px 0 0",padding:24,width:"100%",
        maxWidth:480,maxHeight:"90vh",overflowY:"auto",fontFamily:"system-ui,sans-serif"}}>
        <div style={{width:36,height:4,background:"#E2E8F0",borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:800,color:"#1E293B"}}>
            {type==="active"?"Nuevo distribuidor":"Nuevo prospecto"}
          </h3>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",width:30,height:30,
            borderRadius:"50%",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {field("name","Nombre de la empresa","Empresa *")}
          {field("city","Ciudad principal","Ciudad")}
          {type==="active" ? (
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
                letterSpacing:"0.05em",display:"block",marginBottom:4}}>Nivel</label>
              <select value={form.level} onChange={e=>setForm(f=>({...f,level:e.target.value}))}
                style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
                  fontSize:14,fontFamily:"system-ui,sans-serif",color:"#1E293B"}}>
                <option value="premium">Premium Partner</option>
                <option value="specialist">Specialist</option>
              </select>
            </div>
          ) : (
            <>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
                  letterSpacing:"0.05em",display:"block",marginBottom:4}}>Estado</label>
                <select value={form.stage} onChange={e=>setForm(f=>({...f,stage:e.target.value}))}
                  style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
                    fontSize:14,fontFamily:"system-ui,sans-serif",color:"#1E293B"}}>
                  {["Primer contacto","Negociación","Propuesta enviada","Contrato pendiente","Parado"].map(s=>
                    <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
                  letterSpacing:"0.05em",display:"block",marginBottom:4}}>Notas</label>
                <textarea value={form.notes} rows={2} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                  style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
                    fontSize:14,resize:"none",boxSizing:"border-box",fontFamily:"system-ui,sans-serif"}}/>
              </div>
            </>
          )}
        </div>
        <div style={{display:"flex",gap:8,marginTop:20}}>
          <button onClick={()=>{
            if(!form.name.trim())return;
            const today = new Date();
            const dateStr = `${today.getDate().toString().padStart(2,"0")}/${(today.getMonth()+1).toString().padStart(2,"0")}/${today.getFullYear()}`;
            const initialUpdates = form.notes?.trim()
              ? [{id:"u"+Date.now(), date:dateStr, text:form.notes.trim()}]
              : [];
            onSave({...form,id:"p"+Date.now(),type:type==="active"?"active":"prospect",
              provinces:[],contacts:[],updates:initialUpdates,arr:0,accounts:0,booking2026:0,
              since:new Date().toISOString().split("T")[0]});
            onClose();
          }} style={{flex:1,background:"#1E3A8A",color:"white",border:"none",borderRadius:8,
            padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Crear</button>
          <button onClick={onClose} style={{flex:1,background:"#F1F5F9",color:"#64748B",border:"none",
            borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Button (two-step confirm) ──────────────────────────────────────
function DeleteButton({ entity, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const label = entity.type==="active" ? "distribuidor" : "prospecto";
  if (!confirm) return (
    <button onClick={()=>setConfirm(true)} style={{width:"100%",background:"white",
      border:"1px solid #FCA5A5",borderRadius:8,padding:"10px",fontSize:13,
      color:"#DC2626",fontWeight:600,cursor:"pointer",
      display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
      🗑 Dar de baja y eliminar {label}
    </button>
  );
  return (
    <div style={{background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:10,padding:"14px"}}>
      <div style={{fontSize:13,fontWeight:700,color:"#DC2626",marginBottom:4}}>
        ¿Confirmar eliminación?
      </div>
      <div style={{fontSize:12,color:"#7F1D1D",marginBottom:12,lineHeight:1.5}}>
        Se eliminará <strong>{entity.name}</strong> y todos sus datos permanentemente. Esta acción no se puede deshacer.
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onDelete} style={{flex:1,background:"#DC2626",color:"white",
          border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          Sí, eliminar
        </button>
        <button onClick={()=>setConfirm(false)} style={{flex:1,background:"#F1F5F9",
          color:"#64748B",border:"none",borderRadius:8,padding:"10px",
          fontSize:13,fontWeight:600,cursor:"pointer"}}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── PDF Attachment ──────────────────────────────────────────────────────────
function PdfAttachment({ pdf }) {
  const [preview, setPreview] = useState(false);
  const download = () => {
    const a = document.createElement("a");
    a.href = pdf.data;
    a.download = pdf.name;
    a.click();
  };
  return (
    <div style={{marginTop:8}}>
      <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:8,
        padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:18,flexShrink:0}}>📄</span>
        <span style={{fontSize:12,color:"#374151",fontWeight:600,flex:1,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pdf.name}</span>
        <button onClick={()=>setPreview(p=>!p)}
          style={{background:"#EEF2FF",border:"none",borderRadius:6,padding:"4px 9px",
            fontSize:11,fontWeight:600,color:"#4F46E5",cursor:"pointer",flexShrink:0}}>
          {preview ? "Cerrar" : "Preview"}
        </button>
        <button onClick={download}
          style={{background:"#F1F5F9",border:"none",borderRadius:6,padding:"4px 9px",
            fontSize:11,fontWeight:600,color:"#374151",cursor:"pointer",flexShrink:0}}>
          ⬇ Descargar
        </button>
      </div>
      {preview && (
        <div style={{marginTop:4,border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",
          background:"#F8FAFC"}}>
          <iframe src={pdf.data} title={pdf.name}
            style={{width:"100%",height:380,border:"none",display:"block"}}/>
        </div>
      )}
    </div>
  );
}

// ── Image Lightbox ─────────────────────────────────────────────────────────
function ImageLightbox({ src, onClose }) {
  const download = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = "imagen-update.jpg";
    a.click();
  };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
      zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",
      flexDirection:"column",gap:12,padding:20}}>
      <div style={{display:"flex",gap:8,alignSelf:"flex-end",marginBottom:4}}>
        <button onClick={e=>{e.stopPropagation();download();}}
          style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",
            color:"white",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,
            cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
          ⬇ Descargar
        </button>
        <button onClick={onClose}
          style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",
            color:"white",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          × Cerrar
        </button>
      </div>
      <img src={src} onClick={e=>e.stopPropagation()}
        style={{maxWidth:"100%",maxHeight:"80vh",borderRadius:10,
          boxShadow:"0 8px 40px rgba(0,0,0,0.5)",objectFit:"contain"}}/>
    </div>
  );
}

// ── Detail Panel — shared desktop/mobile ───────────────────────────────────
function DetailPanel({ entity, onClose, onUpdate, onAddUpdate, onPromote, onDelete, isMobile }) {
  const isActive = entity.type==="active";
  const hdr = isActive&&entity.level==="premium" ? "#1E3A8A" : isActive ? "#0891B2" : "#78716C";
  const [tab, setTab] = useState(isActive?"overview":"contacts");
  const [note, setNote] = useState("");
  const [author, setAuthor] = useState("");
  const [updatePhoto, setUpdatePhoto] = useState(null);
  const [updatePdf, setUpdatePdf] = useState(null); // { name, data (base64) }
  const [editingUpdate, setEditingUpdate] = useState(null);
  const [updateMenu, setUpdateMenu] = useState(null);
  const [editContact, setEditContact] = useState(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({name:"",role:"",email:"",phone:""});
  const [editField, setEditField] = useState(null);
  const [provSearch, setProvSearch] = useState("");
  const [showPromote, setShowPromote] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [infoForm, setInfoForm] = useState({
    name: entity.name||"", city: entity.city||"",
    address: entity.address||"", website: entity.website||"", cif: entity.cif||"",
    since: entity.since||"",
  });
  const [kpiForm, setKpiForm] = useState({
    arr: entity.arr||0, accounts: entity.accounts||0, booking2026: entity.booking2026||0,
  });
  const [infoSaved, setInfoSaved] = useState(false);
  const [kpiSaved, setKpiSaved] = useState(false);

  useEffect(()=>{
    setInfoForm({name:entity.name||"",city:entity.city||"",address:entity.address||"",website:entity.website||"",cif:entity.cif||"",since:entity.since||""});
    setKpiForm({arr:entity.arr||0,accounts:entity.accounts||0,booking2026:entity.booking2026||0});
  },[entity.id]);

  const saveInfo = () => {
    onUpdate({...entity,...infoForm});
    setInfoSaved(true); setTimeout(()=>setInfoSaved(false),2000);
  };
  const saveKpis = () => {
    onUpdate({...entity,arr:Number(kpiForm.arr),accounts:Number(kpiForm.accounts),booking2026:Number(kpiForm.booking2026)});
    setKpiSaved(true); setTimeout(()=>setKpiSaved(false),2000);
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  const tabs = isActive
    ? [{id:"overview",l:"Resumen"},{id:"contacts",l:"Contactos"},{id:"updates",l:"Updates"}]
    : [{id:"contacts",l:"Contactos"},{id:"updates",l:"Updates"}];

  const [reminderDate, setReminderDate]   = useState("");
  const [reminderTime, setReminderTime]   = useState("");
  const [reminderUser, setReminderUser]   = useState("");
  const [reminderNote, setReminderNote]   = useState("");
  const [showReminder, setShowReminder]   = useState(false);

  const addNote = () => {
    if (!note.trim() || !author) return;
    const today = new Date();
    const date = `${today.getDate().toString().padStart(2,"0")}/${(today.getMonth()+1).toString().padStart(2,"0")}/${today.getFullYear()}`;
    const reminder = showReminder && reminderDate
      ? { date: reminderDate, time: reminderTime||"09:00", user: reminderUser||author, note: reminderNote||"", done: false }
      : undefined;
    onAddUpdate(entity.id,{id:"u"+Date.now(),date,author,text:note.trim(),photo:updatePhoto||undefined,pdf:updatePdf||undefined,reminder});
    setNote(""); setUpdatePhoto(null); setUpdatePdf(null);
    setShowReminder(false); setReminderDate(""); setReminderTime(""); setReminderUser(""); setReminderNote("");
  };

  const saveContact = () => {
    if(!contactForm.name.trim()) return;
    const contacts = entity.contacts||[];
    const updated = editContact
      ? contacts.map(c=>c.id===editContact.id?{...editContact,...contactForm}:c)
      : [...contacts,{id:"c"+Date.now(),...contactForm}];
    onUpdate({...entity,contacts:updated});
    setContactForm({name:"",role:"",email:"",phone:""});
    setEditContact(null); setShowAddContact(false);
  };

  const toggleProv = (pv) => {
    const p = entity.provinces||[];
    onUpdate({...entity,provinces:p.includes(pv)?p.filter(x=>x!==pv):[...p,pv]});
  };

  const filteredProv = provSearch.length>1
    ? ALL_PROVS.filter(p=>p.toLowerCase().includes(provSearch.toLowerCase())) : [];

  const inp = (val,onChange,ph) => (
    <input value={val} onChange={e=>onChange(e.target.value)} placeholder={ph}
      style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
        fontSize:14,boxSizing:"border-box",fontFamily:"system-ui,sans-serif",color:"#1E293B"}}/>
  );

  // Mobile: full-screen. Desktop: fills the sidebar column (not fixed).
  const panelStyle = isMobile ? {
    position:"fixed",inset:0,background:"white",zIndex:200,
    display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif",
    overflowY:"auto"
  } : {
    flex:1,background:"white",
    display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif",
    height:"100%",overflow:"hidden"
  };

  return (
    <div style={panelStyle}>
      {lightboxPhoto && <ImageLightbox src={lightboxPhoto} onClose={()=>setLightboxPhoto(null)}/>}
      {/* Header */}
      <div style={{background:hdr,padding:isMobile?"16px 16px 0":"18px 20px 0",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{flex:1}}>
            {/* Editable status badge */}
            {editingStatus ? (
              <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
                {(isActive
                  ? [{v:"premium",l:"Premium"},{v:"specialist",l:"Specialist"}]
                  : ["Primer contacto","Negociación","Propuesta enviada","Contrato pendiente","Parado"].map(s=>({v:s,l:s}))
                ).map(opt=>(
                  <button key={opt.v} onClick={()=>{
                    onUpdate({...entity, ...(isActive?{level:opt.v}:{stage:opt.v})});
                    setEditingStatus(false);
                  }} style={{
                    background:((isActive?entity.level:entity.stage)===opt.v)?"white":"rgba(255,255,255,0.2)",
                    color:((isActive?entity.level:entity.stage)===opt.v)?hdr:"white",
                    border:"none",borderRadius:6,padding:"4px 10px",
                    fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    {opt.l}
                  </button>
                ))}
                <button onClick={()=>setEditingStatus(false)} style={{background:"rgba(255,255,255,0.1)",
                  color:"rgba(255,255,255,0.7)",border:"none",borderRadius:6,
                  padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
              </div>
            ) : (
              <button onClick={()=>setEditingStatus(true)} style={{
                background:"rgba(255,255,255,0.2)",color:"white",fontSize:10,fontWeight:700,
                padding:"3px 10px",borderRadius:10,textTransform:"uppercase",letterSpacing:"0.06em",
                border:"1px dashed rgba(255,255,255,0.4)",cursor:"pointer",marginBottom:6,
                display:"inline-flex",alignItems:"center",gap:4}}>
                {isActive?entity.level:entity.stage||"Prospecto"} ✎
              </button>
            )}
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {entity.logo && (
                <img src={entity.logo} style={{width:36,height:36,borderRadius:8,
                  objectFit:"contain",background:"rgba(255,255,255,0.15)",
                  padding:4,flexShrink:0}}/>
              )}
              <div style={{fontSize:isMobile?16:15,fontWeight:800,color:"white",lineHeight:1.3}}>
                {entity.name}
              </div>
            </div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.65)",marginTop:4,
              display:"flex",alignItems:"center",flexWrap:"wrap",gap:8}}>
              {entity.city}{isActive?` · desde ${entity.since?.split("-")[0]}`:""}
              {!isActive && (
                <button onClick={()=>setShowPromote(true)} style={{
                  background:"#10B981",color:"white",border:"none",borderRadius:6,
                  padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  ↑ Convertir a distribuidor
                </button>
              )}
            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0,marginLeft:8}}>
            <button onClick={()=>setShowEditModal(true)} style={{
              background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.35)",
              color:"white",borderRadius:8,padding:"5px 11px",fontSize:11,fontWeight:700,
              cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              ✏️ Editar
            </button>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",
              color:"white",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:18,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              {isMobile?"←":"×"}
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:2,overflowX:"auto"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              background:tab===t.id?"white":"rgba(255,255,255,0.12)",
              color:tab===t.id?hdr:"rgba(255,255,255,0.85)",
              border:"none",borderRadius:"6px 6px 0 0",padding:isMobile?"9px 16px":"7px 14px",
              fontSize:isMobile?13:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"18px 20px"}}>
        {showPromote && <PromoteModal entity={entity} onClose={()=>setShowPromote(false)} onPromote={onPromote}/>}

        {/* EDIT MODAL */}
        {showEditModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,
            display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"white",borderRadius:14,width:"100%",maxWidth:440,
              maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",
              fontFamily:"system-ui,sans-serif"}}>
              <div style={{padding:"18px 20px",borderBottom:"1px solid #E2E8F0",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:15,fontWeight:800,color:"#1E293B"}}>Editar {entity.name}</div>
                <button onClick={()=>setShowEditModal(false)} style={{background:"#F1F5F9",
                  border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",
                  fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",color:"#64748B"}}>×</button>
              </div>
              <div style={{padding:"18px 20px"}}>
                {/* Logo */}
                <div style={{marginBottom:16}}>
                  <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
                    letterSpacing:"0.05em",display:"block",marginBottom:6}}>Logo</label>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {entity.logo
                      ? <img src={entity.logo} style={{width:48,height:48,borderRadius:8,
                          objectFit:"contain",border:"1px solid #E2E8F0",background:"#F8FAFC",padding:4}}/>
                      : <div style={{width:48,height:48,borderRadius:8,background:"#F1F5F9",
                          border:"1px dashed #CBD5E1",display:"flex",alignItems:"center",
                          justifyContent:"center",fontSize:20,color:"#94A3B8"}}>🏢</div>
                    }
                    <div>
                      <label style={{background:"#EEF2FF",color:"#4F46E5",border:"none",borderRadius:6,
                        padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",display:"block"}}>
                        {entity.logo ? "Cambiar logo" : "Subir logo"}
                        <input type="file" accept="image/*" style={{display:"none"}}
                          onChange={e=>{
                            const file=e.target.files[0]; if(!file) return;
                            const reader=new FileReader();
                            reader.onload=ev=>onUpdate({...entity,logo:ev.target.result});
                            reader.readAsDataURL(file);
                          }}/>
                      </label>
                      {entity.logo && (
                        <button onClick={()=>onUpdate({...entity,logo:null})}
                          style={{background:"none",border:"none",color:"#94A3B8",fontSize:11,
                            cursor:"pointer",marginTop:4,padding:0}}>Eliminar logo</button>
                      )}
                    </div>
                  </div>
                </div>
                {/* Info fields */}
                <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",
                  letterSpacing:"0.06em",marginBottom:10}}>Datos generales</div>
                <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
                  {[
                    {key:"name",   label:"Nombre empresa", ph:"Nombre legal"},
                    {key:"city",   label:"Ciudad",         ph:"Ciudad principal"},
                    {key:"address",label:"Dirección",      ph:"Calle, número, CP"},
                    {key:"cif",    label:"CIF / NIF",      ph:"B12345678"},
                    {key:"website",label:"Web",            ph:"https://"},
                  ].map(f=>(
                    <div key={f.key}>
                      <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
                        letterSpacing:"0.05em",display:"block",marginBottom:4}}>{f.label}</label>
                      <input value={infoForm[f.key]} onChange={e=>setInfoForm(fm=>({...fm,[f.key]:e.target.value}))}
                        placeholder={f.ph}
                        style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
                          fontSize:13,boxSizing:"border-box",fontFamily:"system-ui,sans-serif",color:"#1E293B"}}/>
                    </div>
                  ))}
                  {isActive && (
                    <div>
                      <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
                        letterSpacing:"0.05em",display:"block",marginBottom:4}}>Partner desde</label>
                      <input type="date" value={infoForm.since}
                        onChange={e=>setInfoForm(fm=>({...fm,since:e.target.value}))}
                        style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
                          fontSize:13,boxSizing:"border-box",fontFamily:"system-ui,sans-serif",color:"#1E293B"}}/>
                    </div>
                  )}
                </div>
                <button onClick={()=>{saveInfo();setShowEditModal(false);}} style={{width:"100%",
                  background:hdr,color:"white",border:"none",borderRadius:8,
                  padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  Guardar información
                </button>

                {/* KPIs */}
                {isActive && (
                  <div style={{marginTop:20}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",
                      letterSpacing:"0.06em",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      KPIs
                      <span style={{fontSize:10,color:"#94A3B8",fontStyle:"italic",fontWeight:400,textTransform:"none"}}>Edición manual</span>
                    </div>
                    <div style={{display:"flex",alignItems:"flex-start",gap:6,background:"#FFFBEB",
                      border:"1px solid #FDE68A",borderRadius:7,padding:"8px 10px",marginBottom:10}}>
                      <span style={{fontSize:13,flexShrink:0}}>⚡</span>
                      <span style={{fontSize:11,color:"#92400E",lineHeight:1.4}}>
                        Estos datos idealmente se sincronizarán automáticamente desde la fuente de datos de Cegid.
                        Hasta entonces, puedes editarlos manualmente.
                      </span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {[
                        {key:"arr",        label:"ARR 2025 (€)",       ph:"0"},
                        {key:"accounts",   label:"Nº clientes activos", ph:"0"},
                        {key:"booking2026",label:"Booking 2026 (€)",    ph:"0"},
                      ].map(f=>(
                        <div key={f.key}>
                          <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
                            letterSpacing:"0.05em",display:"block",marginBottom:4}}>{f.label}</label>
                          <input type="number" value={kpiForm[f.key]}
                            onChange={e=>setKpiForm(fm=>({...fm,[f.key]:e.target.value}))}
                            placeholder={f.ph}
                            style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
                              fontSize:13,boxSizing:"border-box",fontFamily:"system-ui,sans-serif",color:"#1E293B"}}/>
                        </div>
                      ))}
                    </div>
                    <button onClick={()=>{saveKpis();setShowEditModal(false);}} style={{width:"100%",marginTop:12,
                      background:"#475569",color:"white",border:"none",borderRadius:8,
                      padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      Guardar KPIs
                    </button>
                  </div>
                )}

                {/* Danger zone */}
                <div style={{marginTop:24,borderTop:"1px solid #FEE2E2",paddingTop:16}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#DC2626",textTransform:"uppercase",
                    letterSpacing:"0.06em",marginBottom:10}}>Zona de peligro</div>
                  {onDelete && <DeleteButton entity={entity} onDelete={()=>{onDelete(entity.id);onClose();}}/>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OVERVIEW */}
        {tab==="overview" && isActive && (
          <div>
            {/* KPI cards */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[
                {label:"ARR 2025",value:"€"+Math.round(entity.arr/1000)+"k",color:hdr},
                {label:"Clientes",value:entity.accounts,color:hdr},
                {label:"Booking 2026",value:"€"+Math.round((entity.booking2026||0)/1000)+"k",color:"#059669"},
              ].map(k=>(
                <div key={k.label} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",
                  borderRadius:10,padding:isMobile?"14px 10px":"12px 10px",textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",
                    letterSpacing:"0.05em",marginBottom:4}}>{k.label}</div>
                  <div style={{fontSize:isMobile?22:20,fontWeight:800,color:k.color}}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Company info block — read only */}
            <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:10,
              padding:"14px",marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",
                letterSpacing:"0.05em",marginBottom:10}}>Información</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {[
                  {icon:"📍", label:"Ciudad",   val:entity.city},
                  {icon:"📅", label:"Desde",    val:entity.since ? new Date(entity.since).getFullYear() : null},
                  {icon:"🔑", label:"CIF",      val:entity.cif},
                  {icon:"🏠", label:"Dirección",val:entity.address},
                  {icon:"🌐", label:"Web",      val:entity.website, isLink:true},
                ].filter(r=>r.val).map(r=>(
                  <div key={r.label} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12}}>
                    <span style={{fontSize:13,flexShrink:0,marginTop:1}}>{r.icon}</span>
                    <span style={{color:"#94A3B8",fontWeight:600,flexShrink:0,width:60}}>{r.label}</span>
                    {r.isLink
                      ? <a href={entity.website} target="_blank" rel="noreferrer"
                          style={{color:"#2563EB",textDecoration:"none",wordBreak:"break-all"}}>
                          {entity.website}
                        </a>
                      : <span style={{color:"#1E293B"}}>{r.val}</span>
                    }
                  </div>
                ))}
                {!entity.city && !entity.cif && !entity.website && !entity.address && !entity.since && (
                  <span style={{fontSize:12,color:"#94A3B8"}}>Sin información. Usa ✏️ Editar para añadir.</span>
                )}
              </div>
            </div>

            {/* Territories */}
            <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:10,padding:"14px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",
                letterSpacing:"0.05em",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                Territorios asignados
                <button onClick={()=>setEditField(editField?"":"prov")} style={{background:"#EEF2FF",border:"none",
                  borderRadius:4,padding:"3px 8px",fontSize:10,color:"#4F46E5",cursor:"pointer",fontWeight:700}}>
                  {editField?"Cerrar":"Editar"}
                </button>
              </div>
              {editField && (
                <div style={{marginBottom:8}}>
                  <input value={provSearch} onChange={e=>setProvSearch(e.target.value)}
                    placeholder="Buscar provincia…" style={{width:"100%",border:"1px solid #E2E8F0",
                      borderRadius:8,padding:"8px 12px",fontSize:13,boxSizing:"border-box",
                      fontFamily:"system-ui,sans-serif",marginBottom:4}}/>
                  {filteredProv.length>0 && (
                    <div style={{border:"1px solid #E2E8F0",borderRadius:8,maxHeight:130,overflowY:"auto",marginBottom:6}}>
                      {filteredProv.map(pv=>(
                        <div key={pv} onClick={()=>{toggleProv(pv);setProvSearch("");}}
                          style={{padding:"8px 12px",fontSize:13,cursor:"pointer",
                            background:(entity.provinces||[]).includes(pv)?"#EEF2FF":"white",
                            borderBottom:"1px solid #F8FAFC",color:"#1E293B"}}>
                          {(entity.provinces||[]).includes(pv)?"✓ ":""}{pv}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(entity.provinces||[]).map(pv=>(
                  <span key={pv} style={{background:"#E0E7FF",color:"#3730A3",fontSize:12,
                    fontWeight:500,padding:"3px 10px",borderRadius:10,
                    cursor:editField?"pointer":"default"}}
                    onClick={()=>editField&&toggleProv(pv)}>
                    {pv}{editField&&" ×"}
                  </span>
                ))}
                {!(entity.provinces||[]).length && (
                  <span style={{fontSize:12,color:"#94A3B8"}}>Sin territorios asignados</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CONTACTS */}
        {tab==="contacts" && (
          <div>
            {[...(entity.contacts||[])].sort((a,b)=>(b.primary?1:0)-(a.primary?1:0)).map(c=>(
              <div key={c.id} style={{
                background: c.primary ? "#FFFBEB" : "#F8FAFC",
                border: `1px solid ${c.primary ? "#FCD34D" : "#E2E8F0"}`,
                borderRadius:10,padding:"14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8,flex:1}}>
                    {/* Star button */}
                    <button
                      title={c.primary?"Quitar contacto principal":"Marcar como contacto principal"}
                      onClick={()=>onUpdate({...entity, contacts:(entity.contacts||[]).map(x=>
                        ({...x, primary: x.id===c.id ? !x.primary : false})
                      )})}
                      style={{background:"none",border:"none",cursor:"pointer",
                        padding:"2px",fontSize:16,lineHeight:1,flexShrink:0,marginTop:1}}>
                      {c.primary ? "★" : "☆"}
                    </button>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:14,fontWeight:700,color:"#1E293B"}}>{c.name}</span>
                        {c.primary && (
                          <span style={{fontSize:9,fontWeight:800,color:"#B45309",background:"#FEF3C7",
                            padding:"1px 6px",borderRadius:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>
                            Principal
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:12,color:"#7C3AED",fontWeight:600,marginTop:2}}>{c.role}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{setEditContact(c);setContactForm({name:c.name,role:c.role,email:c.email,phone:c.phone});setShowAddContact(true);}}
                      style={{background:"#EEF2FF",border:"none",borderRadius:6,padding:"4px 8px",
                        fontSize:11,color:"#4F46E5",cursor:"pointer",fontWeight:600}}>Editar</button>
                    <button onClick={()=>onUpdate({...entity,contacts:(entity.contacts||[]).filter(x=>x.id!==c.id)})}
                      style={{background:"#FEF2F2",border:"none",borderRadius:6,padding:"4px 8px",
                        fontSize:11,color:"#DC2626",cursor:"pointer",fontWeight:600}}>×</button>
                  </div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:12,paddingLeft:28}}>
                  <a href={`mailto:${c.email}`} style={{fontSize:12,color:"#2563EB",
                    textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                    ✉ {c.email}
                  </a>
                  <a href={`tel:${c.phone}`} style={{fontSize:12,color:"#374151",
                    textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                    📱 {c.phone}
                  </a>
                </div>
              </div>
            ))}
            {!(entity.contacts||[]).length && !showAddContact && (
              <div style={{textAlign:"center",color:"#94A3B8",fontSize:13,padding:"24px 0"}}>
                Sin contactos añadidos
              </div>
            )}
            {showAddContact ? (
              <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:10,padding:16,marginTop:8}}>
                <div style={{fontSize:13,fontWeight:700,color:"#475569",marginBottom:12}}>
                  {editContact?"Editar contacto":"Nuevo contacto"}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {inp(contactForm.name,v=>setContactForm(f=>({...f,name:v})),"Nombre *")}
                  {inp(contactForm.role,v=>setContactForm(f=>({...f,role:v})),"Rol / Cargo")}
                  {inp(contactForm.email,v=>setContactForm(f=>({...f,email:v})),"Email")}
                  {inp(contactForm.phone,v=>setContactForm(f=>({...f,phone:v})),"Teléfono")}
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button onClick={saveContact} style={{flex:1,background:hdr,color:"white",
                    border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    Guardar
                  </button>
                  <button onClick={()=>{setShowAddContact(false);setEditContact(null);setContactForm({name:"",role:"",email:"",phone:""});}}
                    style={{flex:1,background:"#F1F5F9",color:"#64748B",border:"none",borderRadius:8,
                      padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={()=>setShowAddContact(true)} style={{width:"100%",marginTop:8,
                background:"#F8FAFC",border:"1px dashed #CBD5E1",borderRadius:10,
                padding:"12px",fontSize:13,color:"#64748B",cursor:"pointer",fontWeight:600}}>
                + Añadir contacto
              </button>
            )}
          </div>
        )}

        {/* UPDATES */}
        {tab==="updates" && (
          <div>
            <div style={{marginBottom:16}}>
              <textarea value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Nueva nota interna…" rows={3}
                style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:10,
                  padding:"12px",fontSize:14,fontFamily:"system-ui,sans-serif",
                  resize:"none",boxSizing:"border-box",color:"#1E293B"}}/>
              {/* Photo preview */}
              {updatePhoto && (
                <div style={{marginTop:6,position:"relative",display:"inline-block"}}>
                  <img src={updatePhoto} style={{maxWidth:"100%",maxHeight:120,borderRadius:8,
                    border:"1px solid #E2E8F0",display:"block"}}/>
                  <button onClick={()=>setUpdatePhoto(null)} style={{position:"absolute",top:4,right:4,
                    background:"rgba(0,0,0,0.5)",color:"white",border:"none",borderRadius:"50%",
                    width:20,height:20,cursor:"pointer",fontSize:12,lineHeight:"20px",textAlign:"center"}}>×</button>
                </div>
              )}
              {/* PDF preview */}
              {updatePdf && (
                <div style={{marginTop:6,background:"#F8FAFC",border:"1px solid #E2E8F0",
                  borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>📄</span>
                  <span style={{fontSize:12,color:"#374151",fontWeight:600,flex:1,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{updatePdf.name}</span>
                  <button onClick={()=>setUpdatePdf(null)} style={{background:"none",border:"none",
                    color:"#94A3B8",fontSize:16,cursor:"pointer",padding:0,lineHeight:1}}>×</button>
                </div>
              )}
              <div style={{display:"flex",alignItems:"center",gap:6,margin:"8px 0 6px"}}>
                <label style={{background:"#F1F5F9",border:"1px solid #E2E8F0",borderRadius:7,
                  padding:"5px 10px",fontSize:11,fontWeight:600,color:"#64748B",cursor:"pointer"}}>
                  🖼 Imagen
                  <input type="file" accept="image/*" style={{display:"none"}}
                    onChange={e=>{
                      const file=e.target.files[0]; if(!file) return;
                      const reader=new FileReader();
                      reader.onload=ev=>setUpdatePhoto(ev.target.result);
                      reader.readAsDataURL(file);
                      e.target.value="";
                    }}/>
                </label>
                <label style={{background:"#F1F5F9",border:"1px solid #E2E8F0",borderRadius:7,
                  padding:"5px 10px",fontSize:11,fontWeight:600,color:"#64748B",cursor:"pointer"}}>
                  📄 PDF
                  <input type="file" accept="application/pdf" style={{display:"none"}}
                    onChange={e=>{
                      const file=e.target.files[0]; if(!file) return;
                      const reader=new FileReader();
                      reader.onload=ev=>setUpdatePdf({name:file.name,data:ev.target.result});
                      reader.readAsDataURL(file);
                      e.target.value="";
                    }}/>
                </label>
              </div>
              <div style={{display:"flex",gap:6,margin:"4px 0"}}>
                <span style={{fontSize:11,color:"#94A3B8",fontWeight:600,
                  alignSelf:"center",marginRight:2}}>¿Quién?</span>
                {["Toni","Gerard"].map(name=>(
                  <button key={name} onClick={()=>setAuthor(author===name?"":name)}
                    style={{flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:700,
                      cursor:"pointer",transition:"all 0.12s",
                      border: author===name ? "none" : "1px solid #E2E8F0",
                      background: author===name ? hdr : "white",
                      color: author===name ? "white" : "#64748B"}}>
                    {name}
                  </button>
                ))}
              </div>

              {/* Reminder toggle — optional, independent of update */}
              <div style={{marginTop:6}}>
                <button onClick={()=>setShowReminder(r=>!r)} style={{
                  background:showReminder?"#FEF9C3":"#F8FAFC",
                  border:`1px solid ${showReminder?"#FDE047":"#E2E8F0"}`,
                  borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,
                  color:showReminder?"#92400E":"#64748B",cursor:"pointer",
                  display:"flex",alignItems:"center",gap:5}}>
                  🔔 {showReminder?"Quitar recordatorio":"Añadir recordatorio"}
                </button>
                {showReminder && (
                  <div style={{marginTop:8,background:"#FFFBEB",border:"1px solid #FDE68A",
                    borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{display:"flex",gap:8}}>
                      <div style={{flex:1}}>
                        <label style={{fontSize:10,fontWeight:700,color:"#92400E",
                          textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:3}}>
                          Día
                        </label>
                        <input type="date" value={reminderDate}
                          onChange={e=>setReminderDate(e.target.value)}
                          style={{width:"100%",border:"1px solid #FDE68A",borderRadius:6,
                            padding:"7px 8px",fontSize:12,boxSizing:"border-box",
                            fontFamily:"system-ui,sans-serif",background:"white"}}/>
                      </div>
                      <div style={{flex:1}}>
                        <label style={{fontSize:10,fontWeight:700,color:"#92400E",
                          textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:3}}>
                          Hora
                        </label>
                        <input type="time" value={reminderTime}
                          onChange={e=>setReminderTime(e.target.value)}
                          style={{width:"100%",border:"1px solid #FDE68A",borderRadius:6,
                            padding:"7px 8px",fontSize:12,boxSizing:"border-box",
                            fontFamily:"system-ui,sans-serif",background:"white"}}/>
                      </div>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:"#92400E",
                        textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:3}}>
                        Para
                      </label>
                      <div style={{display:"flex",gap:5}}>
                        {["Toni","Gerard"].map(name=>(
                          <button key={name} onClick={()=>setReminderUser(reminderUser===name?"":name)}
                            style={{flex:1,padding:"5px 0",borderRadius:6,fontSize:11,fontWeight:700,
                              cursor:"pointer",
                              border: reminderUser===name ? "none" : "1px solid #FDE68A",
                              background: reminderUser===name ? "#92400E" : "white",
                              color: reminderUser===name ? "white" : "#92400E"}}>
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:"#92400E",
                        textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:3}}>
                        Motivo
                      </label>
                      <input value={reminderNote} onChange={e=>setReminderNote(e.target.value)}
                        placeholder="ej. llamada, correo, avisar manager…"
                        style={{width:"100%",border:"1px solid #FDE68A",borderRadius:6,
                          padding:"7px 8px",fontSize:12,boxSizing:"border-box",
                          fontFamily:"system-ui,sans-serif",background:"white",color:"#1E293B"}}/>
                    </div>
                    {/* Save reminder-only button */}
                    <button onClick={()=>{
                      if (!reminderDate) return;
                      const user = reminderUser || author || "Toni";
                      const today = new Date();
                      const date = `${today.getDate().toString().padStart(2,"0")}/${(today.getMonth()+1).toString().padStart(2,"0")}/${today.getFullYear()}`;
                      const reminder = { date: reminderDate, time: reminderTime||"09:00", user, note: reminderNote||"", done: false };
                      onAddUpdate(entity.id,{id:"u"+Date.now(),date,author:user,
                        text:`🔔 ${reminderNote||"Recordatorio"} · ${reminderDate.split("-").reverse().join("/")}${reminderTime?" a las "+reminderTime:""}`,
                        reminder});
                      setShowReminder(false); setReminderDate(""); setReminderTime(""); setReminderUser(""); setReminderNote("");
                    }} disabled={!reminderDate}
                      style={{width:"100%",background:reminderDate?"#92400E":"#E2E8F0",
                        color:reminderDate?"white":"#94A3B8",border:"none",borderRadius:6,
                        padding:"8px",fontSize:12,fontWeight:700,
                        cursor:reminderDate?"pointer":"default"}}>
                      🔔 Guardar solo recordatorio
                    </button>
                  </div>
                )}
              </div>
              <button onClick={addNote}
                disabled={!note.trim() || !author}
                style={{width:"100%",marginTop:8,
                  background: note.trim()&&author ? hdr : "#E2E8F0",
                  color: note.trim()&&author ? "white" : "#94A3B8",
                  border:"none",borderRadius:8,padding:"12px",
                  fontSize:14,fontWeight:700,cursor:note.trim()&&author?"pointer":"default",
                  transition:"background 0.15s"}}>
                + Añadir update
              </button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[...(entity.updates||[])].reverse().map(u=>{
                const isEditing = editingUpdate?.id === u.id;
                const showMenu = updateMenu === u.id;
                return (
                  <div key={u.id} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",
                    borderRadius:10,padding:"14px",position:"relative"}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:11,fontWeight:700,color:"#4F46E5",background:"#EEF2FF",
                        padding:"2px 8px",borderRadius:8}}>{u.author}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:"#94A3B8"}}>{u.date}</span>
                        <div style={{position:"relative"}}>
                          <button onClick={()=>setUpdateMenu(showMenu?null:u.id)}
                            style={{background:"none",border:"none",cursor:"pointer",
                              color:"#94A3B8",fontSize:16,lineHeight:1,padding:"0 2px"}}>⋯</button>
                          {showMenu && (
                            <div style={{position:"absolute",right:0,top:"100%",
                              background:"white",border:"1px solid #E2E8F0",borderRadius:8,
                              boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:60,minWidth:110,overflow:"hidden"}}>
                              <button onClick={()=>{setEditingUpdate({id:u.id,text:u.text});setUpdateMenu(null);}}
                                style={{width:"100%",padding:"9px 14px",background:"none",border:"none",
                                  cursor:"pointer",fontSize:12,textAlign:"left",color:"#374151"}}
                                onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"}
                                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                                ✏️ Editar
                              </button>
                              <button onClick={()=>{
                                onUpdate({...entity,updates:(entity.updates||[]).filter(x=>x.id!==u.id)});
                                setUpdateMenu(null);
                              }} style={{width:"100%",padding:"9px 14px",background:"none",border:"none",
                                cursor:"pointer",fontSize:12,textAlign:"left",color:"#EF4444"}}
                                onMouseEnter={e=>e.currentTarget.style.background="#FEF2F2"}
                                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                                🗑 Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {isEditing ? (
                      <div>
                        <textarea value={editingUpdate.text}
                          onChange={e=>setEditingUpdate(eu=>({...eu,text:e.target.value}))}
                          rows={3} style={{width:"100%",border:"1px solid #818CF8",borderRadius:8,
                            padding:"8px 10px",fontSize:13,fontFamily:"system-ui,sans-serif",
                            resize:"none",boxSizing:"border-box",color:"#1E293B"}}/>
                        <div style={{display:"flex",gap:6,marginTop:6}}>
                          <button onClick={()=>{
                            onUpdate({...entity,updates:(entity.updates||[]).map(x=>x.id===u.id?{...x,text:editingUpdate.text}:x)});
                            setEditingUpdate(null);
                          }} style={{flex:1,background:"#4F46E5",color:"white",border:"none",
                            borderRadius:6,padding:"7px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                            Guardar
                          </button>
                          <button onClick={()=>setEditingUpdate(null)}
                            style={{flex:1,background:"#F1F5F9",color:"#64748B",border:"none",
                              borderRadius:6,padding:"7px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p style={{margin:0,fontSize:13,color:"#374151",lineHeight:1.6}}>{u.text}</p>
                        {u.reminder && (
                          <div style={{marginTop:8,background:u.reminder.done?"#F0FDF4":"#FFFBEB",
                            border:`1px solid ${u.reminder.done?"#BBF7D0":"#FDE68A"}`,
                            borderRadius:7,padding:"7px 10px",display:"flex",
                            alignItems:"center",gap:7}}>
                            <span style={{fontSize:13}}>{u.reminder.done?"✅":"🔔"}</span>
                            <div style={{flex:1,fontSize:11,color:u.reminder.done?"#166534":"#92400E",lineHeight:1.4}}>
                              <strong>{u.reminder.user}</strong>
                              {" · "}{u.reminder.date.split("-").reverse().join("/")}
                              {u.reminder.time && ` a las ${u.reminder.time}`}
                              {u.reminder.note && <div style={{marginTop:2,fontStyle:"italic",opacity:0.85}}>{u.reminder.note}</div>}
                            </div>
                            {!u.reminder.done && (
                              <button onClick={()=>onUpdate({...entity,updates:(entity.updates||[]).map(x=>
                                x.id===u.id?{...x,reminder:{...x.reminder,done:true}}:x
                              )})} style={{background:"#059669",color:"white",border:"none",
                                borderRadius:5,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                                Hecho
                              </button>
                            )}
                          </div>
                        )}
                        {u.photo && (
                          <img src={u.photo} style={{marginTop:8,maxWidth:"100%",borderRadius:8,
                            border:"1px solid #E2E8F0",display:"block",cursor:"zoom-in"}}
                            onClick={()=>setLightboxPhoto(u.photo)}/>
                        )}
                        {u.pdf && <PdfAttachment pdf={u.pdf}/>}
                      </>
                    )}
                  </div>
                );
              })}
              {!(entity.updates||[]).length && (
                <div style={{textAlign:"center",color:"#94A3B8",fontSize:13,padding:"24px 0"}}>Sin updates</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Entity row (sidebar compact) ───────────────────────────────────────────
function EntityRow({ e, selected, onClick, onHover, isMobile }) {
  return (
    <div onClick={onClick}
      onMouseEnter={()=>onHover&&onHover(e)}
      onMouseLeave={()=>onHover&&onHover(null)}
      style={{
      padding:isMobile?"14px 16px":"9px 12px",
      borderBottom:"1px solid #F1F5F9",cursor:"pointer",
      background:selected?"#EEF2FF":"white",
      borderLeft:`3px solid ${selected?"#1E3A8A":"transparent"}`,
      transition:"background 0.1s"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:isMobile?14:11,fontWeight:700,color:"#1E293B",
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {e.name}
          </div>
          <div style={{fontSize:isMobile?12:10,color:"#94A3B8",marginTop:2}}>
            {e.city}{e.type==="active"&&e.arr?` · €${Math.round(e.arr/1000)}k ARR`:""}
          </div>
        </div>
        <span style={{fontSize:isMobile?10:8,fontWeight:800,padding:"2px 6px",borderRadius:6,
          flexShrink:0,background:levelBg(e),color:levelText(e)}}>
          {levelLabel(e)}
        </span>
      </div>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────────────────
// ── Login Screen ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password) { setError("Introduce usuario y contraseña."); return; }
    setLoading(true); setError("");
    const user = await authLogin(username, password);
    setLoading(false);
    if (user) { onLogin(user); }
    else { setError("Usuario o contraseña incorrectos."); }
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0F172A 0%,#1E3A8A 60%,#1d4ed8 100%)",
      display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380,padding:"0 20px"}}>
        {/* Logo / Brand */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
            width:56,height:56,background:"rgba(255,255,255,0.12)",borderRadius:16,
            backdropFilter:"blur(8px)",marginBottom:16,border:"1px solid rgba(255,255,255,0.2)"}}>
            <span style={{fontSize:26}}>🗺</span>
          </div>
          <div style={{fontSize:22,fontWeight:800,color:"white",letterSpacing:"-0.02em"}}>PD Dashboard</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>Canal de Distribución · Cegid Revo</div>
        </div>

        {/* Card */}
        <div style={{background:"rgba(255,255,255,0.06)",backdropFilter:"blur(16px)",
          border:"1px solid rgba(255,255,255,0.12)",borderRadius:20,padding:28}}>
          <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:20}}>Acceder</div>

          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.5)",
              textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:6}}>Usuario</label>
            <input
              value={username} onChange={e=>setUsername(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
              placeholder="tu.nombre"
              autoComplete="username"
              style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:10,padding:"11px 14px",fontSize:14,color:"white",boxSizing:"border-box",
                outline:"none",fontFamily:"system-ui,sans-serif"}}/>
          </div>

          <div style={{marginBottom:20,position:"relative"}}>
            <label style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.5)",
              textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:6}}>Contraseña</label>
            <input
              type={showPw?"text":"password"}
              value={password} onChange={e=>setPassword(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:10,padding:"11px 40px 11px 14px",fontSize:14,color:"white",boxSizing:"border-box",
                outline:"none",fontFamily:"system-ui,sans-serif"}}/>
            <button onClick={()=>setShowPw(v=>!v)}
              style={{position:"absolute",right:12,top:34,background:"none",border:"none",
                cursor:"pointer",color:"rgba(255,255,255,0.4)",fontSize:14,padding:0}}>
              {showPw?"🙈":"👁"}
            </button>
          </div>

          {error && (
            <div style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",
              borderRadius:8,padding:"9px 12px",fontSize:12,color:"#FCA5A5",marginBottom:14}}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading}
            style={{width:"100%",background:loading?"rgba(255,255,255,0.1)":"#2563EB",
              color:"white",border:"none",borderRadius:10,padding:"13px",fontSize:14,
              fontWeight:700,cursor:loading?"default":"pointer",transition:"background 0.15s",
              letterSpacing:"0.01em"}}>
            {loading ? "Verificando…" : "Entrar →"}
          </button>
        </div>

        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"rgba(255,255,255,0.25)"}}>
          Acceso restringido · Cegid Revo Channel
        </div>
      </div>
    </div>
  );
}

// ── CSV Import Modal ───────────────────────────────────────────────────────
// Known aliases: CSV name → app partner name fragment
const CSV_ALIASES = {
  "babs 2008": "314tt",
  "babs": "314tt",
};

function normalizeName(str) {
  let s = str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[.,'"()\[\]]/g,"")
    .replace(/\b(sl|slu|sa|slp|sau|s\.l|s\.l\.|s\.a|srl|sarl|sociedad limitada|unipersonal|the|y|i|de|la|el|los|las|&)\b/gi,"")
    .replace(/\s+/g," ").trim();
  // Apply aliases
  for (const [alias, replacement] of Object.entries(CSV_ALIASES)) {
    if (s.includes(alias)) s = s.replace(alias, replacement);
  }
  return s;
}

function fuzzyScore(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  // Token overlap score
  const ta = new Set(na.split(" ").filter(t=>t.length>2));
  const tb = new Set(nb.split(" ").filter(t=>t.length>2));
  const intersection = [...ta].filter(t=>tb.has(t)).length;
  const union = new Set([...ta,...tb]).size;
  return union ? intersection/union : 0;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase());
  const rows = [];
  for (let i=1; i<lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Handle quoted fields with commas
    const vals = [];
    let cur="", inQ=false;
    for (const ch of line) {
      if (ch==='"') { inQ=!inQ; }
      else if (ch==="," && !inQ) { vals.push(cur.trim()); cur=""; }
      else cur+=ch;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h,i)=>{ row[h]=vals[i]||""; });
    rows.push(row);
  }
  return rows;
}

function CsvImportModal({ content, partners, savedAliases, onClose, onConfirm }) {
  const rows = useMemo(()=>parseCSV(content),[content]);
  const [excluded, setExcluded] = useState(new Set());
  // manualMap: { csvName → partnerId } for unmatched rows
  const [manualMap, setManualMap] = useState(()=>{
    // Pre-fill from saved aliases
    const init = {};
    if (savedAliases) {
      rows.forEach(row=>{
        const csvName = row["distribuidor"]||row["partner"]||row["nombre"]||Object.values(row)[0]||"";
        if (savedAliases[csvName]) init[csvName] = savedAliases[csvName];
      });
    }
    return init;
  });

  const matches = useMemo(()=>{
    return rows.map(row=>{
      const csvName = row["distribuidor"]||row["partner"]||row["nombre"]||Object.values(row)[0]||"";
      const arrVal = parseFloat((row["arr"]||"").replace(",","."));

      // Check saved aliases first
      if (savedAliases[csvName]) {
        const p = partners.find(x=>x.id===savedAliases[csvName]);
        if (p) return { csvName, arr:isNaN(arrVal)?null:Math.round(arrVal), partner:p, score:1, matched:true, isAlias:true };
      }

      let best=null, bestScore=0;
      for (const p of partners) {
        const score = fuzzyScore(csvName, p.name);
        if (score>bestScore) { bestScore=score; best=p; }
      }
      const matched = bestScore>=0.35;
      return {
        csvName,
        arr: isNaN(arrVal)?null:Math.round(arrVal),
        partner: matched?best:null,
        score: bestScore,
        matched,
      };
    }).filter(r=>r.csvName);
  },[rows,partners,savedAliases]);

  const toUpdate = matches.filter(m=>m.matched && m.arr!==null);
  const notFound = matches.filter(m=>!m.matched);

  // Manually assigned rows (from notFound)
  const manualUpdates = notFound
    .filter(m=>manualMap[m.csvName] && m.arr!==null)
    .map(m=>({
      ...m,
      partner: partners.find(p=>p.id===manualMap[m.csvName]),
      score: 1,
      matched: true,
      isManual: true,
    }))
    .filter(m=>m.partner);

  const activeUpdates = [
    ...toUpdate.filter(m=>!excluded.has(m.csvName)),
    ...manualUpdates.filter(m=>!excluded.has(m.csvName)),
  ];

  // New aliases from this session (for saving)
  const newAliases = Object.fromEntries(
    Object.entries(manualMap).filter(([csvName])=>
      notFound.some(m=>m.csvName===csvName)
    )
  );

  const toggleRow = (csvName) => {
    setExcluded(s=>{ const n=new Set(s); n.has(csvName)?n.delete(csvName):n.add(csvName); return n; });
  };

  const confidenceLabel = (score, isManual, isAlias) => {
    if (isAlias)  return { text:"Guardado", color:"#0891B2" };
    if (isManual) return { text:"Manual",   color:"#7C3AED" };
    if (score>=0.8) return { text:"Alta",   color:"#059669" };
    if (score>=0.5) return { text:"Media",  color:"#D97706" };
    return { text:"Baja", color:"#DC2626" };
  };

  const allUpdates = [...toUpdate, ...manualUpdates];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,
      fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"white",borderRadius:14,width:"100%",maxWidth:600,
        maxHeight:"88vh",display:"flex",flexDirection:"column",
        boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>

        <div style={{padding:"18px 20px",borderBottom:"1px solid #E2E8F0",
          display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"#1E293B"}}>Importar CSV</div>
            <div style={{fontSize:12,color:"#64748B",marginTop:2}}>
              {activeUpdates.length} partners se actualizarán · {notFound.length - manualUpdates.length} sin asignar
            </div>
          </div>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",
            borderRadius:"50%",width:30,height:30,cursor:"pointer",fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center",color:"#64748B"}}>×</button>
        </div>

        <div style={{overflowY:"auto",flex:1,padding:"12px 20px"}}>

          {/* Auto-matched */}
          {allUpdates.length > 0 && (
            <>
              <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",
                letterSpacing:"0.06em",marginBottom:8}}>Se actualizarán — click para excluir</div>
              {allUpdates.map((m,i)=>{
                const isExcluded = excluded.has(m.csvName);
                const conf = confidenceLabel(m.score, m.isManual, m.isAlias);
                return (
                  <div key={i} onClick={()=>toggleRow(m.csvName)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                      background:isExcluded?"#F8FAFC":m.isManual?"#F5F3FF":"#F0FDF4",
                      border:`1px solid ${isExcluded?"#E2E8F0":m.isManual?"#DDD6FE":"#BBF7D0"}`,
                      borderRadius:8,marginBottom:6,cursor:"pointer",
                      opacity:isExcluded?0.5:1,transition:"all 0.15s"}}>
                    <span style={{fontSize:14,flexShrink:0}}>{isExcluded?"⬜":m.isManual?"🔗":"✅"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#1E293B",
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {m.partner.name}
                      </div>
                      <div style={{fontSize:10,color:"#64748B"}}>
                        CSV: "{m.csvName}" ·{" "}
                        <span style={{color:conf.color,fontWeight:700}}>{conf.text}
                          {!m.isManual && ` (${Math.round(m.score*100)}%)`}
                        </span>
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:11,color:"#94A3B8",textDecoration:"line-through"}}>
                        €{Math.round((m.partner.arr||0)/1000)}k
                      </div>
                      <div style={{fontSize:13,fontWeight:800,color:"#059669"}}>
                        €{Math.round(m.arr/1000)}k
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Unmatched — with assignment dropdown */}
          {notFound.filter(m=>!manualMap[m.csvName]).length > 0 && (
            <>
              <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",
                letterSpacing:"0.06em",marginBottom:8,marginTop:16}}>
                Sin asignar — selecciona partner manualmente
              </div>
              {notFound.filter(m=>!manualMap[m.csvName]).map((m,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,
                  padding:"10px 12px",background:"#FEF9F0",border:"1px solid #FDE68A",
                  borderRadius:8,marginBottom:6}}>
                  <span style={{fontSize:13,flexShrink:0}}>⚠️</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#92400E",
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.csvName}</div>
                    {m.arr!==null && <div style={{fontSize:10,color:"#94A3B8"}}>ARR: €{Math.round(m.arr/1000)}k</div>}
                  </div>
                  <select
                    value={manualMap[m.csvName]||""}
                    onChange={e=>{
                      const val=e.target.value;
                      setManualMap(prev=>val?{...prev,[m.csvName]:val}:Object.fromEntries(Object.entries(prev).filter(([k])=>k!==m.csvName)));
                    }}
                    onClick={e=>e.stopPropagation()}
                    style={{border:"1px solid #FDE68A",borderRadius:6,padding:"5px 8px",
                      fontSize:11,color:"#374151",background:"white",cursor:"pointer",
                      maxWidth:180,flexShrink:0}}>
                    <option value="">— Asignar partner —</option>
                    {[...partners].sort((a,b)=>a.name.localeCompare(b.name,"es")).map(p=>(
                      <option key={p.id} value={p.id}>{p.name.split(" ").slice(0,3).join(" ")}</option>
                    ))}
                  </select>
                </div>
              ))}
            </>
          )}

          {/* Saved aliases note */}
          {Object.keys(newAliases).length > 0 && (
            <div style={{marginTop:12,padding:"8px 12px",background:"#EEF2FF",borderRadius:8,
              fontSize:11,color:"#4338CA",display:"flex",alignItems:"center",gap:6}}>
              <span>💾</span>
              <span>Las {Object.keys(newAliases).length} asignaciones manuales se recordarán para la próxima importación.</span>
            </div>
          )}
        </div>

        <div style={{padding:"14px 20px",borderTop:"1px solid #E2E8F0",
          display:"flex",gap:8,flexShrink:0}}>
          <button
            onClick={()=>onConfirm(
              activeUpdates.map(m=>({id:m.partner.id,fields:{arr:m.arr}})),
              newAliases
            )}
            disabled={activeUpdates.length===0}
            style={{flex:1,background:activeUpdates.length?"#1E3A8A":"#E2E8F0",
              color:activeUpdates.length?"white":"#94A3B8",border:"none",borderRadius:8,
              padding:"11px",fontSize:13,fontWeight:700,
              cursor:activeUpdates.length?"pointer":"default"}}>
            Confirmar actualización ({activeUpdates.length} partners)
          </button>
          <button onClick={onClose} style={{background:"#F1F5F9",color:"#64748B",
            border:"none",borderRadius:8,padding:"11px",fontSize:13,fontWeight:600,
            cursor:"pointer",minWidth:90}}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(()=>loadSession());

  const handleLogin = (user) => { saveSession(user); setSession(user); };
  const handleLogout = () => { clearSession(); setSession(null); };

  if (!session) return <LoginScreen onLogin={handleLogin}/>;

  return <AppInner session={session} onLogout={handleLogout}/>;
}

function AppInner({ session, onLogout }) {
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("arr");
  const [showRemindersPanel, setShowRemindersPanel] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [view, setView] = useState("partners"); // "partners" | "dashboard"
  const [syncState, setSyncState] = useState("idle"); // idle | saving | saved | error
  const saveTimer = useRef(null);

  useEffect(()=>{
    setSyncState("saving");
    dbLoad().then(d=>{ setData(d||SEED); setSyncState("idle"); });
  },[]);

  useEffect(()=>{
    if (!data) return;
    setSyncState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async ()=>{
      try {
        await dbSave(data);
        setSyncState("saved");
        setTimeout(()=>setSyncState("idle"), 2000);
      } catch {
        setSyncState("error");
      }
    }, 800); // debounce 800ms
  },[data]);

  const updateEntity = useCallback((updated)=>{
    setData(d=>({...d,
      partners:d.partners.map(p=>p.id===updated.id?updated:p),
      prospects:d.prospects.map(p=>p.id===updated.id?updated:p),
    }));
    setSelected(updated);
  },[]);

  const addUpdate = useCallback((id,upd)=>{
    setData(d=>{
      const up=arr=>arr.map(p=>p.id===id?{...p,updates:[...(p.updates||[]),upd]}:p);
      const next={...d,partners:up(d.partners),prospects:up(d.prospects)};
      const fresh=[...next.partners,...next.prospects].find(p=>p.id===id);
      if(fresh) setSelected(fresh);
      return next;
    });
  },[]);

  const addEntity = useCallback((e)=>{
    setData(d=>e.type==="active"?{...d,partners:[...d.partners,e]}:{...d,prospects:[...d.prospects,e]});
  },[]);

  const promoteProspect = useCallback((prospectId,level)=>{
    setData(d=>{
      const prospect=d.prospects.find(p=>p.id===prospectId);
      if(!prospect) return d;
      const promoted={...prospect,type:"active",level,arr:0,accounts:0,booking2026:0,
        since:new Date().toISOString().split("T")[0],
        updates:[...(prospect.updates||[]),{id:"u"+Date.now(),
          date:new Date().toISOString().split("T")[0],author:"Sistema",
          text:`Convertido a distribuidor ${level==="premium"?"Premium Partner":"Specialist"}.`}]};
      const next={...d,partners:[...d.partners,promoted],prospects:d.prospects.filter(p=>p.id!==prospectId)};
      setSelected(promoted);
      return next;
    });
  },[]);

  const deleteEntity = useCallback((id)=>{
    setData(d=>({
      ...d,
      partners: d.partners.filter(p=>p.id!==id),
      prospects: d.prospects.filter(p=>p.id!==id),
    }));
    setSelected(null);
  },[]);

  const handleCsvConfirm = useCallback((updates, newAliases)=>{
    setData(d=>{
      const np = d.partners.map(p=>{
        const u = updates.find(x=>x.id===p.id);
        return u ? {...p,...u.fields} : p;
      });
      // Merge new aliases into saved aliases
      const mergedAliases = {...(d.csvAliases||{}), ...newAliases};
      return {...d, partners:np, csvAliases:mergedAliases};
    });
    setSelected(s=>{
      if (!s) return s;
      const u = updates.find(x=>x.id===s.id);
      return u ? {...s,...u.fields} : s;
    });
    setModal(null);
  },[]);

  if(!data) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100vh",fontFamily:"system-ui,sans-serif",color:"#64748B"}}>Cargando…</div>
  );

  const all=[...data.partners,...data.prospects];
  const filtered=all.filter(e=>{
    const ms=!search||e.name.toLowerCase().includes(search.toLowerCase())||(e.city||"").toLowerCase().includes(search.toLowerCase());
    const mf=filter==="all"
      ||(filter==="active"&&e.type==="active")
      ||(filter==="premium"&&e.type==="active"&&e.level==="premium")
      ||(filter==="specialist"&&e.type==="active"&&e.level==="specialist")
      ||(filter==="prospect"&&e.type==="prospect");
    return ms&&mf;
  }).sort((a,b)=>{
    if (sort==="arr")  return (b.arr||0)-(a.arr||0);
    if (sort==="az")   return a.name.localeCompare(b.name,"es");
    if (sort==="za")   return b.name.localeCompare(a.name,"es");
    return 0;
  });

  const premCount=data.partners.filter(p=>p.level==="premium").length;
  const spCount=data.partners.filter(p=>p.level==="specialist").length;
  const prCount=data.prospects.length;
  const totalArr=data.partners.reduce((s,p)=>s+(p.arr||0),0);

  const pendingReminders = [...data.partners,...data.prospects].flatMap(e=>
    (e.updates||[])
      .filter(u=>u.reminder && !u.reminder.done)
      .map(u=>({...u.reminder, updateId:u.id, entityId:e.id, entityName:e.name, updateText:u.text}))
  ).sort((a,b)=>a.date>b.date?1:-1);

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────
  if(isMobile) return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",
      fontFamily:"system-ui,sans-serif",background:"#F8FAFC"}}>

      {/* Mobile header */}
      <div style={{background:"#1E3A8A",padding:"12px 16px",flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>🗺</span>
          <span style={{color:"white",fontWeight:800,fontSize:16}}>PD Dashboard</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setModal("prospect")} style={{background:"rgba(255,255,255,0.15)",
            color:"white",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,
            padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            + Prospecto
          </button>
          <button onClick={onLogout} style={{background:"rgba(255,255,255,0.08)",
            color:"rgba(255,255,255,0.5)",border:"1px solid rgba(255,255,255,0.15)",
            borderRadius:8,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>
            ⏏
          </button>
        </div>
      </div>

      {/* Mobile stats strip */}
      <div style={{background:"#1E3A8A",borderTop:"1px solid rgba(255,255,255,0.1)",
        padding:"8px 16px 12px",display:"flex",gap:16,overflowX:"auto",flexShrink:0}}>
        {[{v:premCount,l:"Premium",c:"#93C5FD"},{v:spCount,l:"Specialist",c:"#BFDBFE"},
          {v:prCount,l:"Prospectos",c:"#FCD34D"},
          {v:"€"+Math.round(totalArr/1000)+"k",l:"ARR",c:"#6EE7B7"}].map(s=>(
          <div key={s.l} style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            <span style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</span>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:600}}>{s.l}</span>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{padding:"12px 16px 8px",background:"white",
        borderBottom:"1px solid #F1F5F9",flexShrink:0}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Buscar partner o ciudad…"
          style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:10,
            padding:"10px 14px",fontSize:14,boxSizing:"border-box",
            fontFamily:"system-ui,sans-serif",color:"#1E293B"}}/>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={{
            flex:1,border:"1px solid #E2E8F0",borderRadius:8,padding:"8px 10px",
            fontSize:13,fontFamily:"system-ui,sans-serif",color:"#374151",
            background:"white",cursor:"pointer",outline:"none"}}>
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="premium">Premium</option>
            <option value="specialist">Specialist</option>
            <option value="prospect">Prospectos</option>
          </select>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{
            flex:1,border:"1px solid #E2E8F0",borderRadius:8,padding:"8px 10px",
            fontSize:13,fontFamily:"system-ui,sans-serif",color:"#374151",
            background:"white",cursor:"pointer",outline:"none"}}>
            <option value="arr">Mayor ARR</option>
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div style={{flex:1,overflowY:"auto",background:"white"}}>
        {filtered.map(e=>(
          <EntityRow key={e.id} e={e} selected={selected?.id===e.id}
            onClick={()=>setSelected(e)} isMobile={true}/>
        ))}
        {!filtered.length && (
          <div style={{padding:40,textAlign:"center",color:"#94A3B8",fontSize:14}}>
            Sin resultados
          </div>
        )}
      </div>

      {/* Detail panel (full screen on mobile) */}
      {selected && (
        <DetailPanel entity={selected} onClose={()=>{setSelected(null);setHovered(null);}}
          onUpdate={updateEntity} onAddUpdate={addUpdate}
          onPromote={promoteProspect} onDelete={deleteEntity} isMobile={true}/>
      )}
      {modal?.type==="csv" && <CsvImportModal content={modal.content} partners={data.partners} savedAliases={data.csvAliases||{}} onClose={()=>setModal(null)} onConfirm={handleCsvConfirm}/>}{(modal==="active"||modal==="prospect") && <NewModal type={modal} onClose={()=>setModal(null)} onSave={addEntity}/>}
    </div>
  );

  // ── DESKTOP LAYOUT ─────────────────────────────────────────────────────
  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",
      fontFamily:"system-ui,sans-serif",background:"#F0F7FF"}}>

      {/* Topbar */}
      <div style={{background:"#1E3A8A",height:50,display:"flex",alignItems:"center",
        padding:"0 20px",gap:16,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,background:"white",borderRadius:5,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🗺</div>
          <span style={{color:"white",fontWeight:800,fontSize:14}}>
            PD Dashboard
          </span>
        </div>
        <div style={{width:1,height:20,background:"rgba(255,255,255,0.15)"}}/>
        {[{v:premCount,l:"Premium",c:"#93C5FD"},{v:spCount,l:"Specialist",c:"#BFDBFE"},
          {v:prCount,l:"Prospectos",c:"#FCD34D"},
          {v:"€"+Math.round(totalArr/1000)+"k",l:"ARR",c:"#6EE7B7"}].map(s=>(
          <div key={s.l} style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:15,fontWeight:800,color:s.c}}>{s.v}</span>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.45)",fontWeight:600}}>{s.l}</span>
          </div>
        ))}
        <div style={{flex:1}}/>
        {/* Sync indicator */}
        {syncState!=="idle" && (
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,
            color: syncState==="error"?"#FCA5A5" : syncState==="saved"?"#6EE7B7" : "rgba(255,255,255,0.5)"}}>
            {syncState==="saving" && <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>}
            {syncState==="saved"  && "✓ Guardado"}
            {syncState==="error"  && "✗ Error al guardar"}
          </div>
        )}
        <button onClick={()=>setView(v=>v==="dashboard"?"partners":"dashboard")} style={{
          background:view==="dashboard"?"white":"rgba(255,255,255,0.12)",
          color:view==="dashboard"?"#1E3A8A":"rgba(255,255,255,0.75)",
          border:view==="dashboard"?"none":"1px solid rgba(255,255,255,0.25)",
          borderRadius:5,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          📊 Dashboard
        </button>
        {view==="partners" && <button onClick={()=>setShowMap(m=>!m)} style={{
          background:showMap?"white":"rgba(255,255,255,0.12)",
          color:showMap?"#1E3A8A":"rgba(255,255,255,0.75)",
          border:showMap?"none":"1px solid rgba(255,255,255,0.25)",
          borderRadius:5,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          🗺 {showMap?"Ocultar mapa":"Ver mapa"}
        </button>}
        {/* Bell */}
        <button onClick={()=>setShowRemindersPanel(r=>!r)} style={{
          position:"relative",background: pendingReminders.length?"#FEF9C3":"rgba(255,255,255,0.12)",
          border: pendingReminders.length?"1px solid #FDE047":"1px solid rgba(255,255,255,0.25)",
          borderRadius:5,padding:"5px 10px",fontSize:14,cursor:"pointer",
          display:"flex",alignItems:"center",gap:4}}>
          🔔
          {pendingReminders.length>0 && (
            <span style={{background:"#EF4444",color:"white",borderRadius:"50%",
              fontSize:9,fontWeight:800,width:15,height:15,display:"flex",
              alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {pendingReminders.length}
            </span>
          )}
        </button>
        <button onClick={()=>setModal("active")} style={{background:"white",color:"#1E3A8A",
          border:"none",borderRadius:5,padding:"5px 12px",fontSize:11,fontWeight:800,cursor:"pointer"}}>
          + Distribuidor
        </button>
        <button onClick={()=>setModal("prospect")} style={{background:"rgba(255,255,255,0.12)",
          color:"white",border:"1px solid rgba(255,255,255,0.25)",borderRadius:5,
          padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
          + Prospecto
        </button>
        <label style={{background:"rgba(255,255,255,0.12)",color:"white",
          border:"1px solid rgba(255,255,255,0.25)",borderRadius:5,
          padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",
          display:"flex",alignItems:"center",gap:4}}>
          📥 Importar CSV
          <input type="file" accept=".csv" style={{display:"none"}}
            onChange={e=>{
              const file=e.target.files[0]; if(!file) return;
              const reader=new FileReader();
              reader.onload=ev=>setModal({type:"csv",content:ev.target.result});
              reader.readAsText(file,"UTF-8");
              e.target.value="";
            }}/>
        </label>
        <div style={{width:1,height:20,background:"rgba(255,255,255,0.15)"}}/>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,background:"rgba(255,255,255,0.15)",borderRadius:"50%",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:11,fontWeight:800,color:"white"}}>
            {(session.display_name||session.username||"?")[0].toUpperCase()}
          </div>
          <span style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.7)"}}>
            {session.display_name||session.username}
          </span>
          <button onClick={onLogout} style={{background:"rgba(255,255,255,0.08)",
            color:"rgba(255,255,255,0.5)",border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:5,padding:"3px 8px",fontSize:10,fontWeight:600,cursor:"pointer"}}>
            Salir
          </button>
        </div>
      </div>

      {/* Reminders panel */}
      {showRemindersPanel && (
        <div style={{position:"fixed",top:50,right:20,zIndex:200,
          background:"white",border:"1px solid #E2E8F0",borderRadius:12,
          boxShadow:"0 8px 32px rgba(0,0,0,0.14)",width:360,maxHeight:"70vh",
          display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif"}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid #E2E8F0",
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:800,color:"#1E293B",display:"flex",alignItems:"center",gap:6}}>
              🔔 Recordatorios pendientes
              {pendingReminders.length>0 && (
                <span style={{background:"#EF4444",color:"white",borderRadius:10,
                  fontSize:10,fontWeight:800,padding:"1px 7px"}}>{pendingReminders.length}</span>
              )}
            </div>
            <button onClick={()=>setShowRemindersPanel(false)} style={{background:"#F1F5F9",
              border:"none",borderRadius:"50%",width:26,height:26,cursor:"pointer",
              fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#64748B"}}>×</button>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {pendingReminders.length===0 ? (
              <div style={{padding:"32px 16px",textAlign:"center",color:"#94A3B8",fontSize:13}}>
                No hay recordatorios pendientes 🎉
              </div>
            ) : pendingReminders.map((r,i)=>{
              const isOverdue = r.date < new Date().toISOString().slice(0,10);
              return (
                <div key={i} style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",
                  background:isOverdue?"#FEF2F2":"white"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:800,color:isOverdue?"#DC2626":"#92400E",
                        display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                        <span>{isOverdue?"⚠️":"🔔"}</span>
                        <span>{r.date.split("-").reverse().join("/")}
                          {r.time && ` · ${r.time}`}
                          {" · "}<span style={{color:"#4F46E5"}}>{r.user}</span>
                        </span>
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:"#1E293B",marginBottom:2}}>
                        {r.entityName}
                      </div>
                      {r.note && (
                        <div style={{fontSize:11,fontWeight:600,color:"#92400E",fontStyle:"italic",marginBottom:2}}>
                          {r.note}
                        </div>
                      )}
                      <div style={{fontSize:11,color:"#64748B",lineHeight:1.4,
                        overflow:"hidden",textOverflow:"ellipsis",
                        display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
                        {r.updateText}
                      </div>
                    </div>
                    <button onClick={()=>{
                      const entity = [...data.partners,...data.prospects].find(e=>e.id===r.entityId);
                      if (!entity) return;
                      const updated = {...entity, updates:(entity.updates||[]).map(u=>
                        u.id===r.updateId ? {...u,reminder:{...u.reminder,done:true}} : u
                      )};
                      updateEntity(updated);
                    }} style={{background:"#059669",color:"white",border:"none",
                      borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:700,
                      cursor:"pointer",flexShrink:0}}>
                      Hecho
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view==="dashboard" && <DashboardView data={data}/>}

      {view==="partners" && <>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Sidebar + Detail panel column */}
        <div style={{
          width: showMap ? (selected ? 460 : 260) : "100%",
          display:"flex",flexDirection:"column",flexShrink:0,
          borderRight: showMap ? "1px solid #E2E8F0" : "none",
          transition:"width 0.25s ease",overflow:"hidden"}}>

          {/* List sidebar — hidden when detail panel open and map is visible */}
          {(!selected || !showMap) && (
          <div style={{display:"flex",flexDirection:"column",height:"100%",background:"white"}}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid #F1F5F9",flexShrink:0}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar…" style={{width:"100%",border:"1px solid #E2E8F0",
                borderRadius:6,padding:"6px 10px",fontSize:12,boxSizing:"border-box",
                fontFamily:"system-ui,sans-serif"}}/>
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <select value={filter} onChange={e=>setFilter(e.target.value)} style={{
                flex:1,border:"1px solid #E2E8F0",borderRadius:6,padding:"5px 6px",
                fontSize:11,fontFamily:"system-ui,sans-serif",color:"#374151",
                background:"white",cursor:"pointer",outline:"none"}}>
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="premium">Premium</option>
                <option value="specialist">Specialist</option>
                <option value="prospect">Prospectos</option>
              </select>
              <select value={sort} onChange={e=>setSort(e.target.value)} style={{
                flex:1,border:"1px solid #E2E8F0",borderRadius:6,padding:"5px 6px",
                fontSize:11,fontFamily:"system-ui,sans-serif",color:"#374151",
                background:"white",cursor:"pointer",outline:"none"}}>
                <option value="arr">Mayor ARR</option>
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
              </select>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {!showMap ? (
              <div style={{padding:14,display:"grid",
                gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
                {filtered.map(e=>(
                  <div key={e.id} onClick={()=>setSelected(e)} style={{
                    background:selected?.id===e.id?"#EEF2FF":"white",
                    border:`1px solid ${selected?.id===e.id?"#818CF8":"#E2E8F0"}`,
                    borderRadius:10,padding:14,cursor:"pointer",
                    boxShadow:selected?.id===e.id?"0 0 0 2px #818CF8":"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                      <span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:8,
                        background:levelBg(e),color:levelText(e)}}>
                        {e.type==="prospect"?(e.stage||"Prospecto"):e.level==="premium"?"Premium":"Specialist"}
                      </span>
                      <span style={{fontSize:10,color:"#94A3B8"}}>{e.city}</span>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:"#1E293B",marginBottom:3}}>{e.name}</div>
                    <div style={{fontSize:11,color:"#64748B",marginBottom:8}}>
                      {(e.contacts||[])[0]?.name||"—"}
                      {(e.contacts||[])[0]?.role?` · ${e.contacts[0].role}`:""}
                    </div>
                    {e.type==="active" && (
                      <div style={{display:"flex",gap:10,paddingTop:8,borderTop:"1px solid #F1F5F9"}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:13,fontWeight:800,color:"#059669"}}>€{Math.round(e.arr/1000)}k</div>
                          <div style={{fontSize:9,color:"#94A3B8",fontWeight:600}}>ARR</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:13,fontWeight:800,color:"#1E3A8A"}}>{e.accounts}</div>
                          <div style={{fontSize:9,color:"#94A3B8",fontWeight:600}}>Clientes</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:13,fontWeight:800,color:"#7C3AED"}}>€{Math.round((e.booking2026||0)/1000)}k</div>
                          <div style={{fontSize:9,color:"#94A3B8",fontWeight:600}}>Booking</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {!filtered.length && (
                  <div style={{gridColumn:"1/-1",padding:40,textAlign:"center",color:"#94A3B8",fontSize:13}}>
                    Sin resultados
                  </div>
                )}
              </div>
            ) : (
              <>
                {filtered.map(e=>(
                  <EntityRow key={e.id} e={e} selected={selected?.id===e.id}
                    onClick={()=>setSelected(e)} onHover={setHovered} isMobile={false}/>
                ))}
                {!filtered.length && (
                  <div style={{padding:20,textAlign:"center",color:"#94A3B8",fontSize:11}}>Sin resultados</div>
                )}
              </>
            )}
          </div>
          </div>
          )}

          {/* Detail panel — inline in sidebar column when map is visible */}
          {selected && showMap && (
            <DetailPanel entity={selected} onClose={()=>{setSelected(null);setHovered(null);}}
              onUpdate={updateEntity} onAddUpdate={addUpdate}
              onPromote={promoteProspect} onDelete={deleteEntity} isMobile={false}/>
          )}
        </div>

        {/* Map */}
        {showMap && (
          <div style={{flex:1,overflow:"hidden"}}>
            <div style={{width:"100%",height:"100%",padding:12,boxSizing:"border-box"}}>
              <IberianMap partners={data.partners} prospects={data.prospects}
                selected={selected} onSelect={setSelected} hovered={hovered}/>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel — floating only when map is hidden */}
      {selected && !showMap && (
        <DetailPanel entity={selected} onClose={()=>{setSelected(null);setHovered(null);}}
          onUpdate={updateEntity} onAddUpdate={addUpdate}
          onPromote={promoteProspect} onDelete={deleteEntity} isMobile={false}/>
      )}
      {modal?.type==="csv" && <CsvImportModal content={modal.content} partners={data.partners} savedAliases={data.csvAliases||{}} onClose={()=>setModal(null)} onConfirm={handleCsvConfirm}/>}{(modal==="active"||modal==="prospect") && <NewModal type={modal} onClose={()=>setModal(null)} onSave={addEntity}/>}
      </>}
    </div>
  );
}

// ── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView({ data }) {
  const totalArr = data.partners.reduce((s,p)=>s+(p.arr||0),0);
  const totalAccounts = data.partners.reduce((s,p)=>s+(p.accounts||0),0);
  const totalBooking = data.partners.reduce((s,p)=>s+(p.booking2026||0),0);
  const premCount = data.partners.filter(p=>p.level==="premium").length;
  const spCount = data.partners.filter(p=>p.level==="specialist").length;
  const prCount = data.prospects.length;
  const pendingReminders = [...data.partners,...data.prospects].flatMap(e=>
    (e.updates||[]).filter(u=>u.reminder&&!u.reminder.done)
  ).length;

  const kpis = [
    { label:"ARR Total", value:`€${(totalArr/1000).toFixed(0)}k`, sub:"Ingreso neto Revo", color:"#1E3A8A" },
    { label:"Cuentas activas", value:totalAccounts, sub:"Clientes en canal", color:"#0891B2" },
    { label:"Booking 2026", value:`€${(totalBooking/1000).toFixed(0)}k`, sub:"Contratado este año", color:"#059669" },
    { label:"Partners", value:data.partners.length, sub:`${premCount} Premium · ${spCount} Specialist`, color:"#7C3AED" },
    { label:"Prospectos", value:prCount, sub:"En pipeline", color:"#D97706" },
    { label:"Recordatorios", value:pendingReminders, sub:"Pendientes", color:"#DC2626" },
  ];

  return (
    <div style={{flex:1,overflowY:"auto",padding:24,background:"#F0F7FF",fontFamily:"system-ui,sans-serif"}}>
      <div style={{maxWidth:1100,margin:"0 auto"}}>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:20,fontWeight:800,color:"#1E293B"}}>Dashboard</div>
          <div style={{fontSize:13,color:"#64748B",marginTop:2}}>Visión general del canal de distribución</div>
        </div>

        {/* KPI cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14,marginBottom:28}}>
          {kpis.map(k=>(
            <div key={k.label} style={{background:"white",borderRadius:12,padding:"18px 20px",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1px solid #E2E8F0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",
                letterSpacing:"0.06em",marginBottom:8}}>{k.label}</div>
              <div style={{fontSize:28,fontWeight:800,color:k.color,marginBottom:4}}>{k.value}</div>
              <div style={{fontSize:11,color:"#94A3B8"}}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Placeholder gráficos */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          {[
            {title:"ARR por partner", desc:"Ranking de distribuidores por ingreso neto"},
            {title:"Evolución NB 2025-2026", desc:"Nuevas altas por trimestre"},
          ].map(g=>(
            <div key={g.title} style={{background:"white",borderRadius:12,padding:"20px",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1px solid #E2E8F0",minHeight:220,
              display:"flex",flexDirection:"column"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1E293B",marginBottom:4}}>{g.title}</div>
              <div style={{fontSize:11,color:"#94A3B8",marginBottom:16}}>{g.desc}</div>
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                background:"#F8FAFC",borderRadius:8,border:"1px dashed #CBD5E1"}}>
                <div style={{textAlign:"center",color:"#CBD5E1"}}>
                  <div style={{fontSize:28,marginBottom:6}}>📊</div>
                  <div style={{fontSize:11,fontWeight:600}}>Próximamente</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
          {[
            {title:"Distribución por nivel", desc:"Premium vs Specialist"},
            {title:"Cobertura territorial", desc:"Provincias con presencia"},
            {title:"Pipeline de prospectos", desc:"Estado del proceso de captación"},
          ].map(g=>(
            <div key={g.title} style={{background:"white",borderRadius:12,padding:"20px",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1px solid #E2E8F0",minHeight:180,
              display:"flex",flexDirection:"column"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1E293B",marginBottom:4}}>{g.title}</div>
              <div style={{fontSize:11,color:"#94A3B8",marginBottom:16}}>{g.desc}</div>
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                background:"#F8FAFC",borderRadius:8,border:"1px dashed #CBD5E1"}}>
                <div style={{textAlign:"center",color:"#CBD5E1"}}>
                  <div style={{fontSize:24,marginBottom:6}}>📊</div>
                  <div style={{fontSize:11,fontWeight:600}}>Próximamente</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
