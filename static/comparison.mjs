const $ = id => document.getElementById(id);
const metrics = [['Precision', 'precision'], ['Recall', 'recall'], ['mAP@50', 'map50'], ['mAP@50–95', 'map5095']];
const colors = ['#3681ee', '#3c8d7d', '#b67539'];
let report, datasetReport, loading = false;
function distribution() {
  const container = $('class-distribution'); container.replaceChildren();
  const split = datasetReport.splits[Number($('distribution-split').value)];
  if (!split?.counts) { container.append(el('p', 'Chưa có dữ liệu', 'asset-missing')); return; }
  const max = Math.max(1, ...split.counts);
  datasetReport.classes.forEach((name, index) => {
    const row = el('div', null, 'class-bar'), track = el('div', null, 'class-bar-track'), fill = el('span', null, 'class-bar-fill');
    fill.style.width = `${split.counts[index] / max * 100}%`; track.append(fill);
    row.append(el('span', name), track, el('span', number(split.counts[index], 0), 'class-bar-value')); container.append(row);
  });
}
function renderDataset() {
  $('dataset-totals').replaceChildren(); $('dataset-splits').replaceChildren();
  for (const [label, value] of [['Tổng số ảnh',datasetReport.dataset.images],['Nhãn gán',datasetReport.dataset.instances]]) {
    const item=el('div');item.append(el('dt',label),el('dd',number(value,0)));$('dataset-totals').append(item);
  }
  for(const split of datasetReport.splits) {
    const item=el('div',null,'dataset-split'),value=el('p',number(split.images,0));value.append(el('small',` / ${number(split.instances,0)}`));item.append(el('h3',split.name),value);$('dataset-splits').append(item);
  }
  distribution();
}
const number = (value, digits = 2) => value.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function figures() {
  const filename = $('comparison-figure').value;
  $('comparison-figures').replaceChildren();
  for (const model of report.models) {
    const column = el('div');
    column.append(el('h3', model.name));
    const url = model.assets[filename];
    if (!url?.startsWith('/static/comparison/')) column.append(el('p', 'Chưa có dữ liệu', 'asset-missing'));
    else {
      const link = el('a', null, 'figure-link');
      link.href = url;
      link.setAttribute('aria-label', `Phóng to ${model.name}`);
      link.setAttribute('aria-haspopup', 'dialog');
      const image = el('img');
      image.src = url; image.alt = `${model.name} · ${$('comparison-figure').selectedOptions[0].textContent}`;
      image.loading = 'lazy';
      image.addEventListener('error', () => column.replaceChildren(el('h3', model.name), el('p', 'Không tải được biểu đồ', 'asset-missing')));
      link.append(image);
      link.addEventListener('click', event => {
        event.preventDefault();
        $('expanded-figure').src = url; $('expanded-figure').alt = image.alt;
        $('figure-name').textContent = image.alt; $('figure-dialog').showModal();
      });
      column.append(link);
    }
    $('comparison-figures').append(column);
  }
}

