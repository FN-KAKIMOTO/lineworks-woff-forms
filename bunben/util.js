'use strict';

// ===== 小物（どの画面でも使う） =====
// 画面のファイルは index.html の順に読む: util.js → parts.js → reports.js → form.js → voice.js → app.js。
// 前のファイルの関数・定数は後のファイルから使える（どのファイルもトップレベルで後のファイルの定数を使わない）

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- ボタン・選ぶ欄 ----------

/** 複数選べるボタン（分房・患肢）。見た目は segment と同じ */
function multiSegment(box, name, options, selected) {
  box.textContent = '';
  options.forEach((opt) => {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.value = opt;
    input.checked = selected.includes(opt);
    input.addEventListener('change', () => box.classList.remove('invalid'));
    const span = document.createElement('span');
    span.textContent = opt;
    wrap.append(input, span);
    box.append(wrap);
  });
}

/** 複数選べるボタンで選んでいる値（選択肢の順） */
function values(box) {
  return $$('input:checked', box).map((i) => i.value);
}

function segment(box, name, options, selected) {
  box.textContent = '';
  options.forEach((opt) => {
    const [val, label] = Array.isArray(opt) ? opt : [opt, opt];
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = val;
    input.checked = val === selected;
    input.addEventListener('change', () => box.classList.remove('invalid'));
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(input, span);
    box.append(wrap);
  });
}

function fillSelect(select, options, placeholder) {
  const current = select.value;
  select.textContent = '';
  if (placeholder !== null) select.append(new Option(placeholder, ''));
  options.forEach((o) => select.append(new Option(o, o)));
  if (options.includes(current)) select.value = current;
  select.addEventListener('change', () => select.classList.remove('invalid'));
}

function value(name, root = document) {
  const el = name ? $(`input[name="${name}"]:checked`, root) : $('input:checked', root);
  return el ? el.value : '';
}

function check(name, val) {
  const el = $(`input[name="${name}"][value="${val}"]`);
  if (el) el.checked = true;
}

// ---------- 番号・耳標 ----------

function fmtCalfId(id) {
  return `${id.slice(0, 5)}.${id.slice(5, 9)}.${id.slice(9)}`;
}

function toDigits(s) {
  return String(s).replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/\D/g, '');
}

/**
 * 個体識別番号の最後の1桁（9桁から計算する検査用の数字。GAS の checkDigit_ と同じ）。
 * 左から奇数桁の和を3倍し、偶数桁の和を足して10で割った余りを10から引く（10なら0）。例: 141756720 → 9
 */
function checkDigit(n9) {
  let odd = 0;
  let even = 0;
  String(n9).split('').forEach((d, i) => { if (i % 2 === 0) odd += Number(d); else even += Number(d); });
  return String((10 - ((odd * 3 + even) % 10)) % 10);
}

function validCowId(id) {
  return /^\d{10}$/.test(id) && checkDigit(id.slice(0, 9)) === id[9];
}

/**
 * 耳標の表記をそろえる: ひらがな→カタカナ（「ね777」→「ネ777」。Farmnote の耳標はカタカナ）、全角英数→半角、前後の空白を除く。
 * 入力中（IME の変換中）に書き換えると入力が崩れるので、欄から離れたときと送信のときだけ使う
 */
function fixTag(s) {
  return String(s || '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .trim();
}

function fixTagOnBlur(el) {
  el.addEventListener('change', () => { el.value = fixTag(el.value); });
}

/** 検索用: ひらがな→カタカナ、全角英数→半角、空白除去、小文字化 */
function normalize(s) {
  return String(s || '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .toLowerCase();
}

// ---------- 日付・そのほか ----------

function pad(n) {
  return String(n).padStart(2, '0');
}

/** 今日から n 日後（YYYY-MM-DD） */
function dayAfter(n) {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** よく使うメモの文。{日付} は今日の「10/22」 */
function phrase(text) {
  const d = new Date();
  return text.replace(/\{日付\}/g, `${d.getMonth() + 1}/${d.getDate()}`);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function readStore(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch (_) {
    return '';
  }
}

function writeStore(key, val) {
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch (_) {
    // 保存できなくても入力には影響しない（次回また聞く）
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`${src} を読み込めませんでした`));
    document.head.append(s);
  });
}
