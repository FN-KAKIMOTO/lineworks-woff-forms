'use strict';

// ===== デプロイ後に書き換える =====
const CONFIG = {
  woffId: '', // Developer Console で発行された WOFF ID
  gasUrl: 'https://script.google.com/macros/s/AKfycbxeEl4u7byBq21WFH3mvap8JZ-HnzlqYByUhncD_jDPivvF98okpf0PI487SNvMh7Rcow/exec',
};

const MOCK = new URLSearchParams(location.search).has('mock');
const TIME_KINDS = [['found', '生まれていた（子牛発見時刻）'], ['birth', '分娩に立ち会った（分娩時刻）']];
const STORE_KEY = 'bunben-form';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  profile: null,
  token: '',
  user: null,
  farms: [],
  choices: null,
  dairyBreeds: [],
  canPost: false,
  view: 'form',
  report: null,
  pendingId: '',
  sending: false,
};

window.addEventListener('load', () => {
  start().catch((e) => showFatal(e.message || String(e)));
});

async function start() {
  if (MOCK) await loadScript('mock.js');
  if (!CONFIG.woffId && !MOCK) throw new Error('app.js の CONFIG.woffId が未設定です');
  await woff.init({ woffId: CONFIG.woffId });
  if (!woff.isLoggedIn()) {
    woff.login();
    return;
  }
  state.profile = await woff.getProfile();
  state.token = woff.getAccessToken();
  state.canPost = await canPostToTalk();
  const res = await api('config');
  state.user = res.user;
  state.farms = res.farms;
  state.choices = res.choices;
  state.dairyBreeds = res.dairyBreeds;
  if (!state.farms.length) throw new Error('設定シート「牧場」に牧場がありません');
  setupForm();
  $('#loading').hidden = true;
  $('#footer').hidden = false;
  showView('form');
}

/** スマホアプリのトークルームから開いたときだけ本人名義で投稿できる */
async function canPostToTalk() {
  const os = woff.getOS();
  if (os !== 'ios' && os !== 'android') return false;
  try {
    return Boolean(await woff.getChannelId());
  } catch (_) {
    return false;
  }
}

async function api(action, extra = {}) {
  let res;
  try {
    // Content-Type を付けない（text/plain）ことで、Apps Script へのプリフライトを避ける
    res = await fetch(CONFIG.gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action, token: state.token, userId: state.profile.userId, ...extra }),
    });
  } catch (_) {
    throw new Error('通信できませんでした。電波の良いところでもう一度送信してください');
  }
  if (!res.ok) throw new Error(`通信エラー（${res.status}）`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'エラーが発生しました');
  return data;
}

// ---------- フォーム ----------

function setupForm() {
  const name = (state.user && state.user.name) || state.profile.displayName;
  $('#who').textContent = `${name} さん｜${state.canPost ? '送信するとトークにも投稿されます' : 'この画面からはトークに投稿されません（シートには保存されます）'}`;

  const saved = loadSaved();
  fillSelect($('#farm'), state.farms.map((f) => f.name), state.farms.length > 1 ? '選択してください' : null);
  if (state.farms.some((f) => f.name === saved.farm)) $('#farm').value = saved.farm;
  $('#farm').addEventListener('change', () => applyFarm());
  $('#farmCard').hidden = state.farms.length === 1;

  $('#date').value = today();
  $('#date').max = today();
  segment($('#kind'), 'kind', state.choices.kind, '出産');
  segment($('#difficulty'), 'difficulty', state.choices.difficulty, '自然分娩');
  // 時刻そのものは送信した時刻（GAS 側で入れる）。ここではどちらの列に入れるかだけ選ぶ
  segment($('#timeKind'), 'timeKind', TIME_KINDS, 'found');
  $$('input[name="kind"]').forEach((el) => el.addEventListener('change', applyKind));

  $('#damTag').addEventListener('input', showDamHits);
  $('#damId').addEventListener('input', onDamId);

  $('#addCalf').addEventListener('click', () => addCalf());
  $('#next').addEventListener('click', onNext);
  $('#back').addEventListener('click', onBack);

  // 内容が変わったら受付IDを作り直す（同じ受付IDは「送信済み」とみなされるため）
  $('#form').addEventListener('input', () => { state.pendingId = ''; });
  $('#form').addEventListener('change', () => { state.pendingId = ''; });

  addCalf();
  applyFarm();
  applyKind();
}

