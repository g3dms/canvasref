import Konva from 'konva';
import { extractPalette } from './palette';
import { getPixels } from './imagePixels';
import { parseHexList } from './parseHex';

// DOM helper
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css = '',
  text = ''
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Stage
const stage = new Konva.Stage({
  container: 'container',
  width: window.innerWidth,
  height: window.innerHeight,
  draggable: true,
});
const layer = new Konva.Layer();
stage.add(layer);

const transformer = new Konva.Transformer();
layer.add(transformer);

window.addEventListener('resize', () => {
  stage.width(window.innerWidth);
  stage.height(window.innerHeight);
});

// Convert a screen position into a canvas position (accounts for zoom/pan)
function toCanvas(p: { x: number; y: number }) {
  return stage.getAbsoluteTransform().copy().invert().point(p);
}
function viewCenter() {
  return toCanvas({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
}

// App state
let locked = false;
let picking = false;
let flipped = false;

// small message at the top of the screen
const toastEl = el(
  'div',
  'position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:30; ' +
    'background:#000c; color:white; padding:6px 12px; border-radius:6px; ' +
    'font:12px sans-serif; opacity:0; transition:opacity .2s; pointer-events:none;'
);
document.body.appendChild(toastEl);
let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.style.opacity = '0'), 1800);
}

// Returns true (and warns) if the canvas is locked
function guardLocked() {
  if (locked) toast('Canvas is locked (press L to unlock)');
  return locked;
}

// Palette panel (shows the palette of the selected image)
const paletteCache = new WeakMap<Konva.Node, string[]>();
let currentColors: string[] = [];

const panel = el(
  'div',
  'position:fixed; top:10px; left:10px; z-index:10; display:none; background:#1e1e1e; ' +
    'padding:8px; border-radius:8px; color:white; font:12px sans-serif;'
);
const header = el('div', 'cursor:pointer; margin-bottom:6px;', '▾ Palette');
const body = el('div', 'display:flex; gap:6px;');
const pin = el('button', 'margin-top:6px;', 'Pin to canvas');
panel.append(header, body, pin);
document.body.appendChild(panel);

let open = true;
header.onclick = () => {
  open = !open;
  body.style.display = open ? 'flex' : 'none';
  pin.style.display = open ? 'inline-block' : 'none';
  header.textContent = (open ? '▾' : '▸') + ' Palette';
};

function showPalette(node: Konva.Image) {
  let colors = paletteCache.get(node);
  if (!colors) {
    colors = extractPalette(getPixels(node.image() as HTMLImageElement), 5);
    paletteCache.set(node, colors);
  }
  currentColors = colors;

  body.innerHTML = '';
  for (const hex of colors) {
    const sw = el(
      'div',
      `background:${hex}; width:70px; height:70px; border-radius:6px; color:white; ` +
        'font:11px monospace; display:flex; align-items:end; padding:4px; ' +
        'text-shadow:0 0 3px black; cursor:pointer;',
      hex
    );
    sw.onclick = () => navigator.clipboard.writeText(hex);
    body.appendChild(sw);
  }
  panel.style.display = 'block';
}

function hidePalette() {
  panel.style.display = 'none';
}

// Palette cards
function makeCard(colors: string[], x: number, y: number) {
  const size = 70;
  const group = new Konva.Group({ x, y, draggable: !locked });
  group.add(
    new Konva.Rect({
      width: size * colors.length,
      height: size + 22,
      fill: '#1e1e1e',
      cornerRadius: 6,
    })
  );
  colors.forEach((hex, i) => {
    group.add(new Konva.Rect({ x: i * size, width: size, height: size, fill: hex }));
    group.add(
      new Konva.Text({
        x: i * size + 4,
        y: size + 5,
        text: hex,
        fontSize: 11,
        fontFamily: 'monospace',
        fill: 'white',
      })
    );
  });
  layer.add(group);
  transformer.moveToTop();
  return group;
}

pin.onclick = () => {
  if (guardLocked()) return;
  const node = transformer.nodes()[0];
  if (!node || !currentColors.length) return;
  const r = node.getClientRect({ relativeTo: layer });
  makeCard(currentColors, r.x + r.width + 20, r.y);
};

function importPalette() {
  if (guardLocked()) return;
  const colors = parseHexList(prompt('Paste hex codes (e.g. #ff0000 #00ff00)') ?? '');
  if (!colors.length) return;
  const c = viewCenter();
  makeCard(colors, c.x, c.y);
}

// Image adjustments panel (monochrom/hue / saturation /brightness)
const adj = el(
  'div',
  'position:fixed; top:56px; right:10px; z-index:10; display:none; background:#1e1e1e; ' +
    'padding:8px; border-radius:8px; color:white; font:12px sans-serif; width:220px;'
);

