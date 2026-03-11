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
const ALL_PROVS = [...Object.keys(CENTROIDS), ...CANARIAS];

const PC = { premium:"#1E3A8A", specialist:"#0891B2", prospect:"#78716C", none:"#E2E8F0" };

function levelColor(e) {
  if (!e) return PC.none;
  if (e.type === "prospect") return PC.prospect;
  return e.level === "premium" ? PC.premium : PC.specialist;
}
function levelBg(e) {
  if (!e || e.type==="prospect") return "#FEF3C7";
  return e.level==="premium" ? "#EEF2FF" : "#ECFEFF";
}
function levelText(e) {
  if (!e || e.type==="prospect") return "#B45309";
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
  "Álava":"Álava","Alava":"Álava","Araba":"Álava",
  "Albacete":"Albacete","Alicante":"Alicante","Almería":"Almería","Almeria":"Almería",
  "Asturias":"Asturias","Ávila":"Ávila","Avila":"Ávila","Badajoz":"Badajoz",
  "Illes Balears":"Illes Balears","Baleares":"Illes Balears","Islas Baleares":"Illes Balears",
  "Barcelona":"Barcelona","Burgos":"Burgos","Cáceres":"Cáceres","Caceres":"Cáceres",
  "Cádiz":"Cádiz","Cadiz":"Cádiz","Cantabria":"Cantabria","Castellón":"Castellón",
  "Castellon":"Castellón","Ciudad Real":"Ciudad Real","Córdoba":"Córdoba","Cordoba":"Córdoba",
  "Cuenca":"Cuenca","Girona":"Girona","Gerona":"Girona","Granada":"Granada",
  "Guadalajara":"Guadalajara","Guipúzcoa":"Guipúzcoa","Gipuzkoa":"Guipúzcoa","Guipuzcoa":"Guipúzcoa",
  "Huelva":"Huelva","Huesca":"Huesca","Jaén":"Jaén","Jaen":"Jaén","León":"León","Leon":"León",
  "Lleida":"Lleida","Lérida":"Lleida","Lerida":"Lleida","Lugo":"Lugo","Madrid":"Madrid",
  "Málaga":"Málaga","Malaga":"Málaga","Murcia":"Murcia","Navarra":"Navarra","Ourense":"Ourense",
  "Orense":"Ourense","Palencia":"Palencia","Las Palmas":"Las Palmas","Pontevedra":"Pontevedra",
  "La Rioja":"La Rioja","Salamanca":"Salamanca","Santa Cruz de Tenerife":"Santa Cruz de Tenerife",
  "Segovia":"Segovia","Sevilla":"Sevilla","Soria":"Soria","Tarragona":"Tarragona",
  "Teruel":"Teruel","Toledo":"Toledo","Valencia":"Valencia","Valladolid":"Valladolid",
  "Vizcaya":"Vizcaya","Bizkaia":"Vizcaya","Zamora":"Zamora","Zaragoza":"Zaragoza",
  // Portugal districts
  "Aveiro":"Aveiro","Beja":"Beja","Braga":"Braga","Bragança":"Bragança","Braganca":"Bragança",
  "Castelo Branco":"Castelo Branco","Coimbra":"Coimbra","Évora":"Évora","Evora":"Évora",
  "Faro":"Faro","Guarda":"Guarda","Leiria":"Leiria","Lisboa":"Lisboa","Portalegre":"Portalegre",
  "Porto":"Porto","Santarém":"Santarém","Santarem":"Santarém","Setúbal":"Setúbal","Setubal":"Setúbal",
  "Viana do Castelo":"Viana do Castelo","Vila Real":"Vila Real","Viseu":"Viseu",
};
function normName(raw) {
  if (!raw) return raw;
  return NAME_MAP[raw] || NAME_MAP[raw.trim()] || raw;
}

// Province centroid fallbacks (for label placement when GeoJSON centroid is off)
const LABEL_OVERRIDE = {
  "Illes Balears": [2.92, 39.57],
};