function currentFarm() {
  return state.farms.find((f) => f.name === $('#farm').value) || null;
}

function applyFarm() {
  const farm = currentFarm();
  const saved = loadSaved();
  const workers = farm ? farm.workers.map((w) => w.name) : [];
  fillSelect($('#worker'), workers, '選択してください');
  if (farm) {
    const me = normalize((state.user && state.user.name) || state.profile.displayName);
    const mine = farm.workers.find((w) => normalize(w.lwName || w.name) === me);
    const last = saved.workers && saved.workers[farm.name];
    if (mine) $('#worker').value = mine.name;
    else if (workers.includes(last)) $('#worker').value = last;
  }
  $$('#calves .calf').forEach(renderPrefixes);
  showDamHits();
}

/** 出産のときは子牛の番号・体重・時刻・分娩難易まで必須。死産・流産はわかる範囲で */
function applyKind() {
  const birth = value('kind') === '出産';
  $('#difficultyLabel').classList.toggle('req', birth);
  $$('#calves .calf').forEach((node) => {
    $('.note', node).hidden = birth;
    $$('.c-req', node).forEach((el) => el.classList.toggle('req', birth));
    $$('.c-only-birth', node).forEach((el) => {
      el.hidden = !birth;
      const box = $('input', el);
      if (!birth && box.checked) {
        box.checked = false;
        box.dispatchEvent(new Event('change'));
      }
    });
  });
}

// ---------- 母牛 ----------

function showDamHits() {
  const box = $('#damHits');
  box.textContent = '';
  const farm = currentFarm();
  const q = normalize($('#damTag').value);
  if (!farm || q.length < 2) return;
  const hits = farm.dams.filter((d) => normalize(d.tag).includes(q) || d.id.includes(q)).slice(0, 8);
  if (hits.length === 1 && normalize(hits[0].tag) === q) {
    if (!$('#damId').value) $('#damId').value = hits[0].id;
    return;
  }
  hits.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = d.id ? `${d.tag}（${d.id.slice(5, 9)}）` : d.tag;
    b.addEventListener('click', () => {
      $('#damTag').value = d.tag;
      $('#damId').value = d.id;
      box.textContent = '';
      $('#damTag').classList.remove('invalid');
      $('#damId').classList.remove('invalid');
      state.pendingId = '';
    });
    box.append(b);
  });
}

function onDamId() {
  const el = $('#damId');
  el.value = toDigits(el.value).slice(0, 10);
  const farm = currentFarm();
  if (farm && el.value.length === 10 && !$('#damTag').value) {
    const d = farm.dams.find((x) => x.id === el.value);
    if (d) $('#damTag').value = d.tag;
  }
}

// ---------- 子牛 ----------

