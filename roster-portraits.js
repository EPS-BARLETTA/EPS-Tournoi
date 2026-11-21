/* global Tesseract */
'use strict';

// Adapted from Mon Carnet de bord EPS: same grid detector and review interface.
const rosterOCRFiles = {
  script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
  core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-lstm.wasm.js',
  language: 'https://tessdata.projectnaptha.com/4.0.0',
};
let ocrScript;

function loadRosterOCR() {
  if (!ocrScript) {
    ocrScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = rosterOCRFiles.script;
      script.referrerPolicy = 'no-referrer';
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        reject(new Error('Le moteur de lecture est indisponible. Vérifie ta connexion et réessaie.'));
      };
      document.head.append(script);
    }).catch(error => {
      ocrScript = null;
      throw error;
    });
  }
  return ocrScript;
}

function rosterCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Choisis une capture d’écran au format JPG ou PNG.'));
    };
    img.src = url;
  });
}

function denseBands(values, threshold, minimum, gap = 2) {
  const bands = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i <= values.length + gap; i++) {
    if (values[i] >= threshold) {
      if (start === -1) start = i;
      last = i;
    } else if (start !== -1 && i - last > gap) {
      if (last + 1 - start >= minimum) bands.push([start, last + 1]);
      start = -1;
    }
  }
  return bands;
}

function rosterTiles(image, {x, y, width: cropWidth, height: cropHeight}) {
  const scale = Math.min(1, 1800 / Math.max(cropWidth, cropHeight));
  const source = rosterCanvas(Math.round(cropWidth * scale), Math.round(cropHeight * scale));
  const {width, height} = source;
  const ctx = source.getContext('2d', {willReadFrequently: true});
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, x, y, cropWidth, cropHeight, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const dark = new Uint8Array(width * height);
  const rows = new Uint16Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = y * width + x;
      const i = point * 4;
      if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 200) {
        dark[point] = 1;
        rows[y]++;
      }
    }
    if (rows[y] > 0.94 * width) rows[y] = 0;
  }
  const portraitRows = denseBands(rows, width * 0.085, Math.max(32, height * 0.045));
  const grid = portraitRows.map(([top, bottom]) => {
    const rowHeight = bottom - top;
    const cols = new Uint16Array(width);
    for (let y = top; y < bottom; y++) {
      for (let x = 0; x < width; x++) cols[x] += dark[y * width + x];
    }
    const portraits = denseBands(cols, rowHeight * 0.32, Math.max(12, rowHeight * 0.34))
      .filter(([left, right]) => {
        const ratio = (right - left) / rowHeight;
        return ratio >= 0.34 && ratio <= 1.37;
      });
    return {top, bottom, portraits};
  }).filter(row => row.portraits.length);
  const layout = grid.reduce((best, row) => row.portraits.length > best.length ? row.portraits : best, []);
  if (!layout.length || grid.reduce((n, row) => n + row.portraits.length, 0) > 80) {
    throw new Error('La grille n’a pas été reconnue. Utilise une capture complète avec les photos et les noms en dessous.');
  }
  const columnFor = ([left, right]) => layout.findIndex(([start, end]) => {
    // Une photo claire peut perdre quelques pixels sur un côté à la détection.
    const columnWidth = end - start;
    const overlap = Math.min(end, right) - Math.max(start, left);
    const centerOffset = Math.abs((start + end - left - right) / 2);
    return overlap >= columnWidth * 0.55 && centerOffset <= Math.max(8, columnWidth * 0.28);
  });
  const gaps = layout.slice(1).map(([left], index) => left - layout[index][0]).sort((a, b) => a - b);
  const typicalGap = gaps[Math.floor(gaps.length / 2)];
  const tiles = [];
  for (const [i, row] of grid.entries()) {
    const portraitHeight = row.bottom - row.top;
    const columns = row.portraits.map(columnFor);
    for (const [index, [left, right]] of row.portraits.entries()) {
      const col = columns[index];
      const aligned = col >= 0 && columns.indexOf(col) === columns.lastIndexOf(col);
      const portraitWidth = right - left;
      const textLeft = Math.max(0, (aligned ? Math.min(left, layout[col][0]) : left) - 3);
      const nextInRow = row.portraits[index + 1]?.[0] ?? width;
      const nextInGrid = aligned ? layout[col + 1]?.[0] ?? width : left + (typicalGap || portraitWidth * 1.5);
      const textRight = Math.max(right, Math.min(width, nextInRow, nextInGrid) - 4);
      const textBottom = Math.min(height, grid[i + 1]?.top ?? height, row.bottom + Math.round(portraitHeight * 0.275));
      const photo = rosterCanvas(84, Math.round(84 * portraitHeight / portraitWidth));
      photo.getContext('2d').drawImage(source, left, row.top, portraitWidth, portraitHeight, 0, 0, photo.width, photo.height);
      const tile = {photo: photo.toDataURL('image/jpeg', 0.72), label: null, manual: !aligned};
      tiles.push(tile);
      if (textBottom - row.bottom < 10) continue;
      const label = rosterCanvas((textRight - textLeft) * 2 + 20, (textBottom - row.bottom) * 2 + 16);
      const labelCtx = label.getContext('2d');
      labelCtx.fillStyle = '#fff';
      labelCtx.fillRect(0, 0, label.width, label.height);
      labelCtx.drawImage(source, textLeft, row.bottom, textRight - textLeft, textBottom - row.bottom, 10, 8,
        label.width - 20, label.height - 16);
      tile.label = label;
    }
  }
  return tiles;
}

