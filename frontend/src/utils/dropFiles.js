// Files dropped from the computer (not folders: folder upload is intentionally not supported).
export function filesFromDrop(dataTransfer) {
  if (!dataTransfer) return [];
  const items = Array.from(dataTransfer.items || []);
  if (items.length && typeof items[0].webkitGetAsEntry === 'function') {
    return items
      // Skip directories; an item without an entry is still a plain file.
      .filter((item) => item.kind === 'file' && !item.webkitGetAsEntry()?.isDirectory)
      .map((item) => item.getAsFile())
      .filter(Boolean);
  }
  return Array.from(dataTransfer.files || []);
}

// True while something dragged from outside the page (files) is over the element.
export const isExternalFileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

// Internal drag of a drive item (for moving files/folders by dragging).
export const ITEM_DRAG_TYPE = 'application/x-udrive-item';
export const isItemDrag = (event) => Array.from(event.dataTransfer?.types || []).includes(ITEM_DRAG_TYPE);