function addCalf() {
  const list = $('#calves');
  if (list.children.length >= 3) return;
  const node = $('#calfTpl').content.firstElementChild.cloneNode(true);
  const key = `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  segment($('.c-sex', node), `${key}-sex`, state.choices.sex, '');
  segment($('.c-type', node), `${key}-type`, state.choices.type, '');
  fillSelect($('.c-breed', node), state.choices.breed, '選択してください');
  fillSelect($('.c-color', node), state.choices.color, '未選択');

  const idEl = $('.c-id', node);
  const tagEl = $('.c-tag', node);
  idEl.addEventListener('input', () => {
    idEl.value = toDigits(idEl.value).slice(0, 10);
    autoTag(node);
  });
  tagEl.addEventListener('input', () => { node.dataset.tagManual = tagEl.value ? '1' : ''; });
  // 「耳標をまだ付けていない」「測れなかった」にチェックしたら、その欄は空にして入力できなくする
  [['.c-noid', '.c-id'], ['.c-noweight', '.c-weight']].forEach(([boxSel, inputSel]) => {
    const box = $(boxSel, node);
    const input = $(inputSel, node);
    box.addEventListener('change', () => {
      input.disabled = box.checked;
      if (box.checked) {
        input.value = '';
        input.classList.remove('invalid');
      }
      if (inputSel === '.c-id') {
        $('.c-prefixes', node).hidden = box.checked;
        autoTag(node);
      }
    });
  });
  $('.c-breed', node).addEventListener('change', () => autoType(node));
  $$('.c-sex input', node).forEach((el) => el.addEventListener('change', () => autoType(node)));
  $$('.c-type input', node).forEach((el) => el.addEventListener('change', () => { node.dataset.typeManual = '1'; }));
  $('.remove', node).addEventListener('click', () => {
    node.remove();
    renumberCalves();
    state.pendingId = '';
  });

  list.append(node);
  renderPrefixes(node);
  renumberCalves();
  applyKind();
}

function renumberCalves() {
  const nodes = $$('#calves .calf');
  nodes.forEach((node, i) => {
    $('.no', node).textContent = nodes.length > 1 ? String(i + 1) : '';
    $('.remove', node).hidden = nodes.length === 1;
  });
  $('#addCalf').hidden = nodes.length >= 3;
}

/** 子牛の個体識別番号の頭5桁をワンタップで入れるボタン */
function renderPrefixes(node) {
  const box = $('.c-prefixes', node);
  box.textContent = '';
  const farm = currentFarm();
  if (!farm) return;
  farm.tagRules.forEach((rule) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${rule.prefix}…`;
    b.addEventListener('click', () => {
      const el = $('.c-id', node);
      el.value = rule.prefix;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      autoTag(node);
    });
    box.append(b);
  });
}

/** 個体識別番号から自家耳標番号を作る（例: 14175 → K。1417567193 → K6719） */
function autoTag(node) {
  if (node.dataset.tagManual) return;
  const id = $('.c-id', node).value;
  const farm = currentFarm();
  const rule = farm && id.length === 10 ? farm.tagRules.find((r) => id.startsWith(r.prefix)) : null;
  $('.c-tag', node).value = rule ? `${rule.letter}${id.slice(5, 9)}` : '';
}

/** 品種からタイプを決める（ホルスタイン・ジャージー → 乳用牛、それ以外 → 肉用牛）。手で選んだら触らない */
function autoType(node) {
  if (node.dataset.typeManual) return;
  const breed = $('.c-breed', node).value;
  if (!breed) return;
  const type = state.dairyBreeds.includes(breed) ? '乳用牛' : '肉用牛';
  const el = $$('.c-type input', node).find((x) => x.value === type);
  if (el) el.checked = true;
}

// ---------- 確認・送信 ----------

function collect() {
  return {
    farm: $('#farm').value,
    damTag: $('#damTag').value.trim(),
    damId: $('#damId').value.trim(),
    date: $('#date').value,
    worker: $('#worker').value,
    memo: $('#memo').value.trim(),
    kind: value('kind'),
    difficulty: value('difficulty'),
    timeKind: value('timeKind'),
    calves: $$('#calves .calf').map((node) => ({
      id: $('.c-id', node).value.trim(),
      noId: $('.c-noid', node).checked,
      noWeight: $('.c-noweight', node).checked,
      tag: $('.c-tag', node).value.trim(),
      name: $('.c-name', node).value.trim(),
      type: value(null, $('.c-type', node)),
      color: $('.c-color', node).value,
      sex: value(null, $('.c-sex', node)),
      breed: $('.c-breed', node).value,
      weight: $('.c-weight', node).value.trim(),
      memo: $('.c-memo', node).value.trim(),
    })),
  };
}