async function readRosterTiles(tiles, onProgress) {
  await loadRosterOCR();
  let worker;
  let timer;
  let timerExpired = false;
  try {
    const started = Tesseract.createWorker('fra', 1, {
      workerPath: new URL(rosterOCRFiles.worker, location.href).href,
      corePath: new URL(rosterOCRFiles.core, location.href).href,
      langPath: new URL(rosterOCRFiles.language, location.href).href,
      workerBlobURL: true,
      errorHandler: () => {},
    }, {load_system_dawg: '0', load_freq_dawg: '0'});
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timerExpired = true;
        reject(new Error('Le moteur de lecture met trop de temps à démarrer.'));
      }, 25000);
    });
    started.then(late => {
      if (timerExpired) return late.terminate();
    }).catch(() => {});
    worker = await Promise.race([started, timeout]);
    clearTimeout(timer);
    await worker.setParameters({tessedit_pageseg_mode: '6'});
    for (const [i, tile] of tiles.entries()) {
      onProgress(i + 1);
      if (!tile.label) continue;
      const {data} = await worker.recognize(tile.label);
      const lines = data.text.trim().split(/\n/).map(line => line.trim()).filter(Boolean);
      if (lines.length === 2 && /\s/.test(lines[0]) && /^\p{L}$/u.test(lines[1])) lines.pop();
      tile.name = lines.join(' ').replace(/\s+/g, ' ');
      delete tile.label;
    }
  } finally {
    clearTimeout(timer);
    if (worker) await worker.terminate();
  }
}

function portraitNameKey(name) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
    .replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ');
}

function suggestPortraitStudent(students, name) {
  const key = portraitNameKey(name || '');
  if (!key) return '';
  const exact = students.filter(p => portraitNameKey(p.name) === key);
  if (exact.length) return exact.length === 1 ? exact[0].id : '';
  const parts = key.split(' ');
  const alternatives = new Set(parts.slice(1).map((_, i) => [...parts.slice(i + 1), ...parts.slice(0, i + 1)].join(' ')));
  const swapped = students.filter(p => alternatives.has(portraitNameKey(p.name)));
  return swapped.length === 1 ? swapped[0].id : '';
}

