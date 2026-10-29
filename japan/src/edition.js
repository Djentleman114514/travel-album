import { books } from './books.js';
import { setupPhotoGallery } from './photo-gallery.js';
const book = books[0];
const backIndex = book.chapters.length + 1;
const base = import.meta.env.BASE_URL;
let currentSpread = 0;
let jumpTo = () => false;
const $ = (s) => document.querySelector(s);
export const hasOpenDialog = () => Boolean(document.querySelector('dialog[open]'));
const asset = (p) => `${base}${p.replace(/^\/+/, '')}`;
const chapter = (n) => n === 0 ? { title:'After the Lights', id:'cover' } : n === backIndex ? {title:'Back cover',id:'cover'} : book.chapters[n - 1];
function openImage({ source, label, note }) {
  $('#large-image').src = asset(source);
  $('#large-image').alt = label;
  $('#image-label').textContent = label;
  $('#image-note').textContent = note;
  $('#image-dialog').showModal();
}
function openArtwork(n = currentSpread) {
 const c=chapter(n);
 openImage({source:c.artwork || `assets/spreads/${c.id}.png`,label:n===0||n===backIndex?'Outside cover · back on left, front on right':`${String(n).padStart(2,'0')} · ${c.title}`,note:'Designed artwork · close to continue reading'});
}
export function updateEditionStatus(n) {
 currentSpread=n;const c=chapter(n);
 $('#chapter-kicker').textContent=n===0?'Japan, August 2026':n===backIndex?'Back cover':`CHAPTER ${String(n).padStart(2,'0')}`;
 $('#chapter-label').textContent=c.title;
 $('#progress-fill').style.width=`${n/backIndex*100}%`;
 for(const b of document.querySelectorAll('[data-chapter]'))b.setAttribute('aria-current',String(Number(b.dataset.chapter)===n));
}
export function setupEdition(options) {
 jumpTo=options.jumpTo;
 setupPhotoGallery($('#open-contents'), { title: 'Japan · Original photographs', base: `${base}assets/originals/` });
 $('#open-about').addEventListener('click',()=>$('#about-dialog').showModal());
 $('#open-artwork').addEventListener('click',()=>openArtwork());
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
 document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
 $('#large-image').addEventListener('error',()=>{$('#image-note').textContent='Unable to load image. Please close and try again.';});
}
