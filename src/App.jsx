import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, setDoc, doc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, where, getDocs, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

// ══════════════════════════════════════════════════════
// 🔑 GEMINI API KEY – replace with your own
// ══════════════════════════════════════════════════════
const GEMINI_KEY = 'YOUR_GEMINI_API_KEY';

// ────────────── AI Call ──────────────────────────────
const FARM_CTX = `Expert strawberry farm advisor. Farm: Kodaikanal TN, Melissa variety, 10000 plants, 0.5 acre, open field, drip irrigation, 19-20°C, sandy loam, Day 90+.
Stock: MinSol 13:00:45, Boron Minsol 20%, FertiGlobal NIXI, ONDA, COLORE 5kg, Simodis(PHI7d), Arigato, Azoxystrobin+Difenoconazole(PHI3d), Ridomil Gold(PHI7d).
Reply in English. Give exact product, dose per 100L, timing, PHI. Be practical and concise.`;

const callGemini = async (prompt, imgBase64 = null) => {
  const parts = [{ text: FARM_CTX + '\n\nQuestion: ' + prompt }];
  if (imgBase64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: imgBase64 } });
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 1200 },
        }),
      }
    );
    const d = await r.json();
    if (d.error) return '❌ Gemini Error: ' + d.error.message;
    return d.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
  } catch (e) {
    return '❌ Network Error: ' + e.message;
  }
};

// ────────────── Helper Components ─────────────────────
const Icon = ({ name, size = 16 }) => {
  const icons = {
    dashboard: '📊', workers: '👷', attendance: '📅', fertiliser: '🧪', crop: '🌱',
    schedule: '📋', reports: '🚨', customers: '🛒', logout: '🚪', menu: '☰',
    add: '➕', edit: '✏️', delete: '🗑️', save: '💾', cancel: '✖',
    male: '👨', female: '👩', check: '✅', cross: '❌', warn: '⚠️',
    ai: '🤖', photo: '📸', whatsapp: '📲', bell: '🔔', search: '🔍',
    berry: '🍓', plant: '🌿', money: '💰', box: '📦', star: '⭐',
    up: '↑', down: '↓', weather: '🌤️', rain: '🌧️', sun: '☀️',
  };
  return <span style={{ fontSize: size }}>{icons[name] || '•'}</span>;
};

const Ring = ({ pct, color, size = 80, label, sub }) => {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="ring-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0ede8" strokeWidth="7" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={c} strokeDashoffset={c - (c * pct / 100)} strokeLinecap="round" />
        </svg>
        <div className="ring-label">
          <div className="ring-num" style={{ color, fontSize: size < 80 ? 14 : 18 }}>{pct}%</div>
          {sub && <div className="ring-sub">{sub}</div>}
        </div>
      </div>
      {label && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>{label}</div>}
    </div>
  );
};

