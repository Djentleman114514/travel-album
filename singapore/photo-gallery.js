export function setupPhotoGallery(button, { title, base = "assets/originals/" }) {
  const dialog = document.createElement("dialog");
  dialog.className = "photo-gallery";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<div class="photo-gallery__header"><div><small>CONTENTS / ORIGINAL PHOTOGRAPHS</small><h2></h2></div><button class="photo-gallery__close" type="button" aria-label="Close contents">×</button></div><p class="photo-gallery__status" role="status"></p><div class="photo-gallery__grid"></div>`;
  dialog.querySelector("h2").textContent = title;
  document.body.append(dialog);
  const viewer = document.createElement("dialog");
  viewer.className = "photo-viewer";
  viewer.setAttribute("aria-label", "Original photograph");
  viewer.innerHTML = `<div class="photo-viewer__bar"><span></span><button class="photo-gallery__close" type="button" aria-label="Close photograph">×</button></div><img alt=""><p role="status"></p>`;
  document.body.append(viewer);
  dialog.querySelector(".photo-gallery__close").addEventListener("click", () => dialog.close());
  viewer.querySelector(".photo-gallery__close").addEventListener("click", () => viewer.close());
  const large = viewer.querySelector("img");
  const note = viewer.querySelector("p");
  viewer.addEventListener("close", () => { large.removeAttribute("src"); note.textContent = ""; });
  large.addEventListener("error", () => { note.textContent = "Unable to load this photograph."; });
  let loaded = false;
  let loading = false;
  button.addEventListener("click", async () => {
    dialog.showModal();
    if (loaded || loading) return;
    loading = true;
    const status = dialog.querySelector(".photo-gallery__status");
    status.textContent = "Loading photographs…";
    try {
      const response = await fetch(`${base}manifest.json`);
      if (!response.ok) throw new Error("Manifest unavailable");
      const photos = await response.json();
      const fragment = document.createDocumentFragment();
      photos.forEach((photo, index) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "photo-gallery__card";
        card.setAttribute("aria-label", `View photograph ${index + 1}: ${photo.name}`);
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = "";
        img.src = `${base}thumbs/${photo.id}.jpg`;
        const label = document.createElement("span");
        label.textContent = String(index + 1).padStart(2, "0");
        card.append(img, label);
        card.addEventListener("click", () => {
          viewer.querySelector("span").textContent = `${String(index + 1).padStart(2, "0")} / ${photos.length} · ${photo.name}`;
          large.alt = photo.name;
          large.src = `${base}photos/${photo.id}.jpg`;
          viewer.showModal();
        });
        fragment.append(card);
      });
      dialog.querySelector(".photo-gallery__grid").append(fragment);
      status.textContent = `${photos.length} photographs`;
      loaded = true;
    } catch {
      status.textContent = "Unable to load photographs. Close and reopen to try again.";
    } finally {
      loading = false;
    }
  });
}
