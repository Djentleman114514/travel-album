import { createPageWindow, spreadFaces } from "../../shared/page-window.js";
import { versionedAsset } from "../../shared/asset-url.js";
import * as THREE from "three";
import { FlipBook } from "quick_flipbook";
import { books } from "./books.js";
import { setupEdition, updateEditionStatus, hasOpenDialog } from "./edition.js";
import {
  chooseDragDirection,
  dragFraction,
  edgePreviewDirection,
  edgePreviewPose,
  isActivePointer,
  isPointerOverBook,
  shouldCompleteDrag,
} from "./drag.js";
import "./style.css";

const chinese = document.documentElement.lang.startsWith("zh");
const readerText = chinese ? {
  loading: "正在准备相册",
  preparing: (title) => `正在准备《${title}》`,
  open: (title) => `打开《${title}》`,
  cover: "封面",
  backCover: "封底",
  spread: (current, total) => `${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
} : {
  loading: "Preparing edition",
  preparing: (title) => `Preparing ${title}`,
  open: (title) => `Open ${title}`,
  cover: "Cover",
  backCover: "Back cover",
  spread: (current, total) => `Spread ${current} of ${total}`,
};
const bookTitle = (book) => chinese ? book.titleZh ?? book.title : book.title;

const canvas = document.querySelector("#book-scene");
const library = document.querySelector("#library");
const previousButton = document.querySelector("#previous-page");
const nextButton = document.querySelector("#next-page");
const pageState = document.querySelector("#page-state");
const loadingCard = document.querySelector("#loading-card");
const loadingCopy = document.querySelector("#loading-copy");
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
// Keep the WebGL canvas sharp on high-density phone screens without
// rendering at the full device pixel ratio, which can be expensive on mobile.
const mobileReader = window.matchMedia("(pointer: coarse), (max-width: 760px)").matches;
const MAX_PIXEL_RATIO = mobileReader ? 1.5 : 2;
const SHADOW_MAP_SIZE = mobileReader ? 512 : 1024;
const PAGE_SUBDIVISIONS = mobileReader ? 8 : 16;
const PAGE_STACK_SPACING = 0.0012;
const MAX_TEXTURE_EDGE = 1024;
const MAX_TEXTURE_ANISOTROPY = mobileReader ? 2 : 4;


const scene = new THREE.Scene();
scene.background = new THREE.Color("#ffffff");

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
camera.position.set(0, 5, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobileReader, alpha: false });
} catch (error) {
  document.querySelector("#reader-error").hidden = false;
  document.querySelector("#retry-pages").hidden = true;
  setupEdition({ jumpTo: () => false });
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

scene.add(new THREE.HemisphereLight("#ffffff", "#e9e9e6", 0.9));

const keyLight = new THREE.DirectionalLight("#ffffff", 2.65);
keyLight.position.set(-2.8, 5.2, 2.7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 14;
keyLight.shadow.camera.left = -3;
keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3;
keyLight.shadow.camera.bottom = -3;
keyLight.shadow.bias = -0.00025;
keyLight.shadow.normalBias = 0.012;
keyLight.shadow.radius = 3;
scene.add(keyLight);

const rimLight = new THREE.PointLight("#ffffff", 0.45, 8, 2);
rimLight.position.set(2.5, 1.8, -2.4);
scene.add(rimLight);

const table = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 }),
);
table.rotation.x = -Math.PI / 2;
table.position.y = -0.035;
table.receiveShadow = true;
scene.add(table);

const bookRig = new THREE.Group();
bookRig.rotation.set(0, 0, 0);
scene.add(bookRig);

const flipBook = new FlipBook({
  flipDuration: reducedMotion ? 0.001 : 0.78,
  yBetweenPages: PAGE_STACK_SPACING,
  pageSubdivisions: PAGE_SUBDIVISIONS,
});
flipBook.traverse((object) => {
  if (object.isMesh) {
    object.castShadow = true;
    object.receiveShadow = true;
  }
});
bookRig.add(flipBook);

let selectedBook = books[0];
let loading = false;
let loadToken = 0;
let pointerStart = null;
let lastStatusKey = "";
const EDGE_PREVIEW_AMOUNT = 0.055;
const EDGE_PREVIEW_ZONE = 28;
const EDGE_PREVIEW_EPSILON = 0.0005;
const edgePreview = {
  baseSheet: null,
  direction: 0,
  amount: 0,
  target: 0,
};
const textureLoader = new THREE.TextureLoader();
let pageWindow = null;
let navigationToken = 0;
const memoizedSheets = new WeakSet();
const dirtySheets = new Set();
let animationFrame = null;
let previousFrameTime = performance.now();
let residentSpread = -1;

function makePaperMaterial(map = null) {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map,
    roughness: 0.88,
    metalness: 0,
    toneMapped: true,
  });
  material.shadowSide = THREE.DoubleSide;
  return material;
}

const blankMaterial = makePaperMaterial();

function resizeTextureImage(texture) {
  const image = texture.image;
  const width = image?.naturalWidth ?? image?.width ?? 0;
  const height = image?.naturalHeight ?? image?.height ?? 0;
  const longestEdge = Math.max(width, height);
  if (!width || !height || longestEdge <= MAX_TEXTURE_EDGE) return;

  const scale = MAX_TEXTURE_EDGE / longestEdge;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  texture.image = canvas;
}

const whiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
whiteTexture.needsUpdate = true;

async function loadPageTexture(source) {
  const assetUrl = versionedAsset(source, import.meta.env.BASE_URL);
  const texture = await textureLoader.loadAsync(assetUrl);
  resizeTextureImage(texture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(MAX_TEXTURE_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function showPageError() {
  document.querySelector("#reader-error-copy").textContent = "Some pages could not load. Check your connection and retry.";
  document.querySelector("#reader-error").hidden = false;
}

async function prepareSpread(spread, action = () => {}) {
  if (!pageWindow) return false;
  const token = ++navigationToken;
  const cache = pageWindow;
  const required = spreadFaces(spread, selectedBook.pages.length, 1);
  // Keep the old view intact while a distant Contents jump loads its destination.
  const nearby = [...spreadFaces(spread, selectedBook.pages.length, 2),
    ...spreadFaces(Math.round(flipBook.progress), selectedBook.pages.length)];
  document.querySelector("#reader-error").hidden = true;
  const ready = cache.isReady(required);
  if (!ready) setLoading(true);
  const success = await cache.focus(required, nearby);
  if (token !== navigationToken || cache !== pageWindow) return false;
  if (success) action();
  else showPageError();
  setLoading(false);
  updateStatus();
  requestRender();
  return success;
}

function jumpToSpread(spread) {
  prepareSpread(spread, () => { clearEdgePreview(true); flipBook.progress = spread; });
  return true;
}

function memoizeSheetDeformation() {
  for (const sheet of flipBook) {
    if (memoizedSheets.has(sheet)) continue;
    const flip = sheet.flip.bind(sheet);
    let previousPageProgress = Number.NaN;
    let previousDirection = Number.NaN;
    let previousCurveIntensity = Number.NaN;
    sheet.flip = (pageProgress, direction, curveIntensity = 1) => {
      if (
        pageProgress === previousPageProgress
        && direction === previousDirection
        && curveIntensity === previousCurveIntensity
      ) return;
      previousPageProgress = pageProgress;
      previousDirection = direction;
      previousCurveIntensity = curveIntensity;
      flip(pageProgress, direction, curveIntensity);
      dirtySheets.add(sheet);
    };
    memoizedSheets.add(sheet);
  }
}

function setLoading(value, copy = readerText.loading) {
  loading = value;
  loadingCard.classList.toggle("is-visible", value);
  loadingCard.hidden = !value;
  loadingCard.setAttribute("aria-hidden", String(!value));
  loadingCopy.textContent = value ? copy : "";
  previousButton.disabled = value;
  nextButton.disabled = value;
}

function renderLibrary() {
  library.innerHTML = books
    .map(
      (book) => `
        <button class="library-book ${book.id === selectedBook.id ? "is-active" : ""}"
          type="button" data-book="${book.id}" aria-label="${readerText.open(bookTitle(book))}" title="${bookTitle(book)}">
          <span aria-hidden="true">${book.mark}</span>
        </button>`,
    )
    .join("");
}

async function selectBook(book, immediate = false) {
  if (!book || (book.id === selectedBook.id && !immediate)) return;

  clearEdgePreview(true);
  selectedBook = book;
  const token = ++loadToken;
  renderLibrary();
  setLoading(true, readerText.preparing(bookTitle(book)));
  resize();

  navigationToken++;
  pageWindow?.focus([]);
  const pageMaterials = book.pages.map(() => makePaperMaterial(whiteTexture));
  pageWindow = createPageWindow({
    load: index => loadPageTexture(book.pages[index]),
    apply: (index, texture) => { pageMaterials[index].map = texture; },
    release: (index, texture) => {
      if (pageMaterials[index].map === texture) pageMaterials[index].map = whiteTexture;
      texture.dispose();
    },
    onChange: requestRender,
    onError: showPageError,
  });

  flipBook.scale.x = book.ratio;
  // Quick FlipBook stacks sheets downwards from the spine. Lift the whole
  // stack above the desk, including the first turned sheet in long editions.
  bookRig.position.y = Math.ceil(book.pages.length / 2) * PAGE_STACK_SPACING;
  flipBook.setPages(pageMaterials);
  memoizeSheetDeformation();
  flipBook.progress = 0;
  refreshAllPageNormals();
  // Quick FlipBook assigns supplied materials through an internal promise
  // chain. Drain those microtasks before making the new edition interactive.
  for (let index = 0; index < pageMaterials.length; index += 1) await Promise.resolve();
  if (token !== loadToken) return;
  flipBook.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  await prepareSpread(0);
}

function refreshAllPageNormals() {
  for (const sheet of flipBook) sheet.page.geometry.computeVertexNormals();
  dirtySheets.clear();
}

function refreshDirtyPageNormals() {
  for (const sheet of dirtySheets) sheet.page.geometry.computeVertexNormals();
  dirtySheets.clear();
}

function getBookScreenMetrics() {
  const bounds = canvas.getBoundingClientRect();
  const pixelsPerWorldUnit = bounds.width / Math.max(0.001, camera.right - camera.left);
  return {
    centerX: bounds.left + bounds.width / 2,
    centerY: bounds.top + bounds.height / 2,
    pageWidth: selectedBook.ratio * pixelsPerWorldUnit,
    pageHeight: pixelsPerWorldUnit,
  };
}

function clearEdgePreview(immediate = false) {
  if (edgePreview.baseSheet === null) return;
  edgePreview.target = 0;
  if (!immediate) {
    requestRender();
    return;
  }

  flipBook.progress = edgePreview.baseSheet;
  edgePreview.baseSheet = null;
  edgePreview.direction = 0;
  edgePreview.amount = 0;
  requestRender();
}

function updateEdgePreview(event) {
  if (reducedMotion || loading || pointerStart || event.pointerType === "touch") return;

  const previewActive = edgePreview.baseSheet !== null;
  const sheet = previewActive ? edgePreview.baseSheet : Math.round(flipBook.progress);
  if (!previewActive && Math.abs(flipBook.progress - sheet) >= 0.001) return;

  const metrics = getBookScreenMetrics();
  const maxSheet = Math.ceil(flipBook.totalPages / 2);
  const direction = edgePreviewDirection({
    sheet,
    maxSheet,
    pointerX: event.clientX,
    pointerY: event.clientY,
    edgeZone: EDGE_PREVIEW_ZONE,
    ...metrics,
  });

  if (direction === 0) {
    clearEdgePreview();
    return;
  }

  if (previewActive && edgePreview.direction !== direction) clearEdgePreview(true);
  edgePreview.baseSheet = sheet;
  edgePreview.direction = direction;
  edgePreview.target = EDGE_PREVIEW_AMOUNT;
  requestRender();
}

function animateEdgePreview(delta) {
  if (edgePreview.baseSheet === null) return false;

  const easing = edgePreview.target > edgePreview.amount ? 18 : 14;
  const blend = 1 - Math.exp(-easing * delta);
  edgePreview.amount += (edgePreview.target - edgePreview.amount) * blend;

  if (Math.abs(edgePreview.target - edgePreview.amount) < EDGE_PREVIEW_EPSILON) {
    edgePreview.amount = edgePreview.target;
  }

  if (edgePreview.target === 0 && edgePreview.amount === 0) {
    flipBook.progress = edgePreview.baseSheet;
    edgePreview.baseSheet = null;
    edgePreview.direction = 0;
    edgePreview.amount = 0;
    return false;
  }

  const maxSheet = Math.ceil(flipBook.totalPages / 2);
  const pose = edgePreviewPose(
    edgePreview.baseSheet,
    edgePreview.direction,
    edgePreview.amount,
    maxSheet,
  );
  if (!pose) {
    clearEdgePreview(true);
    return false;
  }


  // Once the lift reaches its target, keep the already-deformed geometry and
  // stop feeding the modifier stack identical poses on every animation frame.
  if (
    edgePreview.target > 0
    && edgePreview.amount === edgePreview.target
    && Math.abs(flipBook.progress - pose.progress) < EDGE_PREVIEW_EPSILON
  ) {
    if (flipBook.progress !== pose.progress) flipBook.progress = pose.progress;
    return false;
  }

  flipBook.progress = pose.progress;
  if (edgePreview.target === 0) {
    let sheetIndex = 0;
    for (const sheet of flipBook) {
      if (sheetIndex === pose.sheetIndex) {
        // The engine derives bend direction from progress velocity. During a
        // hover return that would invert the curl, so preserve the lift's bend.
        sheet.flip(pose.pageProgress, edgePreview.direction, pose.curveIntensity);
        break;
      }
      sheetIndex += 1;
    }
  }
  return edgePreview.amount !== edgePreview.target;
}

function takeEdgePreviewForDrag() {
  if (edgePreview.baseSheet === null || edgePreview.target === 0) return null;

  const preview = {
    sheet: edgePreview.baseSheet,
    direction: edgePreview.direction,
    fraction: edgePreview.amount,
  };
  // Keep flipBook.progress and the current curl exactly where the hover left
  // them; pointer movement will take ownership of that pose on the next frame.
  edgePreview.baseSheet = null;
  edgePreview.direction = 0;
  edgePreview.amount = 0;
  edgePreview.target = 0;
  return preview;
}

function nextPage() {
  if (!loading && flipBook.currentPage < flipBook.totalPages) {
    prepareSpread(Math.min(Math.ceil(flipBook.progress) + 1, flipBook.totalPages / 2), () => {
      clearEdgePreview(true); flipBook.nextPage();
    });
  }
}

function previousPage() {
  if (!loading && flipBook.currentPage > 0) {
    prepareSpread(Math.max(Math.floor(flipBook.progress) - 1, 0), () => {
      clearEdgePreview(true); flipBook.previousPage();
    });
  }
}

function updateStatus() {
  const current = edgePreview.baseSheet === null
    ? Math.round(flipBook.currentPage || 0)
    : edgePreview.baseSheet * 2;
  const total = flipBook.totalPages || selectedBook.pages.length;
  const shown = Math.min(current, total);
  const statusKey = `${loading}:${shown}:${total}`;
  if (statusKey === lastStatusKey) return;
  lastStatusKey = statusKey;
  if (shown === 0) pageState.textContent = readerText.cover;
  else if (shown >= total) pageState.textContent = readerText.backCover;
  else pageState.textContent = readerText.spread(Math.ceil(shown / 2), (total - 2) / 2);
  const spread = shown === 0 ? 0 : shown >= total ? (total / 2) : Math.ceil(shown / 2);
  canvas.dataset.spread = String(spread);
  canvas.dataset.left = selectedBook.pages[Math.max(0, shown - 1)] ?? "";
  canvas.dataset.right = selectedBook.pages[shown] ?? "";
  updateEditionStatus(spread, selectedBook);
  previousButton.disabled = loading || shown <= 0;
  nextButton.disabled = loading || shown >= total;
}

library.addEventListener("click", (event) => {
  const button = event.target.closest("[data-book]");
  if (button) selectBook(books.find((book) => book.id === button.dataset.book));
});

previousButton.addEventListener("click", previousPage);
nextButton.addEventListener("click", nextPage);

canvas.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || loading) return;

  const position = Math.round(flipBook.progress);
  const bounds = canvas.getBoundingClientRect();
  const direction = chooseDragDirection(position, flipBook.totalPages / 2, event.clientX, bounds.left + bounds.width / 2);
  const destination = Math.max(0, Math.min(position + direction, flipBook.totalPages / 2));
  if (!pageWindow?.isReady(spreadFaces(destination, selectedBook.pages.length))) {
    prepareSpread(destination);
    return;
  }
  const preview = takeEdgePreviewForDrag();
  if (!preview) clearEdgePreview(true);
  const metrics = getBookScreenMetrics();
  const sheet = preview?.sheet ?? Math.round(flipBook.progress);
  const maxSheet = Math.ceil(flipBook.totalPages / 2);
  const settled = preview !== null || Math.abs(flipBook.progress - sheet) < 0.001;
  const overBook = isPointerOverBook({
    sheet,
    maxSheet,
    pointerX: event.clientX,
    pointerY: event.clientY,
    ...metrics,
  });

  pointerStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    time: performance.now(),
    sheet,
    maxSheet,
    pageWidth: metrics.pageWidth,
    direction: preview?.direction
      ?? chooseDragDirection(sheet, maxSheet, event.clientX, metrics.centerX),
    dragReady: settled && overBook,
    dragging: false,
    startFraction: preview?.fraction ?? 0,
    fraction: preview?.fraction ?? 0,
    pendingFraction: null,
  };
  canvas.setPointerCapture?.(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const start = pointerStart;
  if (!start) {
    updateEdgePreview(event);
    return;
  }
  if (start.pointerId !== event.pointerId || !start.dragReady || loading) return;

  const deltaX = event.clientX - start.x;
  const deltaY = event.clientY - start.y;
  if (!start.dragging) {
    if (Math.abs(deltaX) < 6) return;
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
      start.dragReady = false;
      return;
    }
  }

  const fraction = dragFraction(
    deltaX,
    start.direction,
    start.pageWidth,
    start.startFraction,
  );
  if (!start.dragging && fraction === 0) return;

  start.dragging = true;
  start.fraction = fraction;
  start.pendingFraction = fraction;
  event.preventDefault();
  requestRender();
});

canvas.addEventListener("pointerup", (event) => {
  const start = pointerStart;
  if (!isActivePointer(start, event.pointerId)) return;

  pointerStart = null;
  if (canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  if (loading) return;

  if (start.dragging) {
    start.fraction = dragFraction(
      event.clientX - start.x,
      start.direction,
      start.pageWidth,
      start.startFraction,
    );
    const elapsed = performance.now() - start.time;
    const complete = shouldCompleteDrag(start.fraction, elapsed);
    const targetSheet = start.sheet + (complete ? start.direction : 0);
    flipBook.currentPage = targetSheet * 2;
    requestRender();
    return;
  }

  const deltaX = event.clientX - start.x;
  const deltaY = event.clientY - start.y;
  const elapsed = performance.now() - start.time;

  if (Math.abs(deltaX) > 36 && Math.abs(deltaX) > Math.abs(deltaY)) {
    deltaX < 0 ? nextPage() : previousPage();
  } else if (start.dragReady && elapsed < 500 && Math.abs(deltaY) < 20) {
    event.clientX < window.innerWidth / 2 ? previousPage() : nextPage();
  } else if (start.startFraction > 0) {
    flipBook.currentPage = start.sheet * 2;
    requestRender();
  }
});

canvas.addEventListener("pointercancel", (event) => {
  if (!isActivePointer(pointerStart, event.pointerId)) return;

  // This also restores a consumed hover pose when the pointer is cancelled
  // before the drag threshold is crossed.
  flipBook.currentPage = pointerStart.sheet * 2;
  pointerStart = null;
  requestRender();
});

canvas.addEventListener("pointerleave", () => {
  if (!pointerStart) clearEdgePreview();
});

window.addEventListener("keydown", (event) => {
  if (hasOpenDialog() || loading) return;
  if (event.key === "ArrowRight" || event.key === " ") {
    event.preventDefault();
    nextPage();
  }
  if (event.key === "ArrowLeft") previousPage();
  if (event.key === "Home") {
    jumpToSpread(0);
  }
  if (event.key === "End") {
    jumpToSpread(flipBook.totalPages / 2);
  }
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / Math.max(1, height);
  const spreadWidth = selectedBook.ratio * 2;
  const padding = width < 620 ? 1.16 : 1.1;
  const halfHeight = Math.max(0.62, (spreadWidth * padding) / (2 * aspect));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height, false);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  requestRender();
}

window.addEventListener("resize", resize);
resize();
renderLibrary();
setupEdition({ jumpTo: jumpToSpread });
document.querySelector("#retry-pages").addEventListener("click", () => prepareSpread(Math.round(flipBook.progress)));
selectBook(books[0], true);

function applyDragFrame() {
  const start = pointerStart;
  if (!start?.dragging) return false;
  if (start.pendingFraction === null) return true;

  flipBook.progress = start.sheet + start.direction * start.pendingFraction;
  start.pendingFraction = null;
  return true;
}

function requestRender() {
  if (animationFrame !== null) return;
  previousFrameTime = performance.now();
  animationFrame = requestAnimationFrame(animate);
}

function continueRendering() {
  if (animationFrame === null) animationFrame = requestAnimationFrame(animate);
}

function animate(timestamp) {
  animationFrame = null;
  const delta = Math.min((timestamp - previousFrameTime) / 1000, 0.04);
  previousFrameTime = timestamp;
  const previousProgress = flipBook.progress;
  const dragOwnsFrame = applyDragFrame();
  if (!dragOwnsFrame) flipBook.animate(delta);
  const previewNeedsFrame = animateEdgePreview(delta);
  refreshDirtyPageNormals();
  updateStatus();
  renderer.render(scene, camera);
  const settled = Math.round(flipBook.progress);
  if (!loading && !pointerStart && Math.abs(settled - flipBook.progress) < 0.001 && settled !== residentSpread) {
    residentSpread = settled;
    pageWindow?.focus(spreadFaces(settled, selectedBook.pages.length, 1), spreadFaces(settled, selectedBook.pages.length, 2));
  }
  const progressChanged = Math.abs(previousProgress - flipBook.progress) > 1e-7;
  if (previewNeedsFrame || (!dragOwnsFrame && progressChanged)) continueRendering();
}

requestRender();