function currentImage(): Konva.Image | null {
  const n = transformer.nodes()[0];
  return n instanceof Konva.Image ? n : null;
}

function ensureFilters(n: Konva.Image) {
  if (!n.isCached()) n.cache();
  n.filters(
    n.getAttr('mono')
      ? [Konva.Filters.Grayscale, Konva.Filters.HSV]
      : [Konva.Filters.HSV]
  );
}

function makeSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  onInput: (v: number) => void
) {
  const row = el('label', 'display:flex; justify-content:space-between; gap:8px; margin:4px 0;');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = '0';
  input.oninput = () => onInput(Number(input.value));
  row.append(el('span', '', label), input);
  return { row, input };
}

const monoBox = document.createElement('input');
monoBox.type = 'checkbox';
monoBox.onchange = () => {
  const n = currentImage();
  if (!n || guardLocked()) return;
  n.setAttr('mono', monoBox.checked);
  ensureFilters(n);
  layer.batchDraw();
};
const monoRow = el('label', 'display:flex; gap:6px; margin:4px 0;');
monoRow.append(monoBox, el('span', '', 'Monochrome'));

function adjust(apply: (n: Konva.Image, v: number) => void) {
  return (v: number) => {
    const n = currentImage();
    if (!n || guardLocked()) return;
    ensureFilters(n);
    apply(n, v);
    layer.batchDraw();
  };
}
const hueS = makeSlider('Hue', -180, 180, 1, adjust((n, v) => n.hue(v)));
const satS = makeSlider('Saturation', -1, 1, 0.05, adjust((n, v) => n.saturation(v)));
const valS = makeSlider('Brightness', -1, 1, 0.05, adjust((n, v) => n.value(v)));

const resetBtn = el('button', 'margin-top:4px;', 'Reset');
resetBtn.onclick = () => {
  const n = currentImage();
  if (!n || guardLocked()) return;
  n.hue(0);
  n.saturation(0);
  n.value(0);
  n.setAttr('mono', false);
  n.filters([]);
  n.clearCache();
  syncAdjust(n);
  layer.batchDraw();
};

adj.append(el('div', 'margin-bottom:4px;', 'Image adjust'), monoRow, hueS.row, satS.row, valS.row, resetBtn);
document.body.appendChild(adj);

function syncAdjust(n: Konva.Image) {
  monoBox.checked = !!n.getAttr('mono');
  hueS.input.value = String(n.hue());
  satS.input.value = String(n.saturation());
  valS.input.value = String(n.value());
}
function showAdjust(n: Konva.Image) {
  syncAdjust(n);
  adj.style.display = 'block';
}
function hideAdjust() {
  adj.style.display = 'none';
}

// Selection
function select(node: Konva.Node | null) {
  transformer.nodes(node ? [node] : []);
  transformer.moveToTop();
  if (node instanceof Konva.Image) {
    showPalette(node);
    showAdjust(node);
  } else {
    hidePalette();
    hideAdjust();
  }
}

stage.on('click tap', (e) => {
  if (picking) return pickColour();
  if (locked) return;
  if (e.target === stage) return select(null);
  if (e.target.getParent() === transformer) return; // clicked a handle

  // walk up to the top-level node (so clicking a card selects the whole card)
  let n: Konva.Node = e.target;
  while (n.getParent() && n.getParent() !== layer) n = n.getParent()!;
  select(n);
});

// Adding images 
function addImage(file: File, x: number, y: number) {
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 400 / img.width);
    const node = new Konva.Image({
      image: img,
      x: x + (img.width * s) / 2,
      y: y + (img.height * s) / 2,
      offsetX: img.width / 2,
      offsetY: img.height / 2,
      scaleX: s,
      scaleY: s,
      draggable: true,
    });
    layer.add(node);
    select(node);
  };
  img.src = URL.createObjectURL(file);
}

const container = stage.container();
container.addEventListener('dragover', (e) => e.preventDefault());
container.addEventListener('drop', (e) => {
  e.preventDefault();
  if (guardLocked()) return;
  stage.setPointersPositions(e);
  const pos = toCanvas(stage.getPointerPosition() ?? { x: 0, y: 0 });
  for (const file of e.dataTransfer?.files ?? []) {
    if (file.type.startsWith('image/')) addImage(file, pos.x, pos.y);
  }
});

window.addEventListener('paste', (e) => {
  if (guardLocked()) return;
  const pos = viewCenter();
  for (const file of e.clipboardData?.files ?? []) {
    if (file.type.startsWith('image/')) addImage(file, pos.x, pos.y);
  }
});

