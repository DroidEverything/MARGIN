/* MARGIN UI scroll & accordion preservation across in-screen innerHTML repaints.
   Loaded as a classic script before game.js (file:// and ?no3d safe). */
(function () {
  "use strict";

  function sigOf(node) {
    const cls = (typeof node.className === "string") ? node.className.trim() : "";
    return node.tagName + "|" + cls;
  }

  /** Capture scroll offsets (window, root, and all scrolled descendants) plus closed accordion ids. */
  function capture(root) {
    const snap = {
      wx: (typeof window !== "undefined" && window.scrollX) || 0,
      wy: (typeof window !== "undefined" && window.scrollY) || 0,
      items: [],
      closed: []
    };
    if (!root) return snap;
    const seen = new Map();
    (function walk(n) {
      if (n.id && n.classList && n.classList.contains("accordion-item") && !n.classList.contains("open")) {
        snap.closed.push(n.id);
      }
      if (n === root) {
        if (n.scrollTop || n.scrollLeft) {
          snap.items.push({ root: true, top: n.scrollTop, left: n.scrollLeft });
        }
      } else {
        const sig = sigOf(n);
        const idx = seen.get(sig) || 0;
        seen.set(sig, idx + 1);
        if (n.scrollTop || n.scrollLeft) {
          snap.items.push({ id: n.id || "", sig, idx, top: n.scrollTop, left: n.scrollLeft });
        }
      }
      for (let c = n.firstElementChild; c; c = c.nextElementSibling) walk(c);
    })(root);
    return snap;
  }

  /** Restore accordion state and scroll offsets onto rebuilt DOM inside root. */
  function restore(root, snap) {
    if (!root || !snap) return;
    if (snap.closed && snap.closed.length) {
      for (const id of snap.closed) {
        const acc = document.getElementById(id);
        if (acc) acc.classList.remove("open");
      }
    }
    if (snap.items && snap.items.length) {
      const bySig = new Map();
      (function walk(n) {
        if (n !== root) {
          const sig = sigOf(n);
          let arr = bySig.get(sig);
          if (!arr) { arr = []; bySig.set(sig, arr); }
          arr.push(n);
        }
        for (let c = n.firstElementChild; c; c = c.nextElementSibling) walk(c);
      })(root);
      for (const it of snap.items) {
        const target = it.root
          ? root
          : (it.id ? document.getElementById(it.id) : (bySig.get(it.sig) || [])[it.idx]);
        if (target) {
          target.scrollTop = it.top;
          target.scrollLeft = it.left;
        }
      }
    }
    if (typeof window !== "undefined" && (snap.wx || snap.wy)) {
      window.scrollTo(snap.wx, snap.wy);
    }
  }

  window.UI_SCROLL = { capture, restore };
})();