function validate(r) {
  const errors = [];
  const bad = (el, msg) => {
    if (el) el.classList.add('invalid');
    errors.push(msg);
  };
  $$('.invalid').forEach((el) => el.classList.remove('invalid'));
  if (!r.farm) bad($('#farm'), '牧場を選んでください');
  if (!r.damTag && !r.damId) {
    bad($('#damTag'), '母牛の耳標か個体識別番号を入れてください');
    $('#damId').classList.add('invalid');
  }
  if (r.damId && r.damId.length !== 10) bad($('#damId'), '母牛の個体識別番号は10桁です');
  if (!r.date) bad($('#date'), '分娩日を入れてください');
  else if (r.date > today()) bad($('#date'), '分娩日が未来になっています');
  if (!r.worker) bad($('#worker'), '作業者を選んでください');
  const birth = r.kind === '出産';
  if (birth && !r.difficulty) bad($('#difficulty'), '分娩難易を選んでください');
  const nodes = $$('#calves .calf');
  r.calves.forEach((c, i) => {
    const node = nodes[i];
    const no = r.calves.length > 1 ? `子牛${i + 1}` : '子牛';
    if (c.id && c.id.length !== 10) bad($('.c-id', node), `${no}の個体識別番号は10桁です`);
    if (birth && !c.id && !c.noId) bad($('.c-id', node), `${no}の個体識別番号を入れてください（まだ付けていなければチェック）`);
    if (birth && !c.weight && !c.noWeight) bad($('.c-weight', node), `${no}の出生時体重を入れてください（測れなかったらチェック）`);
    const required = birth || hasCalfInfo(c);
    if (required && !c.sex) bad($('.c-sex', node), `${no}の性別を選んでください`);
    if (required && !c.breed) bad($('.c-breed', node), `${no}の品種を選んでください`);
    if (required && !c.type) bad($('.c-type', node), `${no}のタイプを選んでください`);
    if (c.weight && !(Number(c.weight) > 0 && Number(c.weight) < 100)) bad($('.c-weight', node), `${no}の体重を確認してください`);
  });
  return errors;
}

function hasCalfInfo(c) {
  return Boolean(c.id || c.tag || c.name || c.sex || c.breed || c.weight || c.memo);
}

function onNext() {
  if (state.view === 'form') return toConfirm();
  if (state.view === 'confirm') return send();
  if (state.view === 'done') return resetForNext();
  return undefined;
}

function onBack() {
  if (state.view === 'confirm') showView('form');
  else if (state.view === 'done') woff.closeWindow();
}

