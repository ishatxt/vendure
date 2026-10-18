/* Gift sharing: turns the current garden into a link to share.html, a page
   built only for the person receiving it. The message, both names and the
   whole garden state ride inside the URL fragment, so there is no server and
   nothing is ever uploaded — anyone holding the link can read it.

   Hash shape (see shareToHash/parseShare in ./state.js):
     share.html#p=0&w=you%20are%20my%20favourite&s=7&sv=1&f=Sam&t=Alex */

import {
  SHARE_NAME_MAX, SHARE_TEXT_MAX, absURL, artText, cleanText,
  copyText, pageURL, shareToHash, stateToHash
} from './state.js';
import { Garden } from './garden.js';

var SENDER_KEY = 'typegarden.sender';

function el(id) { return document.getElementById(id); }
function val(id) { var e = el(id); return e ? e.value : ''; }
function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/* the words currently growing in the garden */
Garden.prototype.shareMessage = function () {
  return cleanText(this.mode === 'type' ? this.liveText() : (this.ptext || ''), SHARE_TEXT_MAX);
};
/* the classic permalink: opens the editor with this garden */
Garden.prototype.plainLink = function () {
  return absURL(stateToHash(this.serialize()));
};
/* the gift link: opens share.html, the recipient-only page */
Garden.prototype.giftLink = function (from, to, msg) {
  return pageURL('share.html', shareToHash(msg, from, to, this.serialize()));
};

Garden.prototype.setShareStatus = function (t, kind) {
  var s = el('shstatus');
  if (!s) return;
  s.textContent = t || '';
  s.className = 'pf' + (t && kind ? ' ' + kind : '');
};
/* any edit makes a previously created link stale, so hide it again */
Garden.prototype.invalidateShare = function () {
  this._shURL = '';
  var r = el('shresult'), l = el('shlink');
  if (r) r.hidden = true;
  if (l) l.value = '';
  this.setShareStatus('');
};
Garden.prototype.updateShareCount = function () {
  var msg = el('shmsg'), c = el('shcount'), h = el('shhint');
  if (!msg) return;
  var typed = cleanText(msg.value, 9999);
  if (c) c.textContent = Array.from(typed).length + ' / ' + SHARE_TEXT_MAX;
  /* some characters can't be drawn as a garden letter (emoji, accents …) */
  if (h) h.hidden = typed === artText(typed, 9999);
};

Garden.prototype.createShareLink = function () {
  var from = cleanText(val('shfrom'), SHARE_NAME_MAX);
  var to = cleanText(val('shto'), SHARE_NAME_MAX);
  var msg = cleanText(val('shmsg'), SHARE_TEXT_MAX);
  var url = this.giftLink(from, to, msg);
  this._shURL = url;
  var l = el('shlink'), r = el('shresult');
  if (l) l.value = url;
  if (r) r.hidden = false;
  if (from) lsSet(SENDER_KEY, from);
  this.setShareStatus(msg
    ? 'Gift link ready \u2014 copy it and send it however you like.'
    : 'Gift link ready. With no message, the garden grows their name instead.', 'ok');
  return url;
};

Garden.prototype.copyShareLink = function () {
  var self = this;
  var url = this._shURL || this.createShareLink();
  if (!url) return;
  copyText(url).then(function (ok) {
    self.setShareStatus(ok
      ? 'Link copied \u2014 paste it into any chat.'
      : 'Could not copy automatically \u2014 select the link above and copy it.', ok ? 'ok' : 'err');
  });
};

Garden.prototype.nativeShare = async function () {
  var self = this;
  var url = this._shURL || this.createShareLink();
  if (!url) return;
  var from = cleanText(val('shfrom'), SHARE_NAME_MAX);
  var to = cleanText(val('shto'), SHARE_NAME_MAX);
  try {
    await navigator.share({
      title: to ? 'A garden for ' + to : 'A little gift',
      text: from ? from + ' grew you a little garden' : 'A little garden for you',
      url: url
    });
    self.setShareStatus('Shared.', 'ok');
  } catch (e) {
    if (e && e.name === 'AbortError') { self.setShareStatus(''); return; }
    self.setShareStatus('Sharing was not available \u2014 copy the link instead.', 'err');
  }
};

Garden.prototype.copyPlainLink = function () {
  var self = this;
  copyText(this.plainLink()).then(function (ok) {
    self.setShareStatus(ok
      ? 'Plain garden link copied \u2014 it opens the editor, not the gift page.'
      : 'Could not copy automatically \u2014 use the Share button on the toolbar.', ok ? 'ok' : 'err');
  });
};

Garden.prototype.openShare = function () {
  var modal = el('shmodal');
  if (!modal) { this.shareLink(); return; }   /* no dialog in this markup: keep the old path */
  this._shLastFocus = document.activeElement || null;
  var from = el('shfrom'), to = el('shto'), msg = el('shmsg');
  if (from) from.value = cleanText(lsGet(SENDER_KEY), SHARE_NAME_MAX);
  if (to) to.value = '';
  if (msg) msg.value = this.shareMessage();
  this.invalidateShare();
  this.updateShareCount();
  var nat = el('shnative');
  if (nat) nat.hidden = !navigator.share;
  modal.hidden = false;
  var focus = from && !from.value ? from : (to && !to.value ? to : msg);
  if (focus) setTimeout(function () { try { focus.focus({ preventScroll: true }); } catch (e) {} }, 30);
};

Garden.prototype.closeShare = function () {
  var m = el('shmodal');
  if (!m || m.hidden) return;
  var target = this._shLastFocus;
  m.hidden = true;
  this._shURL = '';
  this.setShareStatus('');
  this._shLastFocus = null;
  this.refocus();   /* type mode: hand focus straight back to the garden */
  if (this.mode !== 'type' && target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
};

Garden.prototype.bindShareDialog = function () {
  var self = this, modal = el('shmodal');
  if (!modal || this._shBound) return;
  this._shBound = true;
  function on(id, fn) {
    var e = el(id);
    if (e) e.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
  }
  function field(id) {
    var e = el(id);
    if (e) e.addEventListener('input', function () { self.invalidateShare(); self.updateShareCount(); });
  }
  field('shfrom'); field('shto'); field('shmsg');
  var form = el('shform');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    self.createShareLink();
    /* hand Enter-followers straight to the Copy action */
    var c = el('shcopy');
    if (c && self._shURL) { try { c.focus(); } catch (err) {} }
  });
  on('shcopy', function () { self.copyShareLink(); });
  on('shnative', function () { self.nativeShare(); });
  on('shopen', function () {
    var url = self._shURL || self.createShareLink();
    if (url) window.open(url, '_blank', 'noopener');
  });
  on('shplainbtn', function () { self.copyPlainLink(); });
  on('shclose', function () { self.closeShare(); });
  on('shbackdrop', function () { self.closeShare(); });
  /* Escape closes whatever has focus inside the dialog, or the dialog itself */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || modal.hidden) return;
    e.stopPropagation();
    self.closeShare();
  });
};