// Text annotations
function addText() {
  if (guardLocked()) return;
  const c = viewCenter();
  const t = new Konva.Text({
    x: c.x,
    y: c.y,
    text: '',
    fontSize: 24,
    fontFamily: 'sans-serif',
    fill: '#ffffff',
    draggable: true,
  });
  layer.add(t);
  editText(t);
}

// Edit in place
function editText(node: Konva.Text) {
  const box = stage.container().getBoundingClientRect();
  const abs = node.absolutePosition();
  const scale = stage.scaleX() * Math.abs(node.scaleX());
  const fontPx = node.fontSize() * scale;

  const area = el(
    'textarea',
    `position:fixed; left:${box.left + abs.x}px; top:${box.top + abs.y}px; z-index:20; ` +
      `font:${fontPx}px ${node.fontFamily()}; color:${node.fill() as string}; ` +
      'background:#000a; border:1px solid #888; outline:none; padding:0; margin:0; ' +
      `min-width:140px; min-height:${fontPx * 1.4}px; resize:none;`
  );
  area.value = node.text();

  node.hide();
  transformer.nodes([]);
  document.body.appendChild(area);
  area.focus();
  area.select();

  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    if (save) node.text(area.value);
    area.remove();
    node.show();
    if (!node.text().trim()) {
      node.destroy();
      return;
    }
    select(node);
  };
  area.addEventListener('blur', () => finish(true));
  area.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') finish(false);
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) finish(true);
  });
}

stage.on('dblclick dbltap', (e) => {
  if (locked || picking) return;
  if (e.target instanceof Konva.Text && e.target.getParent() === layer) editText(e.target);
});

// Colour picker 
const picked: string[] = [];

const tray = el(
  'div',
  'position:fixed; bottom:10px; left:50%; transform:translateX(-50%); z-index:10; display:none; ' +
    'gap:6px; align-items:center; background:#1e1e1e; padding:8px; border-radius:8px; ' +
    'color:white; font:12px sans-serif;'
);
const traySwatches = el('div', 'display:flex; gap:6px;');
const trayPin = el('button', '', 'Pin');
const trayClear = el('button', '', 'Clear');
tray.append(traySwatches, trayPin, trayClear);
document.body.appendChild(tray);

function renderTray() {
  traySwatches.innerHTML = '';
  for (const hex of picked) {
    const s = el('div', `background:${hex}; width:44px; height:44px; border-radius:6px; cursor:pointer;`);
    s.title = hex;
    s.onclick = () => {
      navigator.clipboard.writeText(hex);
      toast(`Copied ${hex}`);
    };
    traySwatches.appendChild(s);
  }
  tray.style.display = picked.length ? 'flex' : 'none';
}
trayPin.onclick = () => {
  if (guardLocked() || !picked.length) return;
  const c = viewCenter();
  makeCard([...picked], c.x, c.y);
};
trayClear.onclick = () => {
  picked.length = 0;
  renderTray();
};

function pickColour() {
  const p = stage.getPointerPosition();
  if (!p) return;

  // Render the stage as it looks on screen (without the handles), then read one pixel.
  transformer.visible(false);
  const snapshot = stage.toCanvas({ pixelRatio: 1 }) as HTMLCanvasElement;
  transformer.visible(true);

  const d = snapshot.getContext('2d')!.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
  if (d[3] < 128) return toast('Nothing to pick there');

  const hex = rgbToHex(d[0], d[1], d[2]);
  navigator.clipboard.writeText(hex);
  if (!picked.includes(hex) && picked.length < 10) picked.push(hex);
  renderTray();
  toast(`Picked ${hex} (copied)`);
}

function setPicking(v: boolean) {
  picking = v;
  pickBtn.style.background = v ? '#4a90e2' : '';
  stage.container().style.cursor = v ? 'crosshair' : '';
  if (v) {
    select(null);
    toast('Click to pick a colour (Esc to stop)');
  }
}

// Lock / unlock
function setLocked(v: boolean) {
  locked = v;
  select(null);
  // locked = nothing can be moved, but you can still pan, zoom, and pick colours
  for (const n of Array.from(layer.getChildren())) {
    if (n !== transformer) n.draggable(!locked);
  }
  lockBtn.textContent = locked ? '🔒 Locked' : '🔓 Lock';
  lockBtn.style.background = locked ? '#c0392b' : '';
}