function toConfirm() {
  const r = collect();
  const errors = validate(r);
  const box = $('#errors');
  if (errors.length) {
    box.innerHTML = '<ul></ul>';
    errors.forEach((msg) => {
      const li = document.createElement('li');
      li.textContent = msg;
      $('ul', box).append(li);
    });
    box.hidden = false;
    const first = $('.invalid');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  box.hidden = true;
  if (!state.pendingId) state.pendingId = newId();
  state.report = r;
  $('#preview').textContent = buildMessage(r, '送信時刻');
  $('#postNote').textContent = state.canPost
    ? '送信すると、スプレッドシートに保存し、このトークルームにあなたの名前で投稿します。'
    : 'スプレッドシートに保存します（この画面からはトークに投稿されません）。';
  $('#sendError').hidden = true;
  showView('confirm');
}

async function send() {
  if (state.sending) return;
  state.sending = true;
  $('#next').disabled = true;
  $('#back').disabled = true;
  $('#next').textContent = '送信中…';
  $('#sendError').hidden = true;
  try {
    const res = await api('submit', { report: { ...state.report, id: state.pendingId } });
    let note = '';
    if (res.duplicate) {
      note = 'この内容は送信済みでした（二重には保存していません）';
    } else if (state.canPost) {
      try {
        // 時刻はシートに記録された送信時刻を使う
        await woff.sendMessage({ content: buildMessage(state.report, res.time) });
        note = 'トークにも投稿しました';
      } catch (_) {
        note = 'トークへの投稿に失敗しました（スプレッドシートには保存済みです）';
      }
    } else {
      note = 'トークには投稿していません（スマホのトークルームから開いたときだけ投稿されます）';
    }
    remember(state.report);
    state.pendingId = '';
    $('#doneNote').textContent = note;
    showView('done');
  } catch (e) {
    $('#sendError').textContent = `${e.message}（もう一度「送信する」を押すと、同じ内容で送り直します）`;
    $('#sendError').hidden = false;
  } finally {
    state.sending = false;
    $('#next').disabled = false;
    $('#back').disabled = false;
    if (state.view === 'confirm') $('#next').textContent = '送信する';
  }
}

/** 続けて入力: 牧場・作業者・分娩日は残し、牛ごとの内容を空にする */
function resetForNext() {
  ['#damTag', '#damId', '#memo'].forEach((s) => { $(s).value = ''; });
  $('#damHits').textContent = '';
  check('kind', '出産');
  check('difficulty', '自然分娩');
  check('timeKind', 'found');
  $('#calves').textContent = '';
  addCalf();
  applyKind();
  state.pendingId = '';
  showView('form');
  window.scrollTo(0, 0);
}

function showView(view) {
  state.view = view;
  $('#form').hidden = view !== 'form';
  $('#confirm').hidden = view !== 'confirm';
  $('#done').hidden = view !== 'done';
  const back = $('#back');
  const next = $('#next');
  if (view === 'form') {
    back.hidden = true;
    next.textContent = '確認する';
  } else if (view === 'confirm') {
    back.hidden = false;
    back.textContent = '戻る';
    next.textContent = '送信する';
  } else {
    back.hidden = false;
    back.textContent = '閉じる';
    next.textContent = '続けて入力';
  }
  window.scrollTo(0, 0);
}

/** トークに投稿する文面（スプレッドシートの保存内容とは別。読みやすさ優先） */
function buildMessage(r, time) {
  const dam = r.damTag && r.damId ? `${r.damTag}（${r.damId}）` : r.damTag || r.damId;
  const head = r.kind === '出産' ? '分娩' : r.kind;
  const lines = [`【${head}】${r.farm} ${dam}`];
  const when = time ? ` ${r.timeKind === 'birth' ? '分娩' : '子牛発見'} ${time}` : '';
  lines.push(`${r.date.replace(/-/g, '/')}${when}${r.difficulty ? `／${r.difficulty}` : ''}`);
  const calves = r.calves.filter((c) => r.kind === '出産' || hasCalfInfo(c));
  calves.forEach((c, i) => {
    const label = calves.length > 1 ? `子牛${i + 1}` : '子牛';
    const nums = c.id ? `${c.tag || c.id.slice(5, 9)}（${fmtCalfId(c.id)}）` : c.tag || (c.noId ? '耳標未装着' : '番号未記入');
    const weight = c.weight ? `${c.weight}kg` : c.noWeight ? '体重未測定' : '';
    const parts = [c.sex, c.breed, weight].filter(Boolean).join(' ');
    lines.push(`${label}: ${parts}　${nums}`);
    if (c.memo) lines.push(`　${c.memo.replace(/\s*\n\s*/g, ' ')}`);
  });
  if (r.memo) lines.push(`メモ: ${r.memo.replace(/\s*\n\s*/g, ' ')}`);
  lines.push(`作業者: ${r.worker}`);
  return lines.join('\n');
}

// ---------- 小物 ----------

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

function fmtCalfId(id) {
  return `${id.slice(0, 5)}.${id.slice(5, 9)}.${id.slice(9)}`;
}

function toDigits(s) {
  return String(s).replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/\D/g, '');
}

/** 検索用: 全角英数→半角、空白除去、小文字化 */
function normalize(s) {
  return String(s || '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .toLowerCase();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

/** 次回のために牧場と作業者を覚えておく（端末ごと） */
function remember(r) {
  try {
    const saved = loadSaved();
    saved.farm = r.farm;
    saved.workers = { ...(saved.workers || {}), [r.farm]: r.worker };
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch (_) {
    // 保存できなくても入力には影響しない
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

function showFatal(msg) {
  $('#loading').hidden = true;
  const el = $('#fatal');
  el.textContent = msg;
  el.hidden = false;
}