function historyChart() {
  const key = { map5095: 'metrics/mAP50-95(B)', map50: 'metrics/mAP50(B)', precision: 'metrics/precision(B)', recall: 'metrics/recall(B)' }[$('comparison-history').value];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 310');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${$('comparison-history').selectedOptions[0].textContent} theo epoch của từng model`);
  function draw(tag, attrs, text) {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    svg.append(node);
  }
  const histories = report.models.map(model => model.learningHistory || model.history);
  const first = Math.max(...histories.map(rows => rows[0].epoch));
  const last = Math.min(50, ...histories.map(rows => rows.at(-1).epoch));
  const x = epoch => 55 + (epoch - first) / Math.max(1, last - first) * 920;
  const y = value => 265 - value * 220;
  for (let i = 0; i <= 4; i++) {
    draw('line', { x1: 55, x2: 975, y1: y(i / 4), y2: y(i / 4), stroke: '#d6dfe7' });
    draw('text', { x: 43, y: y(i / 4) + 4, 'text-anchor': 'end', fill: '#657080', 'font-size': 12 }, `${i * 25}%`);
  }
  const ticks = [...new Set([first, ...Array.from({ length: Math.floor(last / 10) }, (_, i) => (i + 1) * 10).filter(epoch => epoch > first && epoch < last), last])];
  for (const epoch of ticks) draw('text', { x: x(epoch), y: 286, 'text-anchor': 'middle', fill: '#657080', 'font-size': 12 }, epoch);
  draw('text', { x: 510, y: 307, 'text-anchor': 'middle', fill: '#657080', 'font-size': 12 }, `Epoch · ${first}–${last}`);
  report.models.forEach((model, i) => {
    draw('line', { x1: 60 + i * 150, x2: 80 + i * 150, y1: 15, y2: 15, stroke: colors[i], 'stroke-width': 3 });
    draw('text', { x: 88 + i * 150, y: 19, fill: '#657080', 'font-size': 12 }, model.name);
    draw('polyline', { points: histories[i].filter(row => row.epoch >= first && row.epoch <= last).map(row => `${x(row.epoch)},${y(row[key])}`).join(' '), stroke: colors[i], fill: 'none', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
  });
  $('comparison-history-chart').replaceChildren(svg);
}

function render() {
  $('comparison-models').replaceChildren();
  report.models.forEach((model, i) => {
    const tile = el('article', null, 'metric-tile comparison-model');
    tile.style.setProperty('--model-color', colors[i]);
    tile.append(el('h2', model.name));
    const detail = el('div', null, 'model-details');
    detail.append(el('span', `${number(model.parameters / 1e6)} M tham số`), el('span', `${number(model.sizeMB)} MiB`), el('span', `${model.classes.length} lớp`));
    tile.append(detail); $('comparison-models').append(tile);
  });
  $('comparison-values').replaceChildren();
  const header = document.querySelector('.comparison-table thead tr');
  header.replaceChildren(el('th', 'Chỉ số'), ...report.models.map(model => el('th', model.name)));
  $('comparison-bars').replaceChildren();
  for (const [label, key] of metrics) {
    const row = el('tr');
    const heading = el('th', label); heading.scope = 'row';
    row.append(heading, ...report.models.map(model => el('td', `${number(model.metrics[key] * 100)}%`)));
    $('comparison-values').append(row);
    const group = el('div', null, 'comparison-bar-group'); group.append(el('h3', label));
    report.models.forEach((model, i) => {
      const line = el('div', null, 'comparison-bar-line');
      const track = el('div', null, 'class-bar-track'); const fill = el('span', null, 'class-bar-fill');
      fill.style.width = `${model.metrics[key] * 100}%`; fill.style.background = colors[i]; track.append(fill);
      line.append(el('span', model.name), track, el('span', `${number(model.metrics[key] * 100)}%`)); group.append(line);
    });
    $('comparison-bars').append(group);
  }
  figures(); historyChart();
  if (datasetReport) renderDataset();
  $('comparison-content').hidden = false;
}

export async function loadComparison() {
  if (report || loading) return;
  loading = true;
  const status = $('comparison-status'); status.hidden = false; status.textContent = 'Đang tải…';
  try {
    const response = await fetch('/static/comparison/report.json', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Unavailable');
    const data = await response.json();
    if (data.models?.length !== 3 || data.models.some(m => !m.history?.length || metrics.some(([, key]) => !Number.isFinite(m.metrics?.[key])))) throw Error('Invalid');
    report = data;
    try {
      const datasetResponse = await fetch('/static/evaluation/report.json', { signal: AbortSignal.timeout(10000) });
      if (!datasetResponse.ok) throw Error('Dataset unavailable');
      datasetReport = await datasetResponse.json();
    } catch { datasetReport = null; $('dataset-totals').replaceChildren(el('p','Không tải được thống kê dữ liệu','asset-missing')); }
    render(); status.hidden = true;
  } catch {
    report = null; $('comparison-content').hidden = true;
    const retry = el('a', 'Thử lại'); retry.href = '#comparison';
    retry.addEventListener('click', event => { event.preventDefault(); loadComparison(); });
    status.replaceChildren(document.createTextNode('Không tải được dữ liệu. '), retry);
  } finally { loading = false; }
}
$('comparison-figure').addEventListener('change', figures);
$('comparison-history').addEventListener('change', historyChart);
$('distribution-split').addEventListener('change', () => { if(datasetReport) distribution(); });