function IberianMap({ partners, prospects, selected, onSelect }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [geoSpain, setGeoSpain] = useState(null);
  const [geoPortugal, setGeoPortugal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [dims, setDims] = useState({w:580, h:480});

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
        const [spRes, ptRes] = await Promise.all([
          fetch("https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/spain-provinces.geojson"),
          fetch("https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/portugal-districts.geojson"),
        ]);

        if (!spRes.ok) throw new Error(`Spain GeoJSON failed: ${spRes.status}`);
        if (!ptRes.ok) throw new Error(`Portugal GeoJSON failed: ${ptRes.status}`);

        const [spGeo, ptGeo] = await Promise.all([spRes.json(), ptRes.json()]);
        if (cancelled) return;

        setGeoSpain(spGeo.features || []);
        setGeoPortugal(ptGeo.features || []);
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
    const ps = provMap[norm] || [];
    if (!ps.length) { setTooltip(null); return; }
    if (tooltip?.norm === norm) { setTooltip(null); return; }
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

  const renderFeature = (f, i) => {
    if (!pathGen) return null;
    const raw = f.properties?.name || f.properties?.NAME_2 || f.properties?.NAME || f.properties?.Distrito || "";
    const norm = normName(raw);
    const ps = provMap[norm] || [];
    const isSelected = selected && ps.some(p => p.id === selected.id);
    const d = pathGen(f);
    if (!d) return null;
    const [cx,cy] = LABEL_OVERRIDE[norm] ? projection(LABEL_OVERRIDE[norm]) : pathGen.centroid(f);
    const fill = getProvColor(norm);
    return (
      <g key={`${i}-${norm}`}
        onClick={(e) => handleClick(norm, e)}
        style={{cursor: ps.length ? "pointer" : "default"}}>
        <path d={d}
          fill={fill}
          opacity={selected && !isSelected ? 0.5 : 1}
          stroke={isSelected ? "#FCD34D" : "#fff"}
          strokeWidth={isSelected ? 2 : 0.6}
          style={{filter: tooltip?.norm===norm ? "brightness(0.88)" : "none", transition:"opacity 0.18s"}}
        />
        {cx && cy && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
            fontSize={norm.length>9?"6":"7"}
            fill={ps.length ? "rgba(255,255,255,0.9)" : "#A8B4C0"}
            fontFamily="system-ui,sans-serif" fontWeight="600"
            style={{pointerEvents:"none",userSelect:"none"}}>
            {norm.length>11 ? norm.substring(0,10)+"." : norm}
          </text>
        )}
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
          if (norm==="Las Palmas"||norm==="Santa Cruz de Tenerife") return null;
          return renderFeature(f,i);
        })}
        {geoPortugal && pathGen && geoPortugal.map((f,i)=>renderFeature(f,`pt-${i}`))}
      </svg>

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
        selected={selected} onSelect={onSelect} provMap={provMap}
        geoSpain={geoSpain} pathGen={pathGen} normName={normName}
        densityColors={DENSITY}/>

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