// Export (cropped to the area covered by the photos)
function exportPhotos() {
  const imgs = Array.from(layer.find('Image'));
  if (!imgs.length) return toast('Add some photos first');

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let ratio = 1;
  for (const n of imgs) {
    const r = n.getClientRect({ relativeTo: layer });
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
    ratio = Math.max(ratio, 1 / Math.abs(n.scaleX()));
  }
  ratio = Math.min(4, ratio);

  const saved = { x: stage.x(), y: stage.y(), s: stage.scaleX() };
  const bg = new Konva.Rect({
    x: minX, y: minY, width: maxX - minX, height: maxY - minY,
    fill: '#2b2b2b', listening: false,
  });
  layer.add(bg);
  bg.moveToBottom();
  transformer.visible(false);
  stage.position({ x: 0, y: 0 });
  stage.scale({ x: 1, y: 1 });

  try {
    const url = stage.toDataURL({
      x: minX, y: minY, width: maxX - minX, height: maxY - minY, pixelRatio: ratio,
    });
    const a = el('a');
    a.href = url;
    a.download = 'reference-board.png';
    a.click();
    toast('Exported');
  } finally {
    bg.destroy();
    transformer.visible(true);
    stage.position({ x: saved.x, y: saved.y });
    stage.scale({ x: saved.s, y: saved.s });
  }
}

// Zoom (mouse wheel, toward the cursor)
stage.on('wheel', (e) => {
  e.evt.preventDefault();
  const oldScale = stage.scaleX();
  const pointer = stage.getPointerPosition()!;

  const pointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };

  const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
  const newScale = Math.max(0.1, Math.min(10, oldScale * factor));

  stage.scale({ x: newScale, y: newScale });
  stage.position({
    x: pointer.x - pointTo.x * newScale,
    y: pointer.y - pointTo.y * newScale,
  });
});

// Toolbar
const toolbar = el('div', 'position:fixed; top:10px; right:10px; z-index:10; display:flex; gap:6px;');
function addButton(label: string, onClick: () => void) {
  const b = el('button', '', label);
  b.onclick = onClick;
  toolbar.appendChild(b);
  return b;
}
addButton('Import palette', importPalette);
addButton('Text (T)', addText);
const pickBtn = addButton('Pick colour (I)', () => setPicking(!picking));
const lockBtn = addButton('🔓 Lock', () => setLocked(!locked));
addButton('Export (E)', exportPhotos);
addButton('?', () => toggleHelp());
document.body.appendChild(toolbar);

// Hotkeys window
const help = el(
  'div',
  'position:fixed; bottom:10px; left:10px; z-index:10; background:#1e1e1e; color:white; ' +
    'padding:8px 10px; border-radius:8px; font:12px sans-serif; width:240px;'
);
const helpHeader = el('div', 'display:flex; justify-content:space-between; margin-bottom:4px;');
const helpClose = el('span', 'cursor:pointer;', '✕');
helpClose.onclick = () => toggleHelp();
helpHeader.append(el('b', '', 'Hotkeys'), helpClose);
help.appendChild(helpHeader);

const keys: [string, string][] = [
  ['Drop / Ctrl+V', 'Add image'],
  ['Click', 'Select'],
  ['Delete', 'Remove selected'],
  ['F', 'Flip image'],
  ['H', 'Flip canvas (view only)'],
  ['T', 'Add text (double-click to edit)'],
  ['I', 'Colour picker (Esc to stop)'],
  ['L', 'Lock / unlock'],
  ['E', 'Export photos as PNG'],
  ['Wheel', 'Zoom'],
  ['Drag empty space', 'Pan'],
  ['?', 'Show / hide this'],
];
for (const [k, desc] of keys) {
  const row = el('div', 'display:flex; justify-content:space-between; gap:10px; margin:2px 0;');
  row.append(el('span', 'color:#aaa;', desc), el('b', 'white-space:nowrap;', k));
  help.appendChild(row);
}
document.body.appendChild(help);

function toggleHelp() {
  help.style.display = help.style.display === 'none' ? 'block' : 'none';
}

// Keyboard
window.addEventListener('keydown', (e) => {
  // don't trigger shortcuts while typing in a text box
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'text')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const k = e.key.toLowerCase();

  if (e.key === 'Escape') {
    if (picking) setPicking(false);
    return;
  }
  if (e.key === '?') return toggleHelp();

  if (k === 'l') setLocked(!locked);
  if (k === 'i') setPicking(!picking);
  if (k === 'e') exportPhotos();
  if (k === 't') addText();

  if ((e.key === 'Delete' || e.key === 'Backspace') && !locked) {
    for (const node of transformer.nodes()) node.destroy();
    transformer.nodes([]);
    hidePalette();
    hideAdjust();
  }

  if (k === 'f' && !locked) {
    for (const node of transformer.nodes()) node.scaleX(-node.scaleX());
  }

  if (k === 'h') {
    flipped = !flipped;
    stage.container().style.transform = flipped ? 'scaleX(-1)' : '';
    stage.listening(!flipped); 
    if (flipped) select(null);
  }
});