function validRosterPortrait(value) {
  return typeof value === 'string' && value.length <= 30000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

(() => {
  function paragraph(text, className) {
    const el = document.createElement('p');
    el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function photo(portrait) {
    const el = document.createElement(validRosterPortrait(portrait) ? 'img' : 'span');
    el.className = 'pf-roster-photo';
    if (el.tagName === 'IMG') {
      el.src = portrait;
      el.alt = '';
    } else {
      el.setAttribute('aria-hidden', 'true');
      el.textContent = '—';
    }
    return el;
  }

  function button(text, variant = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'btn ' + variant;
    element.textContent = text;
    return element;
  }

  function dialog(title) {
    const element = document.createElement('dialog');
    element.className = 'pf-roster-dialog';
    element.setAttribute('aria-label', title);
    const heading = document.createElement('h3');
    heading.textContent = title;
    element.append(heading);
    document.body.append(element);
    element.addEventListener('close', () => element.remove(), {once: true});
    return element;
  }

  function rosterCrop(image, retry) {
    const panel = document.createElement('div');
    panel.className = 'pf-roster-crop';
    panel.append(paragraph('Garde toutes les photos et les noms dans le cadre. Retire les menus et les bordures si nécessaire.'));
    const scale = Math.min(1, 480 / Math.max(image.width, image.height));
    const preview = rosterCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    preview.setAttribute('aria-hidden', 'true');
    panel.append(preview);
    const margins = ['Haut', 'Droite', 'Bas', 'Gauche'].map(side => {
      const label = document.createElement('label');
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '70';
      slider.value = '0';
      label.append(side, slider);
      panel.append(label);
      return slider;
    });
    const analyze = button('Analyser la zone cadrée', 'primary');
    panel.append(analyze);
    function bounds(width, height) {
      const [top, right, bottom, left] = margins.map(slider => Number(slider.value) / 100);
      return {x: width * left, y: height * top, width: width * (1 - left - right), height: height * (1 - top - bottom)};
    }
    function paint() {
      const {width, height} = preview;
      const crop = bounds(width, height);
      const ctx = preview.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      ctx.fillStyle = '#10212bb5';
      ctx.fillRect(0, 0, width, height);
      analyze.disabled = crop.width < width * 0.15 || crop.height < height * 0.15;
      if (analyze.disabled) return;
      const {x, y} = crop;
      ctx.drawImage(image, x / width * image.width, y / height * image.height,
        crop.width / width * image.width, crop.height / height * image.height, x, y, crop.width, crop.height);
      ctx.strokeStyle = '#23845f';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, crop.width - 2, crop.height - 2);
    }
    for (const slider of margins) slider.oninput = paint;
    analyze.onclick = () => retry(bounds(image.width, image.height));
    paint();
    return panel;
  }

  function importRoster({file, items, itemName, save, className}) {
    const existing = items.length > 0;
    const candidates = items.map((item, index) => ({id: String(index), ...itemName(item.line)}));
    const modal = dialog(className ? `Créer la classe ${className}` : 'Importer un trombinoscope');
    const progress = paragraph('Recherche des portraits…', 'help');
    progress.setAttribute('role', 'status');
    const list = document.createElement('div');
    list.className = 'pf-roster-list';
    const footer = document.createElement('div');
    footer.className = 'pf-roster-actions';
    const close = button('Fermer');
    close.onclick = () => modal.close();
    const commitLabel = className ? 'Créer la classe' : existing ? 'Enregistrer les élèves et les portraits' : 'Enregistrer la liste';
    const commit = button(commitLabel, 'ink');
    commit.disabled = true;
    footer.append(close, commit);
    modal.append(progress, list, footer);
    modal.showModal();

    async function analyze(image, crop, cropPanel) {
      if (cropPanel) cropPanel.hidden = true;
      progress.textContent = 'Recherche des portraits…';
      let tiles;
      try {
        tiles = rosterTiles(image, crop);
        if (!tiles.length) throw new Error('Aucun portrait trouvé dans cette zone.');
      } catch (error) {
        if (!modal.open) return;
        progress.textContent = error.message || 'Impossible de lire cette zone.';
        if (!cropPanel) {
          cropPanel = rosterCrop(image, region => analyze(image, region, cropPanel));
          modal.insertBefore(cropPanel, list);
        }
        cropPanel.hidden = false;
        return;
      }
      let readIssue = false;
      try {
        await readRosterTiles(tiles, n => {
          progress.textContent = `Lecture des noms ${n} / ${tiles.length}…`;
        });
      } catch {
        readIssue = true;
      }
      if (!modal.open) return;
      const rows = tiles.map((tile, index) => {
        const row = document.createElement('div');
        row.className = 'pf-roster-import-row';
        row.append(photo(tile.photo));
        const label = document.createElement('label');
        label.textContent = existing ? tile.name || 'Nom illisible' : 'Nom et prénom ' + (index + 1);
        const field = document.createElement(existing ? 'select' : 'input');
        let newName;
        if (existing) {
          const match = tile.manual ? '' : suggestPortraitStudent(candidates, tile.name);
          field.append(new Option('À associer', ''), new Option('Ignorer ce portrait', '-'),
            new Option('Ajouter comme nouvel élève', 'new'));
          candidates.forEach(p => field.append(new Option(p.name + (p.bib ? ' · n° ' + p.bib : ''), p.id)));
          field.value = match;
          newName = document.createElement('input');
          newName.value = tile.name || '';
          newName.maxLength = 120;
          newName.autocomplete = 'off';
          newName.placeholder = 'Nom et prénom';
          newName.setAttribute('aria-label', 'Nom du nouvel élève ' + (index + 1));
          newName.hidden = true;
        } else {
          field.value = tile.name || '';
          field.maxLength = 120;
          field.autocomplete = 'off';
          field.placeholder = 'Laisse vide pour ignorer';
        }
        label.append(field);
        if (newName) label.append(newName);
        row.append(label);
        list.append(row);
        return {tile, field, row, newName};
      });

      let savedCount = 0;
      const applied = new Set();
      let currentItems = items;

      function selectionKey({field, newName}) {
        if (existing && field.value !== 'new') return field.value;
        const name = portraitNameKey(newName ? newName.value : field.value);
        return name ? 'name:' + name : '';
      }

      function selections() {
        const selected = rows.filter(x => x.row.isConnected && x.field.value.trim() && x.field.value !== '-');
        if (!existing) return selected.filter(selectionKey);
        const counts = new Map();
        const registeredNames = new Set(currentItems.map(item => portraitNameKey(item.line)));
        for (const selection of selected) {
          const value = selectionKey(selection);
          counts.set(value, (counts.get(value) || 0) + 1);
        }
        return selected.filter(selection => {
          const value = selectionKey(selection);
          return value && counts.get(value) === 1 && !applied.has(value) &&
            !(selection.newName && selection.field.value === 'new' && registeredNames.has(portraitNameKey(selection.newName.value)));
        });
      }

      function update() {
        const ready = selections();
        const keep = new Set(ready);
        const names = new Set(ready.map(selectionKey));
        let pending = 0;
        for (const entry of rows) {
          if (!entry.row.isConnected) continue;
          if (entry.newName) entry.newName.hidden = entry.field.value !== 'new';
          const check = entry.field.value !== '-' && !keep.has(entry);
          entry.row.classList.toggle('pf-roster-missing', check);
          if (check) pending++;
        }
        const parts = [];
        if (!savedCount) parts.push(`${tiles.length} portrait(s) détecté(s)`);
        if (readIssue) parts.push('Lecture automatique incomplète');
        if (savedCount) parts.push(`${savedCount} enregistré(s)`);
        if (ready.length) parts.push(`${ready.length} prêt(s) à enregistrer`);
        if (pending) parts.push(existing ? `${pending} à vérifier` : `${pending} sans nom`);
        if (!existing && names.size < ready.length) parts.push('Vérifie les noms répétés');
        progress.textContent = parts.join(' · ') || 'Aucun portrait à enregistrer.';
        commit.disabled = !ready.length;
      }
      list.addEventListener('input', update);
      if (existing) list.addEventListener('change', update);
      commit.onclick = () => {
        const ready = selections();
        if (!ready.length) return;
        if (!existing) {
          const warnings = [];
          if (new Set(ready.map(selectionKey)).size < ready.length) {
            warnings.push('Plusieurs portraits portent le même nom. Ils seront enregistrés comme des élèves distincts.');
          }
          const unnamed = rows.length - ready.length;
          if (unnamed) warnings.push(`Portraits ignorés faute de nom · ${unnamed}.`);
          if (warnings.length && !confirm(`${warnings.join('\n')}\n\nEnregistrer les ${ready.length} élèves renseignés ?`)) return;
        }
        const next = existing ? currentItems.map(item => ({...item})) : [];
        for (const {field, newName, tile} of ready) {
          if (existing && field.value !== 'new') next[Number(field.value)].portrait = tile.photo;
          else next.push({line: (newName || field).value.trim().replace(/\s+/g, ' '), g: 0, portrait: tile.photo});
        }
        let saveError = '';
        if (!save(next, message => { saveError = message; })) {
          progress.textContent = saveError || 'Impossible d’enregistrer les portraits sur cet appareil.';
          return;
        }
        currentItems = next;
        savedCount += ready.length;
        if (!existing) { modal.close(); return; }
        for (const entry of ready) {
          applied.add(selectionKey(entry));
          entry.row.remove();
        }
        for (const {field, row} of rows) if (field.value === '-') row.remove();
        if (!rows.some(x => x.row.isConnected)) modal.close();
        else update();
      };
      update();
    }

    (async () => {
      if (file.size > 20 * 1024 * 1024) throw new Error('La capture dépasse 20 Mo.');
      const image = await imageFromFile(file);
      if (modal.open) await analyze(image, {x: 0, y: 0, width: image.width, height: image.height});
    })().catch(error => {
      if (modal.open) progress.textContent = error.message || 'Impossible de lire la capture.';
    });
  }

  window.RosterPortraits = {photo, importRoster};
})();