// ── Canarias inset ─────────────────────────────────────────────────────────
function CanariasInset({ provMap, geoSpain, pathGen, normName, onSelect, selected, densityColors }) {
  const [hovered, setHovered] = useState(null);
  const [sharedPopup, setSharedPopup] = useState(null);
  const W=140, H=70;
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
            {canFeatures.map((f,i)=>{
              const norm = normName(f.properties?.name||f.properties?.NAME_2||f.properties?.NAME||"");
              const ps = provMap[norm] || [];
              const isSelected = selected && ps.some(p=>p.id===selected.id);
              const d = insetPath(f);
              const [cx,cy] = insetPath.centroid(f);
              const fill = getColor(norm);
              return (
                <g key={i} style={{cursor:ps.length?"pointer":"default"}}
                  onClick={()=>{
                    if (ps.length===1) onSelect(ps[0]);
                    else if (ps.length>1) setSharedPopup({norm, partners:ps});
                  }}>
                  <path d={d} fill={fill}
                    stroke={isSelected?"#FCD34D":"#fff"} strokeWidth={isSelected?2:0.6}/>
                  {cx && cy && (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                      fontSize="6" fill={ps.length?"white":"#94A3B8"}
                      fontFamily="system-ui,sans-serif" fontWeight="600"
                      style={{pointerEvents:"none"}}>
                      {norm==="Las Palmas"?"Las Palmas":"Sta. Cruz"}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {/* Shared popup for Canarias */}
          {sharedPopup && (
            <div style={{position:"absolute",bottom:"100%",right:0,marginBottom:4,
              background:"white",border:"1px solid #E2E8F0",borderRadius:8,
              boxShadow:"0 4px 20px rgba(0,0,0,0.15)",padding:"8px 10px",
              minWidth:160,zIndex:60}}>
              <div style={{fontSize:10,fontWeight:800,color:"#7C3AED",marginBottom:6}}>
                {sharedPopup.norm}
              </div>
              {sharedPopup.partners.map(p=>(
                <div key={p.id} onClick={()=>{onSelect(p);setSharedPopup(null);}}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",
                    borderRadius:5,cursor:"pointer",marginBottom:2,background:"#F8FAFC"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#EEF2FF"}
                  onMouseLeave={e=>e.currentTarget.style.background="#F8FAFC"}>
                  <div style={{width:16,height:16,borderRadius:3,background:levelColor(p),
                    flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:8,fontWeight:800,color:"white"}}>
                    {p.name.charAt(0)}
                  </div>
                  <span style={{fontSize:10,fontWeight:600,color:"#1E293B"}}>
                    {p.name.split(" ").slice(0,2).join(" ")}
                  </span>
                </div>
              ))}
              <button onClick={()=>setSharedPopup(null)}
                style={{position:"absolute",top:4,right:6,background:"none",border:"none",
                  cursor:"pointer",color:"#94A3B8",fontSize:12}}>×</button>
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
                  {["Primer contacto","Negociación","Propuesta enviada","Contrato pendiente"].map(s=>
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
            onSave({...form,id:"p"+Date.now(),type:type==="active"?"active":"prospect",
              provinces:[],contacts:[],updates:[],arr:0,accounts:0,booking2026:0,
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

// ── Detail Panel — shared desktop/mobile ───────────────────────────────────
function DetailPanel({ entity, onClose, onUpdate, onAddUpdate, onPromote, onDelete, isMobile }) {
  const isActive = entity.type==="active";
  const hdr = isActive&&entity.level==="premium" ? "#1E3A8A" : isActive ? "#0891B2" : "#78716C";
  const [tab, setTab] = useState(isActive?"overview":"contacts");
  const [note, setNote] = useState("");
  const [author, setAuthor] = useState("");
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
  });
  const [kpiForm, setKpiForm] = useState({
    arr: entity.arr||0, accounts: entity.accounts||0, booking2026: entity.booking2026||0,
  });
  const [infoSaved, setInfoSaved] = useState(false);
  const [kpiSaved, setKpiSaved] = useState(false);

  // Reset forms if entity changes (e.g. after promote)
  useEffect(()=>{
    setInfoForm({name:entity.name||"",city:entity.city||"",address:entity.address||"",website:entity.website||"",cif:entity.cif||""});
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

  const tabs = isActive
    ? [{id:"overview",l:"Resumen"},{id:"contacts",l:"Contactos"},{id:"info",l:"Info"},{id:"updates",l:"Updates"}]
    : [{id:"contacts",l:"Contactos"},{id:"info",l:"Info"},{id:"updates",l:"Updates"}];

  const addNote = () => {
    if (!note.trim() || !author) return;
    onAddUpdate(entity.id,{id:"u"+Date.now(),date:new Date().toISOString().split("T")[0],author,text:note.trim()});
    setNote("");
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

  // Mobile: full-screen slide-up. Desktop: fixed right panel.
  const panelStyle = isMobile ? {
    position:"fixed",inset:0,background:"white",zIndex:200,
    display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif",
    overflowY:"auto"
  } : {
    position:"fixed",top:0,right:0,bottom:0,width:460,background:"white",
    boxShadow:"-8px 0 40px rgba(0,0,0,0.12)",zIndex:100,
    display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif"
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{background:hdr,padding:isMobile?"16px 16px 0":"18px 20px 0",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{flex:1}}>
            {/* Editable status badge */}
            {editingStatus ? (
              <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
                {(isActive
                  ? [{v:"premium",l:"Premium"},{v:"specialist",l:"Specialist"}]
                  : ["Primer contacto","Negociación","Propuesta enviada","Contrato pendiente"].map(s=>({v:s,l:s}))
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
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",
            color:"white",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
            marginLeft:8}}>
            {isMobile?"←":"×"}
          </button>
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

        {/* OVERVIEW */}
        {tab==="overview" && isActive && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
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

        {/* INFO */}
        {tab==="info" && (
          <div>
            {/* General info */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",
                letterSpacing:"0.06em",marginBottom:12}}>Datos generales</div>

              {/* Logo upload */}
              <div style={{marginBottom:12}}>
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
                          const file = e.target.files[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = ev => onUpdate({...entity, logo: ev.target.result});
                          reader.readAsDataURL(file);
                        }}/>
                    </label>
                    {entity.logo && (
                      <button onClick={()=>onUpdate({...entity,logo:null})}
                        style={{background:"none",border:"none",color:"#94A3B8",fontSize:11,
                          cursor:"pointer",marginTop:4,padding:0}}>
                        Eliminar logo
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
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
                        fontSize:14,boxSizing:"border-box",fontFamily:"system-ui,sans-serif",color:"#1E293B"}}/>
                  </div>
                ))}
              </div>
              <button onClick={saveInfo} style={{width:"100%",marginTop:12,
                background: infoSaved?"#059669":hdr,color:"white",border:"none",
                borderRadius:8,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",
                transition:"background 0.3s"}}>
                {infoSaved ? "✓ Guardado" : "Guardar información"}
              </button>
            </div>

            {/* KPIs — manual override */}
            {isActive && (
              <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:10,padding:"14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                    KPIs
                  </div>
                  <span style={{fontSize:10,color:"#94A3B8",fontStyle:"italic"}}>Edición manual</span>
                </div>
                {/* Data source notice */}
                <div style={{display:"flex",alignItems:"flex-start",gap:6,background:"#FFFBEB",
                  border:"1px solid #FDE68A",borderRadius:7,padding:"8px 10px",marginBottom:12}}>
                  <span style={{fontSize:13,flexShrink:0}}>⚡</span>
                  <span style={{fontSize:11,color:"#92400E",lineHeight:1.4}}>
                    Estos datos idealmente se sincronizarán automáticamente desde la fuente de datos de Cegid.
                    Hasta entonces, puedes editarlos manualmente.
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {[
                    {key:"arr",        label:"ARR 2025 (€)",      ph:"0"},
                    {key:"accounts",   label:"Nº clientes activos",ph:"0"},
                    {key:"booking2026",label:"Booking 2026 (€)",   ph:"0"},
                  ].map(f=>(
                    <div key={f.key}>
                      <label style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",
                        letterSpacing:"0.05em",display:"block",marginBottom:4}}>{f.label}</label>
                      <input type="number" value={kpiForm[f.key]}
                        onChange={e=>setKpiForm(fm=>({...fm,[f.key]:e.target.value}))}
                        placeholder={f.ph}
                        style={{width:"100%",border:"1px solid #E2E8F0",borderRadius:8,padding:"10px 12px",
                          fontSize:14,boxSizing:"border-box",fontFamily:"system-ui,sans-serif",color:"#1E293B"}}/>
                    </div>
                  ))}
                </div>
                <button onClick={saveKpis} style={{width:"100%",marginTop:12,
                  background: kpiSaved?"#059669":"#475569",color:"white",border:"none",
                  borderRadius:8,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",
                  transition:"background 0.3s"}}>
                  {kpiSaved ? "✓ Guardado" : "Guardar KPIs"}
                </button>
              </div>
            )}

            {/* Danger zone */}
            <div style={{marginTop:24,borderTop:"1px solid #FEE2E2",paddingTop:16}}>
              <div style={{fontSize:11,fontWeight:800,color:"#DC2626",textTransform:"uppercase",
                letterSpacing:"0.06em",marginBottom:10}}>Zona de peligro</div>
              {!onDelete ? null : (
                <DeleteButton entity={entity} onDelete={()=>{ onDelete(entity.id); onClose(); }}/>
              )}
            </div>
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
              <div style={{display:"flex",gap:6,margin:"8px 0"}}>
                <span style={{fontSize:11,color:"#94A3B8",fontWeight:600,
                  alignSelf:"center",marginRight:2}}>¿Quién?</span>
                {["Toni","Gerard","Isabel"].map(name=>(
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
              <button onClick={addNote}
                disabled={!note.trim() || !author}
                style={{width:"100%",marginTop:4,
                  background: note.trim()&&author ? hdr : "#E2E8F0",
                  color: note.trim()&&author ? "white" : "#94A3B8",
                  border:"none",borderRadius:8,padding:"12px",
                  fontSize:14,fontWeight:700,cursor:note.trim()&&author?"pointer":"default",
                  transition:"background 0.15s"}}>
                + Añadir update
              </button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[...(entity.updates||[])].reverse().map(u=>(
                <div key={u.id} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",
                  borderRadius:10,padding:"14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:11,fontWeight:700,color:"#4F46E5",background:"#EEF2FF",
                      padding:"2px 8px",borderRadius:8}}>{u.author}</span>
                    <span style={{fontSize:11,color:"#94A3B8"}}>{u.date}</span>
                  </div>
                  <p style={{margin:0,fontSize:13,color:"#374151",lineHeight:1.6}}>{u.text}</p>
                </div>
              ))}
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
function EntityRow({ e, selected, onClick, isMobile }) {
  return (
    <div onClick={onClick} style={{
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
export default function App() {
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showMap, setShowMap] = useState(true);
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

  if(!data) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100vh",fontFamily:"system-ui,sans-serif",color:"#64748B"}}>Cargando…</div>
  );

  const all=[...data.partners,...data.prospects];
  const filtered=all.filter(e=>{
    const ms=!search||e.name.toLowerCase().includes(search.toLowerCase())||(e.city||"").toLowerCase().includes(search.toLowerCase());
    const mf=filter==="all"||e.type===filter
      ||(filter==="premium"&&e.level==="premium")
      ||(filter==="specialist"&&e.level==="specialist");
    return ms&&mf;
  });

  const premCount=data.partners.filter(p=>p.level==="premium").length;
  const spCount=data.partners.filter(p=>p.level==="specialist").length;
  const prCount=data.prospects.length;
  const totalArr=data.partners.reduce((s,p)=>s+(p.arr||0),0);

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
        <div style={{display:"flex",gap:6,marginTop:10,overflowX:"auto",paddingBottom:2}}>
          {[{id:"all",l:"Todos"},{id:"active",l:"Activos"},{id:"premium",l:"Premium"},
            {id:"specialist",l:"Specialist"},{id:"prospect",l:"Prospectos"}].map(f=>(
            <button key={f.id} onClick={()=>setFilter(f.id)} style={{
              background:filter===f.id?"#1E3A8A":"#F1F5F9",
              color:filter===f.id?"white":"#64748B",
              border:"none",borderRadius:20,padding:"5px 14px",
              fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
              {f.l}
            </button>
          ))}
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
        <DetailPanel entity={selected} onClose={()=>setSelected(null)}
          onUpdate={updateEntity} onAddUpdate={addUpdate}
          onPromote={promoteProspect} onDelete={deleteEntity} isMobile={true}/>
      )}
      {modal && <NewModal type={modal} onClose={()=>setModal(null)} onSave={addEntity}/>}
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
        <button onClick={()=>setShowMap(m=>!m)} style={{
          background:showMap?"white":"rgba(255,255,255,0.12)",
          color:showMap?"#1E3A8A":"rgba(255,255,255,0.75)",
          border:showMap?"none":"1px solid rgba(255,255,255,0.25)",
          borderRadius:5,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          🗺 {showMap?"Ocultar mapa":"Ver mapa"}
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
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:showMap?260:"100%",maxWidth:showMap?260:700,
          background:"white",borderRight:"1px solid #E2E8F0",
          display:"flex",flexDirection:"column",flexShrink:0,transition:"max-width 0.25s ease"}}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid #F1F5F9"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar…" style={{width:"100%",border:"1px solid #E2E8F0",
                borderRadius:6,padding:"6px 10px",fontSize:12,boxSizing:"border-box",
                fontFamily:"system-ui,sans-serif"}}/>
            <div style={{display:"flex",gap:3,marginTop:8,flexWrap:"wrap"}}>
              {[{id:"all",l:"Todos"},{id:"active",l:"Activos"},{id:"premium",l:"Premium"},
                {id:"specialist",l:"Specialist"},{id:"prospect",l:"Prospectos"}].map(f=>(
                <button key={f.id} onClick={()=>setFilter(f.id)} style={{
                  background:filter===f.id?"#1E3A8A":"#F1F5F9",
                  color:filter===f.id?"white":"#64748B",
                  border:"none",borderRadius:10,padding:"2px 8px",
                  fontSize:9,fontWeight:700,cursor:"pointer"}}>
                  {f.l}
                </button>
              ))}
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
                    onClick={()=>setSelected(e)} isMobile={false}/>
                ))}
                {!filtered.length && (
                  <div style={{padding:20,textAlign:"center",color:"#94A3B8",fontSize:11}}>Sin resultados</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Map */}
        {showMap && (
          <div style={{flex:1,overflow:"hidden"}}>
            <div style={{width:"100%",height:"100%",padding:12,boxSizing:"border-box"}}>
              <IberianMap partners={data.partners} prospects={data.prospects}
                selected={selected} onSelect={setSelected}/>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel entity={selected} onClose={()=>setSelected(null)}
          onUpdate={updateEntity} onAddUpdate={addUpdate}
          onPromote={promoteProspect} onDelete={deleteEntity} isMobile={false}/>
      )}
      {modal && <NewModal type={modal} onClose={()=>setModal(null)} onSave={addEntity}/>}
    </div>
  );
}
