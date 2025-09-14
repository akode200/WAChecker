// app.js
const API_ENDPOINT = '/.netlify/functions/check-whatsapp'; // Netlify dev / production
const el = id => document.getElementById(id);

function normalizeAndSplit(raw) {
  if (!raw) return [];
  const parts = raw.split(/[\s,;]+/).map(s => s.replace(/\D/g,'')).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (let d of parts) {
    if (d.startsWith('0')) d = '62' + d.slice(1);
    if (d.startsWith('8')) d = '62' + d;
    if (!seen.has(d)) { seen.add(d); out.push(d); }
  }
  return out;
}

function renderResults(rows) {
  const wrap = el('resultsArea');
  if (!rows || rows.length === 0) {
    wrap.innerHTML = '<p class="small muted">Tidak ada hasil.</p>';
    return;
  }
  let html = `<h3>Hasil (${rows.length})</h3>
    <table><thead><tr><th>No</th><th>Nomor</th><th>Status</th></tr></thead><tbody>`;
  rows.forEach((r,i)=>{
    const cls = (r.status === 'Aktif') ? 'ok' : 'no';
    html += `<tr><td>${i+1}</td><td><code>${r.number}</code></td><td class="${cls}">${r.status}</td></tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function downloadCSV(rows) {
  const header = 'number,status\n';
  const body = rows.map(r=>`${r.number},${r.status}`).join('\n');
  const blob = new Blob([header+body], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'whatsapp_results.csv'; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

async function startCheck() {
  const raw = el('numbers').value;
  const workers = parseInt(el('workers').value, 10) || 8;
  const timeout = parseInt(el('timeout').value, 10) || 8;
  const numbers = normalizeAndSplit(raw);
  if (!numbers.length) { alert('Masukkan minimal 1 nomor valid'); return; }
  if (numbers.length > 500) { if(!confirm('Jumlah > 500. Lanjut? (Risiko beban/ban)')) return; }

  el('start').disabled = true;
  el('download').disabled = true;
  el('progressWrap').hidden = false;
  const total = numbers.length;
  updateProgress(0, total);

  // send to serverless in batches to avoid timeouts on serverless runtime.
  // We'll chunk numbers into groups of size = workers and process sequentially.
  const chunkSize = workers;
  const results = [];

  for (let i=0; i<numbers.length; i += chunkSize) {
    const chunk = numbers.slice(i, i + chunkSize);
    // call function
    try {
      const resp = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({numbers: chunk, timeout})
      });
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);
      const data = await resp.json();
      // data.results should be array of {number, status}
      data.results.forEach(r => results.push(r));
    } catch (err) {
      // mark chunk as failed
      chunk.forEach(n => results.push({number: n, status: 'Error'}));
      console.error('Chunk error', err);
    }
    updateProgress(results.length, total);
  }

  renderResults(results);
  el('download').disabled = false;
  el('start').disabled = false;
  el('progressWrap').hidden = true;
}

function updateProgress(done, total) {
  const pct = total ? Math.round( (done/total) * 100 ) : 0;
  el('progressBar').style.width = pct + '%';
  el('progressText').textContent = `${done} / ${total}`;
}

document.addEventListener('DOMContentLoaded', ()=>{
  el('start').addEventListener('click', startCheck);
  el('download').addEventListener('click', ()=> {
    const rows = (window.lastResults || []);
    if (!rows.length) {
      // try to read from table
      const tds = document.querySelectorAll('#resultsArea tbody tr');
      if (!tds.length) return alert('Tidak ada hasil untuk diunduh');
    }
    // parse table
    const rowsData = [];
    document.querySelectorAll('#resultsArea tbody tr').forEach(tr=>{
      const num = tr.children[1].textContent.trim();
      const st = tr.children[2].textContent.trim();
      rowsData.push({number: num, status: st});
    });
    downloadCSV(rowsData);
  });
});
a