const Modal = ({ open, onClose, title, size = 'modal-md', children, footer }) => {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${size}`} onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

const Confirm = ({ open, msg, onYes, onNo }) => (
  <Modal open={open} onClose={onNo} title="Confirm Action" size="modal-sm"
    footer={<><button className="btn btn-berry" onClick={onYes}>Yes, Delete</button><button className="btn btn-ghost" onClick={onNo}>Cancel</button></>}>
    <p style={{ fontSize: 14, color: 'var(--ink)' }}>{msg}</p>
  </Modal>
);

// ────────────── Seed data (only if Firestore is empty) ─
const SEED_WORKERS = [
  { id: 1, name: "Murugan", gender: "male", phone: "9876543210", salary: 500, role: "Field Worker", joined: "2026-01-10", active: true },
  { id: 2, name: "Selvi", gender: "female", phone: "9876543211", salary: 450, role: "Harvester", joined: "2026-01-12", active: true },
  { id: 3, name: "Rajan", gender: "male", phone: "9876543212", salary: 500, role: "Irrigation", joined: "2026-02-01", active: true },
  { id: 4, name: "Meena", gender: "female", phone: "9876543213", salary: 450, role: "Harvester", joined: "2026-02-05", active: true },
  { id: 5, name: "Pandi", gender: "male", phone: "9876543214", salary: 550, role: "Supervisor", joined: "2026-01-05", active: true },
];
const SEED_SCHEDULE = [
  { id: 1, date: "2026-06-10", drip: "12:61:00 MAP (1.5-2 kg)", spray: "None", field: "Harvest", note: "Phosphorus deficiency recovery", type: "harvest", done: false },
  { id: 2, date: "2026-06-11", drip: "Controlled Irrigation", spray: "Boron 20% (100g/100L)", field: "Monitor", note: "Increase sugar levels", type: "monitor", done: false },
  { id: 3, date: "2026-06-12", drip: "SOP 0:00:50 (1.5-2 kg)", spray: "None", field: "Harvest", note: "Increase Brix & weight", type: "harvest", done: false },
  { id: 4, date: "2026-06-13", drip: "Controlled Irrigation", spray: "ONDA (200ml) + COLORE (250g)", field: "QR Update & Pruning", note: "Deep red color & aroma", type: "spray", done: false },
  { id: 5, date: "2026-06-14", drip: "Ascophyllum nodosum", spray: "None", field: "Rest / Monitor", note: "Root activity boost", type: "rest", done: false },
  { id: 6, date: "2026-06-15", drip: "Controlled Irrigation", spray: "Spintor/Tracer (35ml/100L)", field: "Harvest", note: "Pest control", type: "harvest", done: false },
  { id: 7, date: "2026-06-16", drip: "SOP 0:00:50 (1.5-2 kg)", spray: "NIXI Calcium (150ml/100L)", field: "Monitor", note: "Fruit skin firmness", type: "monitor", done: false },
  { id: 8, date: "2026-06-17", drip: "12:61:00 MAP (1.5-2 kg)", spray: "None", field: "Harvest", note: "2nd dose recovery", type: "harvest", done: false },
];
const SEED_CUSTOMERS = [
  { id: 1, name: "Priya Stores", phone: "9876501111", location: "Kodaikanal", type: "premium", since: "2026-03-01", orders: [{ date: "2026-05-10", boxes: 50 }, { date: "2026-05-20", boxes: 80 }, { date: "2026-06-01", boxes: 100 }] },
  { id: 2, name: "Kumar Fruits", phone: "9876502222", location: "Madurai", type: "regular", since: "2026-04-10", orders: [{ date: "2026-05-15", boxes: 20 }, { date: "2026-06-01", boxes: 25 }] },
  { id: 3, name: "Anbu Supermarket", phone: "9876503333", location: "Coimbatore", type: "premium", since: "2026-02-15", orders: [{ date: "2026-04-20", boxes: 120 }, { date: "2026-05-25", boxes: 150 }, { date: "2026-06-05", boxes: 200 }] },
  { id: 4, name: "Devi Hotel", phone: "9876504444", location: "Dindigul", type: "regular", since: "2026-05-01", orders: [{ date: "2026-06-02", boxes: 15 }] },
];
const SEED_PLANTS = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  healthy: Math.random() > 0.25,
  flowers: Math.floor(Math.random() * 8),
  greenFruits: Math.floor(Math.random() * 6),
  redFruits: Math.floor(Math.random() * 4),
  defect: Math.random() < 0.15 ? ["slug damage", "leaf curl", "grey mould", "aphids"][Math.floor(Math.random() * 4)] : "",
  yieldGrams: Math.floor(Math.random() * 300 + 50),
}));

const seedIfEmpty = async () => {
  const workersSnap = await getDocs(collection(db, 'workers'));
  if (workersSnap.empty) {
    const batch = writeBatch(db);
    SEED_WORKERS.forEach(w => batch.set(doc(db, 'workers', w.id.toString()), w));
    SEED_SCHEDULE.forEach(s => batch.set(doc(db, 'schedule', s.id.toString()), s));
    SEED_CUSTOMERS.forEach(c => batch.set(doc(db, 'customers', c.id.toString()), c));
    batch.set(doc(db, 'plants', 'master'), { items: SEED_PLANTS });
    await batch.commit();
  }
};

// ═══════════════════════════════════════════════════════
// 1. DASHBOARD PAGE
// ═══════════════════════════════════════════════════════
const DashboardPage = ({ workers, attendance, schedule, plants, customers, defectReports, today, dayNum }) => {
  const activeWorkers = workers.filter(w => w.active).length;
  const todayAtt = Object.entries(attendance).filter(([k, v]) => k.startsWith(today + '_') && v === 'present').length;
  const totalBoxes = customers.reduce((a, c) => a + c.orders.reduce((b, o) => b + o.boxes, 0), 0);
  const issueCount = plants.filter(p => p.defect).length;
  const harvestReady = plants.reduce((a, p) => a + p.redFruits, 0);
  const newDefects = defectReports.filter(d => !d.seen).length;

  const yieldData = [
    { week: 'W1', kg: 820 }, { week: 'W2', kg: 1100 }, { week: 'W3', kg: 980 }, { week: 'W4', kg: 1350 },
    { week: 'W5', kg: 1200 }, { week: 'W6', kg: 1480 }, { week: 'W7', kg: 1600 }, { week: 'W8', kg: 1420 },
  ];
  const healthData = [
    { name: 'Healthy', value: plants.filter(p => !p.defect).length, fill: '#7fb069' },
    { name: 'Issues', value: plants.filter(p => p.defect).length, fill: '#d63031' },
    { name: 'Flowering', value: plants.filter(p => p.flowers > 3).length, fill: '#f0a500' },
  ];

  return (
    <div>
      {newDefects > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          🚨 <strong>{newDefects} new field report(s)</strong> arrived! Please check the Worker Reports page.
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card stat-card-1"><div className="stat-icon"><Icon name="workers" size={28} /></div><div className="stat-number">{activeWorkers}</div><div className="stat-label">Active Workers</div><div className="stat-sub">{todayAtt} present today</div></div>
        <div className="stat-card stat-card-2"><div className="stat-icon"><Icon name="plant" size={28} /></div><div className="stat-number">10,000</div><div className="stat-label">Total Plants</div><div className="stat-sub">Day {dayNum} · {issueCount} issues</div></div>
        <div className="stat-card stat-card-3"><div className="stat-icon"><Icon name="berry" size={28} /></div><div className="stat-number">{harvestReady}</div><div className="stat-label">Ready to Harvest</div><div className="stat-sub">Sample {plants.length} plants data</div></div>
        <div className="stat-card stat-card-4"><div className="stat-icon"><Icon name="box" size={28} /></div><div className="stat-number">{totalBoxes}</div><div className="stat-label">Total Boxes Sold</div><div className="stat-sub">200g × ₹120/box</div></div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">📈 Weekly Yield (kg)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={yieldData}>
              <defs><linearGradient id="yg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2e7d4f" stopOpacity={0.3} /><stop offset="95%" stopColor="#2e7d4f" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="kg" stroke="#2e7d4f" fill="url(#yg)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title">🌿 Plant Health Overview</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={healthData} cx={75} cy={75} innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {healthData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {healthData.map(h => (
                <div key={h.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{h.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{h.value}</span>
                  </div>
                  <div className="progress"><div className="progress-bar" style={{ width: `${(h.value / plants.length) * 100}%`, background: h.fill }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">📋 Today's Schedule</div>
          {schedule.find(s => s.date === today) ? (
            <div>
              <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>💧 Drip Fertigation</div><div style={{ fontSize: 13, fontWeight: 600 }}>{schedule.find(s => s.date === today).drip}</div></div>
              <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>🌿 Evening Spray</div><div style={{ fontSize: 13, fontWeight: 600 }}>{schedule.find(s => s.date === today).spray === "None" ? "—" : schedule.find(s => s.date === today).spray}</div></div>
              <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>🌾 Field Work</div><div style={{ fontSize: 13, fontWeight: 600 }}>{schedule.find(s => s.date === today).field}</div></div>
              <div style={{ marginTop: 12, padding: '8px 12px', background: schedule.find(s => s.date === today).done ? 'var(--sage-pale)' : 'var(--gold-pale)', borderRadius: 6, fontSize: 12, fontWeight: 600, color: schedule.find(s => s.date === today).done ? '#15803d' : '#92400e' }}>
                {schedule.find(s => s.date === today).done ? '✅ Done' : '⏳ Pending'}
              </div>
            </div>
          ) : <div className="empty" style={{ padding: '20px 0' }}><div>No schedule for today</div></div>}
        </div>

        <div className="card">
          <div className="card-title">👷 Today's Workers</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--sage)' }}>{todayAtt}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Present</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--berry)' }}>{activeWorkers - todayAtt}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Absent</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold)' }}>{activeWorkers}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total</div></div>
          </div>
          <div className="progress" style={{ height: 10 }}><div className="progress-bar" style={{ width: `${todayAtt / activeWorkers * 100}%`, background: 'var(--sage)' }} /></div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>{Math.round(todayAtt / activeWorkers * 100)}% attendance</div>
          {workers.filter(w => w.active).slice(0, 4).map(w => {
            const status = attendance[`${today}_${w.id}`] || 'absent';
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 8px', background: 'var(--cream)', borderRadius: 6 }}>
                <div className={`worker-avatar ${w.gender === 'male' ? 'worker-male' : 'worker-female'}`} style={{ width: 28, height: 28, fontSize: 13 }}>{w.name[0]}</div>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{w.name}</span>
                <span className={`badge ${status === 'present' ? 'badge-green' : 'badge-red'}`}>{status === 'present' ? '✓' : '✗'}</span>
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-title">🛒 Customer Summary</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, background: 'var(--gold-pale)', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)' }}>{customers.filter(c => c.type === 'premium').length}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Premium</div>
            </div>
            <div style={{ flex: 1, background: 'var(--sage-pale)', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sage)' }}>{customers.filter(c => c.type === 'regular').length}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Regular</div>
            </div>
          </div>
          {customers.sort((a, b) => b.orders.reduce((x, o) => x + o.boxes, 0) - a.orders.reduce((x, o) => x + o.boxes, 0)).slice(0, 3).map(c => {
            const total = c.orders.reduce((x, o) => x + o.boxes, 0);
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{c.type === 'premium' ? '⭐' : '📦'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                  <div className="progress" style={{ height: 4, marginTop: 3 }}><div className="progress-bar" style={{ width: `${total / 400 * 100}%`, background: c.type === 'premium' ? 'var(--gold)' : 'var(--sage)' }} /></div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)' }}>{total} boxes</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// 2. WORKERS PAGE
// ═══════════════════════════════════════════════════════
const WorkersPage = () => {
  const [workers, setWorkers] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', gender: 'male', phone: '', salary: 500, role: 'Field Worker', joined: new Date().toISOString().split('T')[0], active: true });
  const [confirm, setConfirm] = useState(null);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const q = query(collection(db, 'workers'), orderBy('joined', 'desc'));
    return onSnapshot(q, snap => setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const saveWorker = async () => {
    if (!form.name.trim()) return alert('Please enter a name');
    const safeForm = { ...form, salary: Math.max(0, parseInt(form.salary) || 0) };
    if (editing) {
      await updateDoc(doc(db, 'workers', editing), safeForm);
    } else {
      await addDoc(collection(db, 'workers'), safeForm);
    }
    setModal(false);
  };
  const del = async (id) => { if (confirm) await deleteDoc(doc(db, 'workers', id)); setConfirm(null); };
  const toggleActive = async (worker) => {
    await updateDoc(doc(db, 'workers', worker.id), { active: !worker.active });
  };

  const openAdd = () => { setForm({ name: '', gender: 'male', phone: '', salary: 500, role: 'Field Worker', joined: new Date().toISOString().split('T')[0], active: true }); setEditing(null); setModal(true); };
  const openEdit = w => { setForm(w); setEditing(w.id); setModal(true); };

  const totalSalary = workers.filter(w => w.active).reduce((a, w) => a + (+w.salary || 0), 0);
  const males = workers.filter(w => w.gender === 'male').length;
  const females = workers.filter(w => w.gender === 'female').length;

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card stat-card-1"><div className="stat-number">{workers.filter(w => w.active).length}</div><div className="stat-label">Active Workers</div></div>
        <div className="stat-card stat-card-5"><div className="stat-number">👨{males} / 👩{females}</div><div className="stat-label">Male / Female</div></div>
        <div className="stat-card stat-card-4"><div className="stat-number">₹{totalSalary}</div><div className="stat-label">Daily Salary (Total)</div><div className="stat-sub">Monthly ≈ ₹{(totalSalary * 26).toLocaleString()}</div></div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ margin: 0 }}>👷 Workers List</div>
          <button className="btn btn-primary btn-sm" onClick={openAdd}><Icon name="add" /> Add Worker</button>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Gender</th><th>Role</th><th>Phone</th><th>Salary/Day</th><th>Joined Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {workers.map(w => (
                <tr key={w.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className={`worker-avatar ${w.gender === 'male' ? 'worker-male' : 'worker-female'}`} style={{ width: 32, height: 32, fontSize: 14 }}>{w.name[0]}</div><span style={{ fontWeight: 600 }}>{w.name}</span></div></td>
                  <td><span className={`badge ${w.gender === 'male' ? 'badge-blue' : 'badge-purple'}`}>{w.gender === 'male' ? '👨 Male' : '👩 Female'}</span></td>
                  <td>{w.role}</td>
                  <td style={{ fontSize: 12 }}>{w.phone}</td>
                  <td style={{ fontWeight: 700, color: 'var(--forest)' }}>₹{w.salary}</td>
                  <td style={{ fontSize: 12 }}>{w.joined}</td>
                  <td><span className={`badge ${w.active ? 'badge-green' : 'badge-gray'}`}>{w.active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="gap-10">
                      <button className="btn btn-xs btn-outline" onClick={() => openEdit(w)}>✏️</button>
                      <button className="btn btn-xs btn-ghost" onClick={() => toggleActive(w)}>{w.active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirm(w.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Worker' : 'Add New Worker'} size="modal-md"
        footer={<><button className="btn btn-primary" onClick={saveWorker}>💾 Save</button><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button></>}>
        <div className="form-row">
          <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => f('name', e.target.value)} /></div>
          <div className="form-group"><label>Gender</label><select value={form.gender} onChange={e => f('gender', e.target.value)}><option value="male">👨 Male</option><option value="female">👩 Female</option></select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => f('phone', e.target.value)} /></div>
          <div className="form-group"><label>Role</label><select value={form.role} onChange={e => f('role', e.target.value)}><option>Field Worker</option><option>Harvester</option><option>Irrigation</option><option>Supervisor</option><option>Sprayer</option></select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Salary / Day (₹)</label><input type="number" min="0" value={form.salary} onChange={e => f('salary', e.target.value)} /></div>
          <div className="form-group"><label>Joined Date</label><input type="date" value={form.joined} onChange={e => f('joined', e.target.value)} /></div>
        </div>
      </Modal>

      <Confirm open={!!confirm} msg="Are you sure you want to delete this worker?" onYes={() => { del(confirm); }} onNo={() => setConfirm(null)} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// 3. ATTENDANCE PAGE
// ═══════════════════════════════════════════════════════
const AttendancePage = () => {
  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState({});
  const today = new Date().toISOString().split('T')[0];
  const [selDate, setSelDate] = useState(today);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'workers'), snap => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(w => w.active));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'attendance'), snap => {
      const data = {};
      snap.docs.forEach(doc => {
        const { date, workerId, status } = doc.data();
        data[`${date}_${workerId}`] = status;
      });
      setAttendance(data);
    });
    return () => unsub();
  }, []);

  const markStatus = async (workerId, status) => {
    const q = query(collection(db, 'attendance'), where('date', '==', selDate), where('workerId', '==', workerId));
    const existing = (await getDocs(q)).docs[0];
    if (existing) {
      await updateDoc(doc(db, 'attendance', existing.id), { status });
    } else {
      await addDoc(collection(db, 'attendance'), { date: selDate, workerId, status });
    }
  };

  const batchMarkAll = async (statusTarget) => {
    const q = query(collection(db, 'attendance'), where('date', '==', selDate));
    const existingDocs = await getDocs(q);
    const existingMap = {};
    existingDocs.forEach(d => existingMap[d.data().workerId] = d.id);

    const batch = writeBatch(db);
    workers.forEach(w => {
      if (existingMap[w.id]) {
         batch.update(doc(db, 'attendance', existingMap[w.id]), { status: statusTarget });
      } else {
         batch.set(doc(collection(db, 'attendance')), { date: selDate, workerId: w.id, status: statusTarget });
      }
    });
    await batch.commit();
  };

  const getStatus = wid => attendance[`${selDate}_${wid}`] || 'absent';
  const presentCount = workers.filter(w => getStatus(w.id) === 'present').length;
  const totalSalary = workers.filter(w => getStatus(w.id) === 'present').reduce((a, w) => a + (+w.salary || 0), 0);

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6 + i);
    const ds = d.toISOString().split('T')[0];
    const cnt = workers.filter(w => attendance[`${ds}_${w.id}`] === 'present').length;
    return { date: ds, day: d.toLocaleDateString('en-US', { weekday: 'short' }), count: cnt };
  });

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card stat-card-6"><div className="stat-number">{presentCount}/{workers.length}</div><div className="stat-label">Present Today</div></div>
        <div className="stat-card stat-card-3"><div className="stat-number">{workers.length - presentCount}</div><div className="stat-label">Absent</div></div>
        <div className="stat-card stat-card-4"><div className="stat-number">₹{totalSalary}</div><div className="stat-label">Today's Salary Outflow</div></div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>📅 Attendance Mark</div>
            <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }} />
          </div>
          <div className="gap-10" style={{ marginBottom: 12 }}>
            <button className="btn btn-sage btn-sm" onClick={() => batchMarkAll('present')}>✅ Mark All Present</button>
            <button className="btn btn-ghost btn-sm" onClick={() => batchMarkAll('absent')}>Reset All</button>
          </div>
          {workers.map(w => {
            const s = getStatus(w.id);
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 6, background: 'var(--cream)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <div className={`worker-avatar ${w.gender === 'male' ? 'worker-male' : 'worker-female'}`} style={{ width: 36, height: 36 }}>{w.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{w.role} · ₹{w.salary}/day</div>
                </div>
                <div className="gap-10">
                  <button className={`btn btn-xs ${s === 'present' ? 'btn-sage' : 'btn-ghost'}`} onClick={() => markStatus(w.id, 'present')}>✅ Present</button>
                  <button className={`btn btn-xs ${s === 'absent' ? 'btn-danger' : 'btn-ghost'}`} onClick={() => markStatus(w.id, 'absent')}>✗ Absent</button>
                  <button className={`btn btn-xs ${s === 'halfday' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => markStatus(w.id, 'halfday')}>½ Half</button>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📊 Last 7 Days Attendance</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={last7}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, workers.length]} />
                <Tooltip />
                <Bar dataKey="count" name="Present" fill="var(--sage)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <div className="card-title">💰 Monthly Summary</div>
            <table className="tbl">
              <thead><tr><th>Worker</th><th>Present Days</th><th>Salary Payable</th></tr></thead>
              <tbody>
                {workers.map(w => {
                  const days = Object.keys(attendance).filter(k => k.endsWith('_' + w.id) && attendance[k] === 'present').length;
                  return (<tr key={w.id}><td style={{ fontWeight: 600 }}>{w.name}</td><td>{days}</td><td style={{ fontWeight: 700, color: 'var(--forest)' }}>₹{days * w.salary}</td></tr>);
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// 4. SCHEDULE PAGE
// ═══════════════════════════════════════════════════════
const SchedulePage = () => {
  const [schedule, setSchedule] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ date: '', drip: '', spray: 'None', field: '', note: '', type: 'harvest', done: false });
  const [filter, setFilter] = useState('all');
  const [bulk, setBulk] = useState({ startDate: '', days: 7, pattern: 'harvest' });
  const [bulkModal, setBulkModal] = useState(false);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const q = query(collection(db, 'schedule'), orderBy('date'));
    return onSnapshot(q, snap => setSchedule(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const saveSchedule = async () => {
    if (!form.date || !form.drip) return alert('Date & Drip details are required');
    if (editing) {
      await updateDoc(doc(db, 'schedule', editing), form);
    } else {
      await addDoc(collection(db, 'schedule'), form);
    }
    setModal(false);
  };
  const del = async (id) => await deleteDoc(doc(db, 'schedule', id));
  const toggleDone = async (id) => {
    const s = schedule.find(s => s.id === id);
    if (s) await updateDoc(doc(db, 'schedule', id), { done: !s.done });
  };

  const addBulk = async () => {
    const patterns = {
      harvest: { drip: 'SOP 0:00:50 (1.5-2 kg)', spray: 'None', field: 'Harvest', type: 'harvest' },
      spray: { drip: 'Controlled Irrigation', spray: 'ONDA (200ml) + COLORE (250g)', field: 'QR Update', type: 'spray' },
      monitor: { drip: 'Controlled Irrigation', spray: 'Boron 20% (100g/100L)', field: 'Monitor', type: 'monitor' },
    };
    const p = patterns[bulk.pattern] || patterns.harvest;
    const batch = writeBatch(db);
    for (let i = 0; i < +bulk.days; i++) {
      const d = new Date(bulk.startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const existing = schedule.find(s => s.date === dateStr);
      if (!existing) {
        batch.set(doc(db, 'schedule', Date.now().toString() + i), { ...p, date: dateStr, note: 'Auto-generated', done: false });
      }
    }
    await batch.commit();
    setBulkModal(false);
  };

  const filtered = schedule.filter(s => filter === 'all' || s.type === filter);
  const typeBadge = { harvest: 'badge-gold', monitor: 'badge-green', spray: 'badge-blue', rest: 'badge-gray' };
  const typeLabel = { harvest: '🍓 Harvest', monitor: '👁 Monitor', spray: '🌿 Spray', rest: '😴 Rest' };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div className="gap-10">
          {['all', 'harvest', 'spray', 'monitor', 'rest'].map(t => (
            <button key={t} className={`btn btn-xs ${filter === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(t)}>{t === 'all' ? 'All' : typeLabel[t] || t}</button>
          ))}
        </div>
        <div className="gap-10">
          <button className="btn btn-gold btn-sm" onClick={() => setBulkModal(true)}>⚡ Add Bulk</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setForm({ date: today, drip: '', spray: 'None', field: '', note: '', type: 'harvest', done: false }); setEditing(null); setModal(true); }}><Icon name="add" /> Add Day</button>
        </div>
      </div>

      <div className="card">
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Type</th><th>💧 Drip Fertigation</th><th>🌿 Evening Spray</th><th>🌾 Field Work</th><th>Note</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ background: s.date === today ? 'var(--gold-pale)' : '' }}>
                  <td style={{ fontWeight: s.date === today ? 700 : 400 }}>{s.date === today ? '👉 ' : ''}{s.date}</td>
                  <td><span className={`badge ${typeBadge[s.type] || 'badge-gray'}`}>{typeLabel[s.type] || s.type}</span></td>
                  <td style={{ fontSize: 12, maxWidth: 160 }}>{s.drip}</td>
                  <td style={{ fontSize: 12, maxWidth: 140 }}>{s.spray === 'None' ? <span style={{ color: '#ccc' }}>—</span> : s.spray}</td>
                  <td style={{ fontSize: 12 }}>{s.field}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 120 }}>{s.note}</td>
                  <td><button className={`btn btn-xs ${s.done ? 'btn-sage' : 'btn-ghost'}`} onClick={() => toggleDone(s.id)}>{s.done ? '✅' : '⏳'}</button></td>
                  <td>
                    <div className="gap-10">
                      <button className="btn btn-xs btn-outline" onClick={() => { setForm(s); setEditing(s.id); setModal(true); }}>✏️</button>
                      <button className="btn btn-xs btn-danger" onClick={() => del(s.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Schedule' : 'Add New Day'} size="modal-md"
        footer={<><button className="btn btn-primary" onClick={saveSchedule}>💾 Save</button><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button></>}>
        <div className="form-row">
          <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={e => f('date', e.target.value)} /></div>
          <div className="form-group"><label>Type</label><select value={form.type} onChange={e => f('type', e.target.value)}><option value="harvest">🍓 Harvest</option><option value="monitor">👁 Monitor</option><option value="spray">🌿 Spray</option><option value="rest">😴 Rest</option></select></div>
        </div>
        <div className="form-group"><label>💧 Drip Fertigation *</label><input value={form.drip} onChange={e => f('drip', e.target.value)} placeholder="e.g. MinSol 13:00:45 (1.5kg)" /></div>
        <div className="form-group"><label>🌿 Evening Spray</label><input value={form.spray} onChange={e => f('spray', e.target.value)} placeholder="e.g. COLORE 250g + ONDA 200ml" /></div>
        <div className="form-group"><label>🌾 Field Work</label><input value={form.field} onChange={e => f('field', e.target.value)} placeholder="e.g. Harvest / Weed clearing" /></div>
        <div className="form-group"><label>📝 Note</label><textarea value={form.note} onChange={e => f('note', e.target.value)} style={{ minHeight: 60 }} /></div>
      </Modal>

      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title="⚡ Bulk Add Schedule" size="modal-sm"
        footer={<><button className="btn btn-gold" onClick={addBulk}>⚡ Add</button><button className="btn btn-ghost" onClick={() => setBulkModal(false)}>Cancel</button></>}>
        <div className="form-group"><label>Start Date</label><input type="date" value={bulk.startDate} onChange={e => setBulk(p => ({ ...p, startDate: e.target.value }))} /></div>
        <div className="form-group"><label>Number of Days</label><input type="number" min="1" max="90" value={bulk.days} onChange={e => setBulk(p => ({ ...p, days: e.target.value }))} /></div>
        <div className="form-group"><label>Pattern</label><select value={bulk.pattern} onChange={e => setBulk(p => ({ ...p, pattern: e.target.value }))}><option value="harvest">🍓 Harvest pattern</option><option value="spray">🌿 Spray pattern</option><option value="monitor">👁 Monitor pattern</option></select></div>
        <div className="alert alert-info" style={{ marginTop: 10 }}>Will skip dates that already exist.</div>
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// 5. FERTILISER / PEST PAGE
// ═══════════════════════════════════════════════════════
const FertiliserPage = () => {
  const [changes, setChanges] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ date: '', reason: 'weather', original: '', replacement: '', notes: '', aiRec: '' });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResp, setAiResp] = useState('');
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const q = query(collection(db, 'pestChanges'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setChanges(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const askAI = async () => {
    setAiLoading(true);
    const r = await callGemini(`Reason: ${form.reason}. Original plan: ${form.original}. What alternative fertiliser/pesticide should I use from my stock? When? Dose? PHI?`);
    setAiResp(r);
    setAiLoading(false);
  };

  const saveChange = async () => {
    await addDoc(collection(db, 'pestChanges'), { ...form, aiRec: aiResp, createdAt: new Date().toISOString() });
    setModal(false);
    setAiResp('');
    setForm({ date: '', reason: 'weather', original: '', replacement: '', notes: '', aiRec: '' });
  };

  const addToSchedule = async (change) => {
    if (!change.date) return alert('Date is missing');
    const q = query(collection(db, 'schedule'), where('date', '==', change.date));
    const existing = (await getDocs(q)).docs[0];
    if (existing) {
      await updateDoc(doc(db, 'schedule', existing.id), { drip: change.replacement || existing.data().drip, note: existing.data().note + ' [AI Modified]' });
    }
    alert('Schedule updated ✅');
  };

  const reasons = { weather: '🌧️ Weather Change', busy: '🔧 Operational Delay', stock: '📦 Out of Stock', ai: '🤖 AI Recommendation', other: '📝 Other' };

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: 16 }}>🧪 Use this module to log any deviations in fertiliser/pesticide schedules due to weather or stock. Ask AI for alternatives and add them directly to your schedule.</div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--forest)' }}>🔄 Change Log ({changes.length})</div>
        <button className="btn btn-primary" onClick={() => setModal(true)}><Icon name="add" /> Log New Change</button>
      </div>
      {changes.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">🧪</div>No changes logged yet. Keep your schedule updated here.</div></div>
      ) : (
        changes.map(c => (
          <div className="card" key={c.id} style={{ marginBottom: 12 }}>
            <div className="flex-between" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>{reasons[c.reason]?.split(' ')[0] || '📝'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{reasons[c.reason] || c.reason}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.date} · {new Date(c.createdAt).toLocaleString()}</div>
                </div>
              </div>
              <button className="btn btn-sage btn-sm" onClick={() => addToSchedule(c)}>📋 Add to Schedule</button>
            </div>
            <div className="grid-2" style={{ gap: 10, marginBottom: c.aiRec ? 10 : 0 }}>
              <div style={{ background: 'var(--berry-pale)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--berry)', marginBottom: 3 }}>❌ Original Plan</div>
                <div style={{ fontSize: 13 }}>{c.original || '—'}</div>
              </div>
              <div style={{ background: 'var(--sage-pale)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)', marginBottom: 3 }}>✅ Alternative</div>
                <div style={{ fontSize: 13 }}>{c.replacement || '—'}</div>
              </div>
            </div>
            {c.aiRec && <div className="ai-wrap"><div className="ai-label">🤖 AI Recommendation</div><div className="ai-text">{c.aiRec}</div></div>}
            {c.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>📝 {c.notes}</div>}
          </div>
        ))
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="🔄 Log Schedule Change" size="modal-lg"
        footer={<><button className="btn btn-primary" onClick={saveChange}>💾 Save</button><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button></>}>
        <div className="form-row">
          <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => f('date', e.target.value)} /></div>
          <div className="form-group"><label>Reason</label><select value={form.reason} onChange={e => f('reason', e.target.value)}>{Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div className="form-group"><label>Original Plan</label><input value={form.original} onChange={e => f('original', e.target.value)} placeholder="e.g., ONDA 200ml spray" /></div>
        <div className="form-group"><label>Alternative Plan</label><input value={form.replacement} onChange={e => f('replacement', e.target.value)} placeholder="e.g., Boron 1g/L spray" /></div>
        <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Additional details..." /></div>
        <button className="btn btn-gold" onClick={askAI} disabled={aiLoading} style={{ marginBottom: 10 }}>
          {aiLoading ? '🤔 Thinking...' : '🤖 Ask AI for Alternative'}
        </button>
        {aiLoading && <div className="ai-dots"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /><span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>AI is analyzing...</span></div>}
        {aiResp && <div className="ai-wrap"><div className="ai-label">🤖 AI Recommendation</div><div className="ai-text">{aiResp}</div></div>}
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// 6. CROP MONITORING PAGE
// ═══════════════════════════════════════════════════════
const CropPage = () => {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sampleSize, setSampleSize] = useState(50);
  const [editPlant, setEditPlant] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResp, setAiResp] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'plants', 'master'), docSnap => {
      if (docSnap.exists()) {
        setPlants(docSnap.data().items || []);
      } else {
        setDoc(doc(db, 'plants', 'master'), { items: SEED_PLANTS });
        setPlants(SEED_PLANTS);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const savePlants = async (updatedPlants) => {
    await updateDoc(doc(db, 'plants', 'master'), { items: updatedPlants });
    setPlants(updatedPlants);
  };

  const displayed = plants.slice(0, sampleSize);
  const healthy = displayed.filter(p => !p.defect).length;
  const issues = displayed.filter(p => p.defect);
  const totalFlowers = displayed.reduce((a, p) => a + p.flowers, 0);
  const totalGreen = displayed.reduce((a, p) => a + p.greenFruits, 0);
  const totalRed = displayed.reduce((a, p) => a + p.redFruits, 0);
  const totalYield = displayed.reduce((a, p) => a + p.yieldGrams, 0);

  const getCellClass = p => {
    if (p.defect) return 'plant-issue';
    if (p.redFruits > 2) return 'plant-harvest';
    if (p.flowers > 3) return 'plant-flowering';
    return 'plant-healthy';
  };

  const updatePlant = (id, key, val) => {
    const safeVal = Math.max(0, parseInt(val) || 0); // Enforce non-negative numbers
    const updated = plants.map(p => p.id === id ? { ...p, [key]: safeVal } : p);
    savePlants(updated);
  };

  const addMorePlants = (count) => {
    const newPlants = Array.from({ length: count }, (_, i) => ({
      id: plants.length + i + 1,
      healthy: Math.random() > 0.25,
      flowers: Math.floor(Math.random() * 8),
      greenFruits: Math.floor(Math.random() * 6),
      redFruits: Math.floor(Math.random() * 4),
      defect: Math.random() < 0.15 ? ["slug damage", "leaf curl", "grey mould", "aphids"][Math.floor(Math.random() * 4)] : "",
      yieldGrams: Math.floor(Math.random() * 300 + 50),
    }));
    savePlants([...plants, ...newPlants]);
    setSampleSize(plants.length + count);
  };

  const askAI = async () => {
    setAiLoading(true);
    const summary = `Sample ${sampleSize} plants: ${healthy} healthy, ${issues.length} issues (${[...new Set(issues.map(i => i.defect))].join(', ')}), ${totalFlowers} flowers, ${totalGreen} green fruits, ${totalRed} ready to harvest. Total yield: ${totalYield}g. What action to take?`;
    const r = await callGemini(summary);
    setAiResp(r);
    setAiLoading(false);
  };

  if (loading) return <div className="card"><div className="empty">Loading plants...</div></div>;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          ['🌿 Healthy', healthy, 'var(--sage)'],
          ['⚠️ Issues', issues.length, 'var(--berry)'],
          ['🌸 Flowers', totalFlowers, 'var(--gold)'],
          ['🟢 Green', totalGreen, '#27ae60'],
          ['🍓 Ready', totalRed, '#e91e63'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ flex: '1 1 120px', background: '#fff', borderRadius: 'var(--r)', padding: 14, textAlign: 'center', border: '1px solid var(--border)', borderTop: `3px solid ${c}` }}>
            <div style={{ fontFamily: 'Poppins', fontSize: 22, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">📊 Farm Analytics</div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'space-around', marginBottom: 16, flexWrap: 'wrap' }}>
            <Ring pct={Math.round(healthy / sampleSize * 100)} color="var(--sage)" size={90} label="Healthy" sub={`${healthy}/${sampleSize}`} />
            <Ring pct={Math.round(totalRed / (totalGreen + totalRed || 1) * 100)} color="#e91e63" size={90} label="Harvest Ready" sub={`${totalRed} fruits`} />
            <Ring pct={Math.round(totalYield / sampleSize / 500 * 100)} color="var(--gold)" size={90} label="Yield Score" sub={`${(totalYield / 1000).toFixed(1)}kg`} />
          </div>
          <div style={{ background: 'var(--cream)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Extrapolated to 10,000 plants:</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>Est. Red Fruits:</span> <strong>{Math.round(totalRed / sampleSize * 10000)}</strong></div>
              <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>Est. Yield:</span> <strong>{(totalYield / sampleSize * 10 / 1000).toFixed(0)}kg</strong></div>
              <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>Est. Revenue:</span> <strong>₹{Math.round(totalYield / sampleSize * 10 / 0.2 * 120).toLocaleString()}</strong></div>
              <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>Issue Plants:</span> <strong>{Math.round(issues.length / sampleSize * 100)}%</strong></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">🐛 Defect Summary</div>
          {issues.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>No issues found! 🎉</div> : [...new Set(issues.map(p => p.defect))].map(def => (
            <div key={def} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{def}</span>
                <span className="badge badge-red">{issues.filter(p => p.defect === def).length} plants</span>
              </div>
              <div className="progress"><div className="progress-bar" style={{ width: `${issues.filter(p => p.defect === def).length / sampleSize * 100}%`, background: 'var(--berry)' }} /></div>
            </div>
          ))}
          <hr className="divider" />
          <button className="btn btn-gold btn-sm" onClick={askAI} disabled={aiLoading}>
            {aiLoading ? '🤔 Thinking...' : '🤖 Ask AI for Advice'}
          </button>
          {aiLoading && <div className="ai-dots" style={{ marginTop: 8 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>}
          {aiResp && <div className="ai-wrap" style={{ marginTop: 10 }}><div className="ai-label">AI Advice</div><div className="ai-text">{aiResp}</div></div>}
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>🌱 Plant Grid (Sample: {sampleSize})</div>
          <div className="gap-10">
            <select value={sampleSize} onChange={e => setSampleSize(+e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              {[10, 25, 50, 100].filter(n => n <= plants.length).map(n => <option key={n} value={n}>{n} plants</option>)}
              <option value={plants.length}>{plants.length} (All)</option>
            </select>
            <button className="btn btn-sage btn-sm" onClick={() => addMorePlants(10)}>+10 plants</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {[['plant-healthy', 'var(--sage)', 'Healthy'], ['plant-flowering', 'var(--gold)', 'Flowering'], ['plant-harvest', '#e91e63', 'Ready'], ['plant-issue', 'var(--berry)', 'Issue']].map(([cls, c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{l}</span>
            </div>
          ))}
        </div>
        <div className="plant-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(30px, 1fr))` }}>
          {displayed.map(p => (
            <div key={p.id} className={`plant-cell ${getCellClass(p)}`} onClick={() => setEditPlant(p)}
              title={`P${p.id}${p.defect ? ' – ' + p.defect : ''} 🌸${p.flowers} 🟢${p.greenFruits} 🍓${p.redFruits}`}>
              {p.id}
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!editPlant} onClose={() => setEditPlant(null)} title={`Edit Plant #${editPlant?.id}`} size="modal-sm"
        footer={<><button className="btn btn-primary" onClick={() => setEditPlant(null)}>💾 Close</button></>}>
        {editPlant && (
          <div>
            <div className="form-row">
              <div className="form-group">
                <label>🌸 Flowers</label>
                <input type="number" min="0" value={editPlant.flowers} onChange={e => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  setEditPlant(p => ({ ...p, flowers: val }));
                  updatePlant(editPlant.id, 'flowers', val);
                }} />
              </div>
              <div className="form-group">
                <label>🟢 Green Fruits</label>
                <input type="number" min="0" value={editPlant.greenFruits} onChange={e => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  setEditPlant(p => ({ ...p, greenFruits: val }));
                  updatePlant(editPlant.id, 'greenFruits', val);
                }} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>🍓 Red Fruits</label>
                <input type="number" min="0" value={editPlant.redFruits} onChange={e => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  setEditPlant(p => ({ ...p, redFruits: val }));
                  updatePlant(editPlant.id, 'redFruits', val);
                }} />
              </div>
              <div className="form-group">
                <label>⚖️ Yield (grams)</label>
                <input type="number" min="0" value={editPlant.yieldGrams} onChange={e => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  setEditPlant(p => ({ ...p, yieldGrams: val }));
                  updatePlant(editPlant.id, 'yieldGrams', val);
                }} />
              </div>
            </div>
            <div className="form-group"><label>⚠️ Defect / Issue</label>
              <select value={editPlant.defect} onChange={e => { setEditPlant(p => ({ ...p, defect: e.target.value })); updatePlant(editPlant.id, 'defect', e.target.value); }}>
                <option value="">Healthy Plant</option>
                <option value="slug damage">Slug Damage</option><option value="aphids">Aphids</option>
                <option value="grey mould">Grey Mould</option><option value="leaf curl">Leaf Curl</option>
                <option value="root rot">Root Rot</option><option value="caterpillar">Caterpillar</option>
                <option value="mites">Spider Mites</option>
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// 7. REPORTS PAGE
// ═══════════════════════════════════════════════════════
const ReportsPage = () => {
  const [reports, setReports] = useState([]);
  const [modal, setModal] = useState(false);
  const [selReport, setSelReport] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResp, setAiResp] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({ workerName: '', date: new Date().toISOString().split('T')[0], description: '', plantSection: '', severity: 'medium', imageData: '' });
  const fileRef = useRef();
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const q = query(collection(db, 'defectReports'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const saveReport = async () => {
    if (!form.description) return alert('Please enter a description');
    await addDoc(collection(db, 'defectReports'), { ...form, seen: false, createdAt: new Date().toISOString() });
    setAddModal(false);
    setForm({ workerName: '', date: new Date().toISOString().split('T')[0], description: '', plantSection: '', severity: 'medium', imageData: '' });
  };

  const analyzeWithAI = async (report) => {
    setSelReport(report); setAiLoading(true); setAiResp(''); setModal(true);
    await updateDoc(doc(db, 'defectReports', report.id), { seen: true });
    const prompt = `Field report: ${report.description}. Section: ${report.plantSection}. Severity: ${report.severity}. Date: ${report.date}. Analyze and recommend fertiliser/pesticide changes.`;
    const r = await callGemini(prompt, report.imageData || null);
    setAiResp(r); setAiLoading(false);
  };

  const deleteReport = async (id) => {
    await deleteDoc(doc(db, 'defectReports', id));
  };

  const addToSchedule = async () => {
    if (!selReport) return;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const ds = tomorrow.toISOString().split('T')[0];
    const q = query(collection(db, 'schedule'), where('date', '==', ds));
    const existing = (await getDocs(q)).docs[0];
    if (existing) {
      await updateDoc(doc(db, 'schedule', existing.id), { note: existing.data().note + ' | AI Fix: ' + aiResp.slice(0, 80) + '...' });
    } else {
      await addDoc(collection(db, 'schedule'), {
        date: ds,
        drip: 'AI-recommended Check',
        spray: aiResp.slice(0, 60) + '...',
        field: 'Defect Treatment',
        note: aiResp.slice(0, 120),
        type: 'monitor',
        done: false,
      });
    }
    alert('✅ AI Recommendation added to schedule!');
    setModal(false);
  };

  const handleImageUpload = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => f('imageData', ev.target.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  const severityBadge = { high: 'badge-red', medium: 'badge-gold', low: 'badge-green' };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div className="alert alert-info" style={{ margin: 0, flex: 1, marginRight: 12 }}>👷 Workers can report field issues here. The Admin can request AI advice and inject fixes directly into the schedule.</div>
        <button className="btn btn-berry" onClick={() => setAddModal(true)}><Icon name="add" /> Add Report</button>
      </div>

      {reports.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">✅</div>No defect reports. The farm is in great condition!</div></div>
      ) : (
        <div className="grid-2">
          {reports.map(r => (
            <div key={r.id} className="defect-card">
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>👷 {r.workerName || 'Worker'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.date} · Section: {r.plantSection}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge ${severityBadge[r.severity] || 'badge-gold'}`}>{r.severity}</span>
                  {!r.seen && <span className="badge badge-red">🆕 New</span>}
                </div>
              </div>
              {r.imageData && <img src={`data:image/jpeg;base64,${r.imageData}`} alt="defect" className="defect-img" />}
              <div style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>{r.description}</div>
              <div className="gap-10">
                <button className="btn btn-gold btn-sm" onClick={() => analyzeWithAI(r)}>🤖 AI Analysis</button>
                <button className="btn btn-danger btn-xs" onClick={() => deleteReport(r.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => { setModal(false); setAiResp(''); }} title="🤖 AI Analysis & Schedule Update" size="modal-lg"
        footer={<><button className="btn btn-sage" onClick={addToSchedule} disabled={!aiResp}>📋 Add to Schedule</button><button className="btn btn-ghost" onClick={() => setModal(false)}>Close</button></>}>
        {selReport && (
          <div>
            <div className="alert alert-warn" style={{ marginBottom: 12 }}>
              <div><strong>Report:</strong> {selReport.description}</div>
              <div style={{ marginTop: 4 }}><strong>Section:</strong> {selReport.plantSection} · <strong>Severity:</strong> {selReport.severity}</div>
            </div>
            {aiLoading && <div className="ai-dots"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /><span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>AI is analyzing...</span></div>}
            {aiResp && (
              <div>
                <div className="ai-wrap"><div className="ai-label">🤖 AI Recommendation</div><div className="ai-text">{aiResp}</div></div>
                <div className="alert alert-success" style={{ marginTop: 12 }}>
                  ✅ Click "Add to Schedule" to automatically append this fix to tomorrow's tasks.
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={addModal} onClose={() => setAddModal(false)} title="🚨 Add Defect Report" size="modal-md"
        footer={<><button className="btn btn-berry" onClick={saveReport}>💾 Save Report</button><button className="btn btn-ghost" onClick={() => setAddModal(false)}>Cancel</button></>}>
        <div className="form-row">
          <div className="form-group"><label>Worker Name</label><input value={form.workerName} onChange={e => f('workerName', e.target.value)} placeholder="Your Name" /></div>
          <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => f('date', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Plant Section</label><input value={form.plantSection} onChange={e => f('plantSection', e.target.value)} placeholder="e.g. Row 1-10 or Block A" /></div>
          <div className="form-group"><label>Severity</label><select value={form.severity} onChange={e => f('severity', e.target.value)}><option value="high">🔴 High</option><option value="medium">🟡 Medium</option><option value="low">🟢 Low</option></select></div>
        </div>
        <div className="form-group"><label>Description *</label><textarea value={form.description} onChange={e => f('description', e.target.value)} placeholder="What did you observe? How many plants? Symptoms?" /></div>
        <div className="form-group">
          <label>📸 Image (Optional)</label>
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            <input type="file" ref={fileRef} accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
            {form.imageData ? <div style={{ color: 'var(--sage)', fontWeight: 600 }}>✅ Image Added</div> : <div style={{ color: 'var(--muted)', fontSize: 13 }}>📸 Click to upload image</div>}
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// 8. CUSTOMERS PAGE
// ═══════════════════════════════════════════════════════
const CustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', location: '', type: 'regular', since: new Date().toISOString().split('T')[0], orders: [] });
  const [orderModal, setOrderModal] = useState(null);
  const [orderForm, setOrderForm] = useState({ date: new Date().toISOString().split('T')[0], boxes: 50 });
  const [confirm, setConfirm] = useState(null);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    return onSnapshot(collection(db, 'customers'), snap => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data(), orders: d.data().orders || [] })));
    });
  }, []);

  const saveCustomer = async () => {
    if (!form.name) return alert('Name is required');
    if (editing) {
      await updateDoc(doc(db, 'customers', editing), form);
    } else {
      await addDoc(collection(db, 'customers'), form);
    }
    setModal(false);
  };
  const del = async (id) => { if (confirm) await deleteDoc(doc(db, 'customers', id)); setConfirm(null); };

  const addOrder = async () => {
    if (!orderModal) return;
    const cust = customers.find(c => c.id === orderModal);
    if (cust) {
      const updated = { orders: [...(cust.orders || []), orderForm] };
      await updateDoc(doc(db, 'customers', orderModal), updated);
    }
    setOrderModal(null);
  };

  const getCustomerTier = c => {
    const total = (c.orders || []).reduce((a, o) => a + (o.boxes || 0), 0);
    if (total >= 300) return { label: 'Platinum', color: '#7e22ce', bg: '#f3e8ff' };
    if (total >= 100) return { label: 'Gold ⭐', color: '#b07800', bg: 'var(--gold-pale)' };
    return { label: 'Regular', color: 'var(--sage)', bg: 'var(--sage-pale)' };
  };

  const totalBoxes = customers.reduce((a, c) => a + (c.orders || []).reduce((b, o) => b + (o.boxes || 0), 0), 0);
  const totalRev = totalBoxes * 120;
  const sorted = [...customers].sort((a, b) => (b.orders || []).reduce((x, o) => x + o.boxes, 0) - (a.orders || []).reduce((x, o) => x + o.boxes, 0));

  const chartData = sorted.map(c => ({
    name: c.name.split(' ')[0],
    boxes: (c.orders || []).reduce((a, o) => a + o.boxes, 0),
    revenue: (c.orders || []).reduce((a, o) => a + o.boxes * 120, 0),
  }));

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card stat-card-1"><div className="stat-number">{customers.length}</div><div className="stat-label">Total Customers</div></div>
        <div className="stat-card stat-card-4"><div className="stat-number">{customers.filter(c => c.type === 'premium').length}</div><div className="stat-label">Premium ⭐</div></div>
        <div className="stat-card stat-card-3"><div className="stat-number">{totalBoxes}</div><div className="stat-label">Total Boxes Sold</div><div className="stat-sub">200g each</div></div>
        <div className="stat-card stat-card-2"><div className="stat-number">₹{(totalRev / 1000).toFixed(1)}K</div><div className="stat-label">Total Revenue</div></div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">📦 Boxes by Customer</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
              <Tooltip />
              <Bar dataKey="boxes" fill="var(--forest3)" radius={[0, 4, 4, 0]} name="Boxes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title">💰 Revenue by Customer</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" outerRadius={80} dataKey="revenue" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {chartData.map((_, i) => <Cell key={i} fill={['#1a5c38', '#f0a500', '#d63031', '#7fb069', '#8e44ad'][i % 5]} />)}
              </Pie>
              <Tooltip formatter={v => '₹' + v.toLocaleString()} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ margin: 0 }}>🛒 Customer List</div>
          <button className="btn btn-primary btn-sm" onClick={() => { setForm({ name: '', phone: '', location: '', type: 'regular', since: new Date().toISOString().split('T')[0], orders: [] }); setEditing(null); setModal(true); }}>
            <Icon name="add" /> Add Customer
          </button>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Location</th><th>Tier</th><th>Orders</th><th>Total Boxes</th><th>Revenue</th><th>Avg/Order</th><th>Actions</th></tr></thead>
            <tbody>
              {sorted.map(c => {
                const total = (c.orders || []).reduce((a, o) => a + o.boxes, 0);
                const rev = total * 120;
                const avg = c.orders?.length ? Math.round(total / c.orders.length) : 0;
                const tier = getCustomerTier(c);
                return (
                  <tr key={c.id}>
                    <td><div style={{ fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}</div></td>
                    <td style={{ fontSize: 12 }}>{c.location}</td>
                    <td><span className="badge" style={{ background: tier.bg, color: tier.color }}>{tier.label}</span></td>
                    <td style={{ textAlign: 'center' }}>{c.orders?.length || 0}</td>
                    <td style={{ fontWeight: 700, color: 'var(--forest)', textAlign: 'center' }}>{total}</td>
                    <td style={{ fontWeight: 700, color: 'var(--berry)' }}>₹{rev.toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>{avg} boxes</td>
                    <td>
                      <div className="gap-10">
                        <button className="btn btn-xs btn-sage" onClick={() => setOrderModal(c.id)}>📦 Order</button>
                        <button className="btn btn-xs btn-outline" onClick={() => { setForm(c); setEditing(c.id); setModal(true); }}>✏️</button>
                        <button className="btn btn-xs btn-danger" onClick={() => setConfirm(c.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Customer' : 'New Customer'} size="modal-sm"
        footer={<><button className="btn btn-primary" onClick={saveCustomer}>💾 Save</button><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button></>}>
        <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => f('name', e.target.value)} /></div>
        <div className="form-row">
          <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => f('phone', e.target.value)} /></div>
          <div className="form-group"><label>Location</label><input value={form.location} onChange={e => f('location', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Type</label><select value={form.type} onChange={e => f('type', e.target.value)}><option value="regular">Regular</option><option value="premium">Premium ⭐</option></select></div>
          <div className="form-group"><label>Since</label><input type="date" value={form.since} onChange={e => f('since', e.target.value)} /></div>
        </div>
      </Modal>

      <Modal open={!!orderModal} onClose={() => setOrderModal(null)} title="📦 Add Order" size="modal-sm"
        footer={<><button className="btn btn-primary" onClick={addOrder}>💾 Save</button><button className="btn btn-ghost" onClick={() => setOrderModal(null)}>Cancel</button></>}>
        <div className="alert alert-info">200g boxes – ₹120 per box</div>
        <div className="form-group" style={{ marginTop: 10 }}><label>Date</label><input type="date" value={orderForm.date} onChange={e => setOrderForm(p => ({ ...p, date: e.target.value }))} /></div>
        <div className="form-group"><label>Number of Boxes</label><input type="number" min="1" value={orderForm.boxes} onChange={e => setOrderForm(p => ({ ...p, boxes: +e.target.value }))} /></div>
        <div style={{ background: 'var(--gold-pale)', borderRadius: 8, padding: 12, marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--forest)' }}>Total: ₹{(orderForm.boxes * 120).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>({orderForm.boxes} boxes × ₹120)</div>
        </div>
      </Modal>

      <Confirm open={!!confirm} msg="Are you sure you want to delete this customer?" onYes={() => { del(confirm); }} onNo={() => setConfirm(null)} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Mobile Menu State

  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [schedule, setSchedule] = useState([]);
  const [plants, setPlants] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [defectReports, setDefectReports] = useState([]);
  const [notifCount, setNotifCount] = useState(0);

  const today = new Date().toISOString().split('T')[0];
  const plantDate = new Date('2026-03-10');
  const dayNum = Math.max(1, Math.floor((new Date() - plantDate) / 864e5) + 1);

  useEffect(() => {
    seedIfEmpty();
  }, []);

  useEffect(() => {
    const unsubWorkers = onSnapshot(collection(db, 'workers'), snap => setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubAttendance = onSnapshot(collection(db, 'attendance'), snap => {
      const data = {};
      snap.docs.forEach(doc => {
        const { date, workerId, status } = doc.data();
        data[`${date}_${workerId}`] = status;
      });
      setAttendance(data);
    });
    const unsubSchedule = onSnapshot(query(collection(db, 'schedule'), orderBy('date')), snap => setSchedule(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubCustomers = onSnapshot(collection(db, 'customers'), snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data(), orders: d.data().orders || [] }))));
    const unsubDefects = onSnapshot(query(collection(db, 'defectReports'), orderBy('createdAt', 'desc')), snap => setDefectReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubPlants = onSnapshot(doc(db, 'plants', 'master'), docSnap => {
      if (docSnap.exists()) setPlants(docSnap.data().items || []);
    });

    return () => {
      unsubWorkers();
      unsubAttendance();
      unsubSchedule();
      unsubCustomers();
      unsubDefects();
      unsubPlants();
    };
  }, []);

  useEffect(() => {
    setNotifCount(defectReports.filter(d => !d.seen).length);
  }, [defectReports]);

  const navItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { section: 'Farm Management' },
    { id: 'workers', icon: 'workers', label: 'Workers' },
    { id: 'attendance', icon: 'attendance', label: 'Attendance' },
    { id: 'schedule', icon: 'schedule', label: 'Daily Schedule' },
    { id: 'fertiliser', icon: 'fertiliser', label: 'Fertiliser / Pest' },
    { section: 'Monitoring' },
    { id: 'crop', icon: 'crop', label: 'Crop Monitoring' },
    { id: 'reports', icon: 'reports', label: 'Worker Reports', badge: notifCount || null },
    { section: 'Business' },
    { id: 'customers', icon: 'customers', label: 'Customers' },
  ];

  const pageTitles = {
    dashboard: '📊 Overview Dashboard', workers: '👷 Worker Management', attendance: '📅 Attendance Tracking',
    schedule: '📋 Daily Schedule', fertiliser: '🧪 Fertiliser & Pest Management', crop: '🌱 Crop Monitoring',
    reports: '🚨 Worker Field Reports', customers: '🛒 Customer Management',
  };

  const pages = {
    dashboard: <DashboardPage workers={workers} attendance={attendance} schedule={schedule} plants={plants} customers={customers} defectReports={defectReports} today={today} dayNum={dayNum} />,
    workers: <WorkersPage />,
    attendance: <AttendancePage />,
    schedule: <SchedulePage />,
    fertiliser: <FertiliserPage />,
    crop: <CropPage />,
    reports: <ReportsPage />,
    customers: <CustomersPage />,
  };

  const changePage = (id) => {
    setPage(id);
    setMobileMenuOpen(false); // Auto-close menu on mobile
  };

  return (
    <div>
      <div className={`sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div>
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sb-brand">
          <div className="sb-brand-icon">🍓</div>
          <div className="sb-brand-name">Kodai Strawberry</div>
          <div className="sb-brand-sub">ADMIN DASHBOARD</div>
        </div>
        <nav className="sb-nav">
          {navItems.map((item, i) =>
            item.section ? (
              <div key={i} className="sb-section">{item.section}</div>
            ) : (
              <div key={item.id} className={`sb-item${page === item.id ? ' active' : ''}`} onClick={() => changePage(item.id)}>
                <span className="sb-item-icon"><Icon name={item.icon} /></span>
                <span>{item.label}</span>
                {item.badge > 0 && <span className="sb-badge">{item.badge}</span>}
              </div>
            )
          )}
        </nav>
        <div className="sb-footer">
          <div className="sb-admin">
            <div className="sb-avatar">S</div>
            <div>
              <div className="sb-admin-name">Selva</div>
              <div className="sb-admin-role">Farm Owner · Admin</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-mobile-menu" onClick={() => setMobileMenuOpen(true)}>
              <Icon name="menu" size={24} />
            </button>
            <div className="topbar-title">{pageTitles[page]}</div>
          </div>
          <div className="topbar-right">
            <span className="topbar-date" style={{ fontSize: 12, color: 'var(--muted)' }}>Day {dayNum} · {today}</span>
            {notifCount > 0 && (
              <div className="topbar-badge" style={{ background: 'var(--berry)', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                🚨 {notifCount}
              </div>
            )}
          </div>
        </div>
        <div className="page">{pages[page] || <div>Page not found</div>}</div>
      </main>
    </div>
  );
}