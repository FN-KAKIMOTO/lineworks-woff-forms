'use strict';

// ===== デプロイ後に書き換える =====
const CONFIG = {
  woffId: '8IjjeCbtPxsinTC8-7cXug', // Developer Console（アプリ「分娩報告フォーム」の WOFF「分娩報告」）で発行された WOFF ID
  gasUrl: 'https://script.google.com/macros/s/AKfycbxeEl4u7byBq21WFH3mvap8JZ-HnzlqYByUhncD_jDPivvF98okpf0PI487SNvMh7Rcow/exec',
};

const PARAMS = new URLSearchParams(location.search);
const MOCK = PARAMS.has('mock');
// 試行モード（?trial=1）: WOFF を使わずブラウザで開く。キー（GAS の TRIAL_KEY）は初回に貼り付けてもらい、その端末に保存する
const TRIAL = PARAMS.has('trial');
// 報告の種類。トークルームの下のボタン（Bot の固定メニュー）から ?type=… で開く
const ACTIVITY_INFO = {
  bunben: { title: '分娩の報告', cow: '母牛', date: '分娩日', color: '#2f7d4f' },
  shippei: { title: '疾病の報告', cow: '牛', date: '発生日', color: '#b45309' },
  haiyou: { title: '死亡・廃用の報告', cow: '牛', date: '死亡・廃用の日', color: '#4b5563' },
  idou: { title: '牛群移動の報告', cow: '牛', date: '移動日', color: '#1d5fa8' },
};
const MAX_MOVES = 4; // 牛群移動の1回の報告で送れる頭数（GAS と同じ。5頭以上は PC で入れる）
const HERDS_FIRST = 8; // 移動先の牛群は「牛群」タブの上から8つを出し、残りは「ほかの牛群」で開く
const ACTIVITY = ACTIVITY_INFO[PARAMS.get('type')] ? PARAMS.get('type') : 'bunben';
const INFO = ACTIVITY_INFO[ACTIVITY];
const OTHER = '__other__'; // 疾病名「その他（入力）」
const TRIAL_KEY_STORE = 'bunben-trial-key';
const TIME_KINDS = [['found', '生まれていた（子牛発見時刻）'], ['birth', '分娩に立ち会った（分娩時刻）']];
const STORE_KEY = 'bunben-form';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  profile: null,
  token: '',
  user: null,
  farms: [],
  diseases: [],
  choices: null,
  dairyBreeds: [],
  wagyuBreeds: [],
  wagyuFemaleTypes: [],
  canPost: false,
  trialKey: '',
  view: 'form',
  report: null,
  pendingId: '',
  sending: false,
  posting: false,
};

window.addEventListener('load', () => {
  start().catch((e) => showFatal(e.message || String(e)));
});

async function start() {
  if (MOCK) await loadScript('mock.js');
  if (TRIAL) {
    state.trialKey = readStore(TRIAL_KEY_STORE) || (await askTrialKey());
    state.profile = { userId: '', displayName: '' };
  } else {
    if (!CONFIG.woffId && !MOCK) throw new Error('app.js の CONFIG.woffId が未設定です');
    await woff.init({ woffId: CONFIG.woffId });
    if (!woff.isLoggedIn()) {
      woff.login();
      return;
    }
    state.profile = await woff.getProfile();
    state.token = woff.getAccessToken();
    state.canPost = await canPostToTalk();
  }
  let res;
  try {
    res = await api('config');
  } catch (e) {
    if (TRIAL) writeStore(TRIAL_KEY_STORE, ''); // キーが違うときは次に開いたとき聞き直す
    throw e;
  }
  if (TRIAL) writeStore(TRIAL_KEY_STORE, state.trialKey);
  state.user = res.user;
  state.farms = res.farms;
  state.diseases = res.diseases || [];
  state.choices = res.choices;
  state.dairyBreeds = res.dairyBreeds || [];
  state.wagyuBreeds = res.wagyuBreeds || [];
  state.wagyuFemaleTypes = res.wagyuFemaleTypes || [];
  if (!state.farms.length) throw new Error('設定シート「牧場」に牧場がありません');
  setupForm();
  $('#loading').hidden = true;
  $('#footer').hidden = false;
  if (PARAMS.get('admin') === 'menu' && state.user.isAdmin) setupAdmin();
  showView('form');
}

/** 管理者が ?admin=menu で開いたとき: Bot の固定メニュー（トークルームの下のボタン）を登録する */
function setupAdmin() {
  $('#adminBox').hidden = false;
  $('#setupMenu').addEventListener('click', async () => {
    $('#setupMenu').disabled = true;
    $('#adminResult').textContent = '登録しています…';
    try {
      const res = await api('setupMenu');
      $('#adminResult').textContent = `登録しました: ${res.menu.join(' / ')}`;
    } catch (e) {
      $('#adminResult').textContent = e.message;
    } finally {
      $('#setupMenu').disabled = false;
    }
  });
}

/** 試行モードで初めて開いたとき、キーを貼り付けてもらう */
function askTrialKey() {
  return new Promise((resolve) => {
    $('#loading').hidden = true;
    $('#keyBox').hidden = false;
    $('#keyBox').addEventListener('submit', (e) => {
      e.preventDefault();
      const key = $('#trialKey').value.trim();
      if (!key) return;
      $('#keyBox').hidden = true;
      $('#loading').hidden = false;
      resolve(key);
    });
  });
}

/** スマホアプリのトークルームから開いたときだけ本人名義で投稿できる */
async function canPostToTalk() {
  const os = woff.getOS();
  if (os !== 'ios' && os !== 'android') return false;
  try {
    // 応答が返らない環境でも読み込み中で止まらないよう、3秒で諦める（そのときは文面コピーで対応）
    const timeout = new Promise((resolve) => { setTimeout(() => resolve(''), 3000); });
    return Boolean(await Promise.race([woff.getChannelId(), timeout]));
  } catch (_) {
    return false;
  }
}

async function api(action, extra = {}) {
  let res;
  try {
    // Content-Type を付けない（text/plain）ことで、Apps Script へのプリフライトを避ける
    const auth = TRIAL ? { trialKey: state.trialKey } : { token: state.token, userId: state.profile.userId };
    res = await fetch(CONFIG.gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action, ...auth, ...extra }),
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
  $('#who').textContent = TRIAL
    ? '試行モード｜スプレッドシートに保存します。トークへは送信後に出る文面をコピーして貼ってください'
    : `${name} さん｜${state.canPost ? '送信するとトークにも投稿されます' : 'この画面からはトークに投稿されません（シートには保存されます）'}`;
  $('#copyMessage').addEventListener('click', () => copyText($('#doneMessage').textContent));

  const saved = loadSaved();
  fillSelect($('#farm'), state.farms.map((f) => f.name), state.farms.length > 1 ? '選択してください' : null);
  if (state.farms.some((f) => f.name === saved.farm)) $('#farm').value = saved.farm;
  $('#farm').addEventListener('change', () => applyFarm());
  $('#farmCard').hidden = state.farms.length === 1;

  document.title = INFO.title;
  $('#title').textContent = INFO.title;
  $('#cowTitle').textContent = INFO.cow;
  $('#dateLabel').textContent = INFO.date;
  $('#date').value = today();
  $('#date').max = today();
  $('#damTag').addEventListener('input', showDamHits);
  fixTagOnBlur($('#damTag'));
  $('#damId').addEventListener('input', onDamId);
  $('#next').addEventListener('click', onNext);
  $('#back').addEventListener('click', onBack);

  // 内容が変わったら受付IDを作り直す（同じ受付IDは「送信済み」とみなされるため）
  $('#form').addEventListener('input', () => { state.pendingId = ''; });
  $('#form').addEventListener('change', () => { state.pendingId = ''; });

  $(`#${ACTIVITY}Fields`).hidden = false;
  $('#cowCard').hidden = ACTIVITY === 'idou'; // 牛群移動は牛ごとのカードで入れる
  if (ACTIVITY === 'bunben') setupBunben();
  if (ACTIVITY === 'shippei') setupShippei();
  if (ACTIVITY === 'haiyou') setupHaiyou();
  if (ACTIVITY === 'idou') setupIdou();
  applyFarm();
}

function setupBunben() {
  segment($('#kind'), 'kind', state.choices.kind, '出産');
  segment($('#difficulty'), 'difficulty', state.choices.difficulty, '自然分娩');
  // 時刻そのものは送信した時刻（GAS 側で入れる）。ここではどちらの列に入れるかだけ選ぶ
  segment($('#timeKind'), 'timeKind', TIME_KINDS, 'found');
  $$('input[name="kind"]').forEach((el) => el.addEventListener('change', applyKind));
  $('#addCalf').addEventListener('click', () => addCalf());
  addCalf();
  applyKind();
}

function setupShippei() {
  // 疾病名は「疾病名」タブの選択肢から選ぶ。無い病名は「その他（入力）」で書く
  fillSelect($('#disease'), state.diseases, '選択してください');
  $('#disease').append(new Option('その他（入力）', OTHER));
  $('#disease').addEventListener('change', () => {
    $('#diseaseOtherField').hidden = $('#disease').value !== OTHER;
  });
  $('#noTemp').addEventListener('change', () => {
    $('#temp').disabled = $('#noTemp').checked;
    if ($('#noTemp').checked) {
      $('#temp').value = '';
      $('#temp').classList.remove('invalid');
    }
  });
  segment($('#shinryo'), 'shinryo', state.choices.shinryo, '');
  segment($('#saishin'), 'saishin', state.choices.saishin, '');
  segment($('#kousei'), 'kousei', state.choices.kousei, '');
}

function setupHaiyou() {
  segment($('#hKind'), 'hKind', state.choices.haiyouKind, '');
  fillSelect($('#hReason'), state.choices.haiyouReason, '選択してください');
}

function setupIdou() {
  $('#addGroup').addEventListener('click', () => addGroup());
  addGroup();
}

function currentFarm() {
  return state.farms.find((f) => f.name === $('#farm').value) || null;
}

function applyFarm() {
  const farm = currentFarm();
  const saved = loadSaved();
  const workers = farm ? farm.workers.map((w) => w.name) : [];
  // 作業者は既定でボタンを押した人（LINE WORKS の氏名）。代理入力のときだけ選び直す
  const meName = TRIAL ? '' : (state.user && state.user.name) || state.profile.displayName || '';
  const me = normalize(meName);
  const mine = farm && me ? farm.workers.find((w) => normalize(w.lwName) === me || normalize(w.name) === me) : null;
  const options = meName && !mine ? [meName, ...workers] : workers;
  fillSelect($('#worker'), options, '選択してください');
  if (farm) {
    const last = saved.workers && saved.workers[farm.name];
    if (mine) $('#worker').value = mine.name;
    else if (meName) $('#worker').value = meName;
    else if (workers.includes(last)) $('#worker').value = last;
  }
  $$('#calves .calf').forEach(renderPrefixes);
  $$('#moveGroups .mgroup').forEach(renderGroups);
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
  cowHits($('#damTag'), $('#damId'), $('#damHits'));
}

/** 耳標の入力に合う牛（「母牛」タブ）を候補ボタンで出す。押すと耳標と個体識別番号が入る */
function cowHits(tagEl, idEl, box) {
  box.textContent = '';
  const farm = currentFarm();
  const q = normalize(tagEl.value);
  if (!farm || q.length < 2) return;
  const hits = farm.dams.filter((d) => normalize(d.tag).includes(q) || d.id.includes(q)).slice(0, 8);
  if (hits.length === 1 && normalize(hits[0].tag) === q) {
    if (!idEl.value) idEl.value = hits[0].id;
    return;
  }
  hits.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = d.id ? `${d.tag}（${d.id.slice(5, 9)}）` : d.tag;
    b.addEventListener('click', () => {
      tagEl.value = d.tag;
      idEl.value = d.id;
      box.textContent = '';
      tagEl.classList.remove('invalid');
      idEl.classList.remove('invalid');
      state.pendingId = '';
    });
    box.append(b);
  });
}

function onDamId() {
  fillTagFromId($('#damId'), $('#damTag'));
}

/** 個体識別番号を数字10桁にそろえ、「母牛」タブにあれば耳標も入れる */
function fillTagFromId(idEl, tagEl) {
  idEl.value = toDigits(idEl.value).slice(0, 10);
  const farm = currentFarm();
  if (farm && idEl.value.length === 10 && !tagEl.value) {
    const d = farm.dams.find((x) => x.id === idEl.value);
    if (d) tagEl.value = d.tag;
  }
}

// ---------- 牛群移動 ----------

/**
 * 移動先のカード。向きと移動先の牛群を1回選び、同じ移動先へ行く牛を何頭でも（合計4頭まで）並べる。
 * 交換のように移動先が違うときは「別の移動先を追加」でカードを増やす（反対の向きが開く）
 */
function addGroup() {
  if (moveCowCount() >= MAX_MOVES) return;
  const list = $('#moveGroups');
  const node = $('#moveGroupTpl').content.firstElementChild.cloneNode(true);
  node.dataset.key = `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  node.dataset.herd = '';
  const groups = herdGroups();
  const prev = list.lastElementChild;
  const prevGroup = prev ? prev.dataset.group : '';
  node.dataset.group = prevGroup === groups[0] && groups[1] ? groups[1] : groups[0] || '';
  $('.remove', node).addEventListener('click', () => {
    node.remove();
    renumberGroups();
    state.pendingId = '';
  });
  $('.m-addcow', node).addEventListener('click', () => {
    const tag = addCow(node);
    if (tag) tag.focus();
  });
  list.append(node);
  renderGroups(node);
  addCow(node);
  renumberGroups();
}

/** 移動する牛の1行。耳標を入れる（10桁の数字なら個体識別番号として扱う） */
function addCow(group) {
  if (moveCowCount() >= MAX_MOVES) return null;
  const row = $('#moveCowTpl').content.firstElementChild.cloneNode(true);
  const tagEl = $('.m-tag', row);
  const idEl = $('.m-id', row); // 「母牛」タブの候補を選んだときの個体識別番号（見えない）
  tagEl.addEventListener('input', () => {
    idEl.value = '';
    cowHits(tagEl, idEl, $('.m-hits', row));
  });
  fixTagOnBlur(tagEl);
  $('.m-delcow', row).addEventListener('click', () => {
    row.remove();
    renumberGroups();
    state.pendingId = '';
  });
  $('.m-cows', group).append(row);
  renumberGroups();
  return tagEl;
}

function moveCowCount() {
  return $$('#moveGroups .m-cow').length;
}

/** 番号・削除ボタン・追加ボタンの出し分け（合計4頭で追加ボタンを隠す） */
function renumberGroups() {
  const groups = $$('#moveGroups .mgroup');
  const full = moveCowCount() >= MAX_MOVES;
  groups.forEach((g, i) => {
    $('.no', g).textContent = groups.length > 1 ? String(i + 1) : '';
    $('.remove', g).hidden = groups.length === 1;
    const rows = $$('.m-cow', g);
    rows.forEach((row) => { $('.m-delcow', row).hidden = rows.length === 1; });
    $('.m-addcow', g).hidden = full;
  });
  $('#addGroup').hidden = full;
}

function currentHerds() {
  const farm = currentFarm();
  return farm && farm.herds ? farm.herds : [];
}

/** 「牛群」タブの移動の向き（上から出てきた順）。フォームではタブとして出す */
function herdGroups() {
  return [...new Set(currentHerds().map((h) => h.group))];
}

/** 移動の向きのタブを出し、選んだ向きの移動先の牛群をボタンで出す */
function renderGroups(node) {
  const groups = herdGroups();
  const box = $('.m-groups', node);
  if (!groups.includes(node.dataset.group)) node.dataset.group = groups[0] || '';
  segment(box, `${node.dataset.key}-g`, groups, node.dataset.group);
  $('.m-groups-box', node).hidden = groups.length < 2;
  $$('input', box).forEach((el) => el.addEventListener('change', () => {
    node.dataset.group = el.value;
    node.dataset.more = '';
    renderHerds(node);
  }));
  renderHerds(node);
}

/** 移動先の牛群のボタン。よく使う上の8つだけ出し、残りは「ほかの牛群」を押したら出す */
function renderHerds(node) {
  const box = $('.m-herds', node);
  const herds = currentHerds().filter((h) => h.group === node.dataset.group).map((h) => h.name);
  const showAll = node.dataset.more || herds.length <= HERDS_FIRST + 1 || herds.indexOf(node.dataset.herd) >= HERDS_FIRST;
  segment(box, `${node.dataset.key}-h`, showAll ? herds : herds.slice(0, HERDS_FIRST), node.dataset.herd);
  $$('input', box).forEach((el) => el.addEventListener('change', () => {
    node.dataset.herd = el.value;
    state.pendingId = '';
  }));
  if (!showAll) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `ほかの牛群（${herds.length - HERDS_FIRST}）`;
    b.addEventListener('click', () => {
      node.dataset.more = '1';
      renderHerds(node);
    });
    box.append(b);
  }
}

// ---------- 子牛 ----------

function addCalf() {
  const list = $('#calves');
  if (list.children.length >= 3) return;
  const node = $('#calfTpl').content.firstElementChild.cloneNode(true);
  const key = `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  node.dataset.key = key;
  segment($('.c-sex', node), `${key}-sex`, state.choices.sex, '');
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
  $('.c-breed', node).addEventListener('change', () => renderType(node));
  $$('.c-sex input', node).forEach((el) => el.addEventListener('change', () => renderType(node)));
  renderType(node);
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

/**
 * 子牛のタイプの決まり（GAS の calfTypeRule_ と同じ）。乳用種のメス → 乳用牛、和牛のメス → 繁殖雌牛か肉用牛を選ぶ、
 * それ以外（F1・ホルスタインのオス・和牛のオス）→ 肉用牛。品種か性別が無ければ null
 */
function calfTypeRule(breed, sex) {
  if (!breed || !sex) return null;
  if (sex === 'メス' && state.wagyuBreeds.includes(breed)) return { choices: state.wagyuFemaleTypes };
  if (sex === 'メス' && state.dairyBreeds.includes(breed)) return { fixed: '乳用牛' };
  return { fixed: '肉用牛' };
}

/** タイプの欄: 決まるものは自動で入れ、和牛のメスだけ2つから選んでもらう */
function renderType(node) {
  const rule = calfTypeRule($('.c-breed', node).value, value(null, $('.c-sex', node)));
  const box = $('.c-type', node);
  const current = value(null, box);
  const hint = $('.c-type-hint', node);
  if (!rule) {
    segment(box, `${node.dataset.key}-type`, [], '');
    hint.textContent = '品種と性別を選ぶと決まります';
  } else if (rule.fixed) {
    segment(box, `${node.dataset.key}-type`, [rule.fixed], rule.fixed);
    hint.textContent = '品種と性別から自動で決まります';
  } else {
    segment(box, `${node.dataset.key}-type`, rule.choices, rule.choices.includes(current) ? current : '');
    hint.textContent = '和牛のメスは選んでください';
  }
}

// ---------- 確認・送信 ----------

function collect() {
  const base = {
    activity: ACTIVITY,
    farm: $('#farm').value,
    damTag: fixTag($('#damTag').value),
    damId: $('#damId').value.trim(),
    date: $('#date').value,
    worker: $('#worker').value,
  };
  if (ACTIVITY === 'shippei') {
    return {
      ...base,
      disease: $('#disease').value === OTHER ? $('#diseaseOther').value.trim() : $('#disease').value,
      temp: $('#temp').value.trim(),
      noTemp: $('#noTemp').checked,
      shinryo: value('shinryo'),
      saishin: value('saishin'),
      kousei: value('kousei'),
      memo: $('#sMemo').value.trim(),
    };
  }
  if (ACTIVITY === 'haiyou') {
    return { ...base, kind: value('hKind'), reason: $('#hReason').value, memo: $('#hMemo').value.trim() };
  }
  if (ACTIVITY === 'idou') {
    return {
      ...base,
      damTag: '',
      damId: '',
      memo: $('#iMemo').value.trim(),
      // 移動先のカードごとの牛を1頭ずつに並べる。空の行は飛ばす。10桁の数字は個体識別番号として送る
      moves: $$('#moveGroups .mgroup').flatMap((g) => $$('.m-cow', g).map((row) => {
        const v = fixTag($('.m-tag', row).value);
        const isId = /^\d{10}$/.test(v);
        return {
          tag: isId ? '' : v,
          id: isId ? v : $('.m-id', row).value,
          herd: g.dataset.herd,
          dir: g.dataset.herd ? g.dataset.group : '', // トークに出す移動の向き（シートには保存しない）
        };
      }).filter((mv) => mv.tag || mv.id)),
    };
  }
  return {
    ...base,
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
  if (ACTIVITY !== 'idou' && !r.damTag && !r.damId) {
    bad($('#damTag'), `${INFO.cow}の耳標か個体識別番号を入れてください`);
    $('#damId').classList.add('invalid');
  }
  if (r.damId && r.damId.length !== 10) bad($('#damId'), `${INFO.cow}の個体識別番号は10桁です`);
  if (ACTIVITY === 'idou') validateMoves(r, bad);
  if (!r.date) bad($('#date'), `${INFO.date}を入れてください`);
  else if (r.date > today()) bad($('#date'), `${INFO.date}が未来になっています`);
  if (!r.worker) bad($('#worker'), '作業者を選んでください');
  if (ACTIVITY === 'idou') return errors;
  if (ACTIVITY === 'shippei') {
    if (!r.disease) bad($('#disease').value === OTHER ? $('#diseaseOther') : $('#disease'), '疾病名を選ぶか入れてください');
    if (!r.temp && !r.noTemp) bad($('#temp'), '体温を入れてください（測っていなければチェック）');
    if (r.temp && !(Number(r.temp) >= 35 && Number(r.temp) <= 43)) bad($('#temp'), '体温を確認してください（35〜43℃）');
    if (!r.shinryo) bad($('#shinryo'), '獣医か自家治療かを選んでください');
    return errors;
  }
  if (ACTIVITY === 'haiyou') {
    if (!r.kind) bad($('#hKind'), '死亡か淘汰かを選んでください');
    if (!r.reason) bad($('#hReason'), '理由を選んでください');
    return errors;
  }
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

/** 牛群移動: 移動先のカードごとに牛が1頭以上と移動先の牛群。同じ牛を2回入れない（画面の行を直接見る） */
function validateMoves(r, bad) {
  const groups = $$('#moveGroups .mgroup');
  const seen = new Set();
  groups.forEach((g, i) => {
    const p = groups.length > 1 ? `移動先${i + 1}の` : '';
    const rows = $$('.m-cow', g);
    const filled = rows.filter((row) => fixTag($('.m-tag', row).value));
    if (!filled.length) bad($('.m-tag', rows[0]), `${p}牛の耳標を入れてください`);
    if (!g.dataset.herd) bad($('.m-herds', g), groups.length > 1 ? `移動先${i + 1}の牛群を選んでください` : '移動先の牛群を選んでください');
    filled.forEach((row) => {
      const el = $('.m-tag', row);
      const v = fixTag(el.value);
      if (/^\d{5,9}$|^\d{11,}$/.test(v)) bad(el, `「${v}」: 個体識別番号なら10桁です`);
      const key = /^\d{10}$/.test(v) ? v : normalize(v);
      if (seen.has(key)) bad(el, `「${v}」が2回入っています`);
      seen.add(key);
    });
  });
  if (r.moves.length > MAX_MOVES) bad(null, `1回に送れるのは${MAX_MOVES}頭までです`);
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
    : 'スプレッドシートに保存します。トークへは、送信後に出る文面をコピーして貼ってください。';
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
    // 時刻はシートに記録された送信時刻を使う
    const report = state.report;
    const message = buildMessage(report, res.time);
    remember(report);
    state.pendingId = '';
    $('#doneMessage').textContent = message;
    $('#copyBox').hidden = true;
    if (res.duplicate) {
      $('#doneNote').textContent = 'この内容は送信済みでした（二重には保存していません）';
    } else if (state.canPost) {
      // 保存できた時点で完了画面を出し、トークへの投稿はその後に続ける
      $('#doneNote').textContent = 'スプレッドシートに保存しました。トークに投稿しています…';
      postToTalk(report, res.time, message);
    } else {
      $('#doneNote').textContent = 'スプレッドシートに保存しました。トークへは下の文面を貼ってください';
      $('#copyBox').hidden = false;
    }
    showView('done');
  } catch (e) {
    $('#sendError').textContent = `${e.message}（もう一度「送信する」を押すと、同じ内容で送り直します）`;
    $('#sendError').hidden = false;
  } finally {
    state.sending = false;
    $('#next').disabled = false;
    if (!state.posting) $('#back').disabled = false;
    if (state.view === 'confirm') $('#next').textContent = '送信する';
  }
}

/** トークに投稿する。見やすいカードで送り、カードが送れない環境ではテキストで送る */
async function postToTalk(report, time, message) {
  state.posting = true;
  $('#back').disabled = true; // 投稿が終わる前に「閉じる」と投稿が止まるため
  try {
    await woff.sendFlexMessage({ flex: buildFlex(report, time) })
      .catch(() => woff.sendMessage({ content: message }));
    $('#doneNote').textContent = 'スプレッドシートに保存し、トークにも投稿しました';
  } catch (_) {
    $('#doneNote').textContent = 'トークへの投稿に失敗しました（スプレッドシートには保存済み）。下の文面を貼ってください';
    $('#copyBox').hidden = false;
  } finally {
    state.posting = false;
    $('#back').disabled = false;
  }
}

/** 続けて入力: 牧場・作業者・分娩日は残し、牛ごとの内容を空にする */
function resetForNext() {
  ['#damTag', '#damId'].forEach((s) => { $(s).value = ''; });
  $('#damHits').textContent = '';
  if (ACTIVITY === 'bunben') {
    $('#memo').value = '';
    check('kind', '出産');
    check('difficulty', '自然分娩');
    check('timeKind', 'found');
    $('#calves').textContent = '';
    addCalf();
    applyKind();
  } else if (ACTIVITY === 'shippei') {
    ['#disease', '#diseaseOther', '#temp', '#sMemo'].forEach((s) => { $(s).value = ''; });
    $('#diseaseOtherField').hidden = true;
    $('#noTemp').checked = false;
    $('#temp').disabled = false;
    $$('#shinryo input, #saishin input, #kousei input').forEach((el) => { el.checked = false; });
  } else if (ACTIVITY === 'haiyou') {
    ['#hReason', '#hMemo'].forEach((s) => { $(s).value = ''; });
    $$('#hKind input').forEach((el) => { el.checked = false; });
  } else {
    $('#iMemo').value = '';
    $('#moveGroups').textContent = '';
    addGroup();
  }
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
    back.hidden = TRIAL; // 試行モードは WOFF の「閉じる」が使えない
    back.textContent = '閉じる';
    next.textContent = '続けて入力';
  }
  window.scrollTo(0, 0);
}

/** トークに貼る文面をコピーする。http の画面では clipboard API が使えないので、選択してコピーする方法に切り替える */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const btn = $('#copyMessage');
  btn.textContent = 'コピーしました';
  setTimeout(() => { btn.textContent = '文面をコピー'; }, 2000);
}

/**
 * トークに投稿する見出しと「項目：内容」の行（テキストとカードの両方で使う。シートの保存内容とは別）。
 * トークで読みやすいよう短くする: 日付は今日なら出さない（投稿時刻でわかる）、作業者は投稿した本人と違うとき（代理入力）だけ出す
 */
function reportRows(r, time) {
  const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ');
  const [, m, d] = r.date.split('-').map(Number);
  const isToday = r.date === today();
  const day = `${m}月${d}日`;
  const tail = [];
  if (r.memo) tail.push(['メモ', oneLine(r.memo)]);
  if (!isSelf(r.worker)) tail.push(['作業者', r.worker]);
  const cow = r.damTag || r.damId;
  if (r.activity === 'shippei') {
    const rows = [['牛', cow], ['疾病名', r.disease]];
    if (r.temp) rows.push(['体温', `${Number(r.temp).toFixed(1)}℃`]);
    rows.push(['診療', [r.shinryo, r.saishin, r.kousei].filter(Boolean).join('・')]);
    if (!isToday) rows.push(['発生日', day]);
    return { title: '疾病の報告', rows: rows.concat(tail) };
  }
  if (r.activity === 'haiyou') {
    const rows = [['牛', cow], ['理由', r.reason]];
    if (!isToday) rows.push(['日付', day]);
    return { title: `${r.kind}の報告`, rows: rows.concat(tail) };
  }
  if (r.activity === 'idou') return idouRows(r, day, isToday, tail);
  const how = r.timeKind === 'birth' ? '分娩に立ち会い' : '子牛を発見';
  const rows = [
    ['母牛', cow],
    [isToday ? '時刻' : '日付', [isToday ? time : day, how].filter(Boolean).join(' ')],
    ['分類', [r.kind, r.difficulty].filter(Boolean).join('・')],
  ];
  const calves = r.calves.filter((c) => r.kind === '出産' || hasCalfInfo(c));
  calves.forEach((c, i) => {
    const no = calves.length > 1 ? String(i + 1) : '';
    // 子牛は1行: 「K1547 メス・黒毛和種・57kg」。タイプは選んだときの繁殖雌牛だけ出す（ほかは品種と性別で決まる）
    const ear = c.tag || (c.id ? fmtCalfId(c.id) : c.noId ? '耳標なし' : '');
    const weight = c.weight ? `${c.weight}kg` : c.noWeight ? '体重未測定' : '';
    const attrs = [c.sex, c.breed, c.type === '繁殖雌牛' ? c.type : '', weight].filter(Boolean).join('・');
    rows.push([`子牛${no}`, [ear, attrs].filter(Boolean).join(' ')]);
    if (c.memo) rows.push([`出生メモ${no}`, oneLine(c.memo)]);
  });
  const title = r.kind === '出産' ? '分娩の報告' : `${r.kind}の報告`;
  return { title, rows: rows.concat(tail) };
}

/** 作業者が投稿する本人か（試行モードは投稿者がいないので常に違うとみなす） */
function isSelf(worker) {
  if (TRIAL) return false;
  const me = normalize((state.user && state.user.name) || (state.profile && state.profile.displayName) || '');
  if (!me) return false;
  if (normalize(worker) === me) return true;
  const farm = currentFarm();
  return Boolean(farm && farm.workers.some((w) => w.name === worker && normalize(w.lwName) === me));
}

/**
 * 牛群移動のカード。同じ向き・同じ移動先の牛は1行にまとめる（「ネ145・ネ146 → VMS_VIC」）。
 * 向きが1つなら見出しに出し（「牛群移動 希望 → DP」）、2つ（交換）なら行の頭に出す
 */
function idouRows(r, day, isToday, tail) {
  const groups = [];
  r.moves.forEach((mv) => {
    let g = groups.find((x) => x.dir === mv.dir && x.herd === mv.herd);
    if (!g) groups.push((g = { dir: mv.dir, herd: mv.herd, cows: [] }));
    g.cows.push(mv.tag || mv.id);
  });
  const dirs = [...new Set(groups.map((g) => g.dir))];
  const rows = groups.map((g) => [
    dirs.length > 1 ? g.dir.replace(/\s+/g, '') : g.cows.length > 1 ? `${g.cows.length}頭` : '牛',
    `${g.cows.join('・')} → ${g.herd}`,
  ]);
  if (!isToday) rows.push(['移動日', day]);
  const title = dirs.length > 1 ? '牛群移動（交換）' : ['牛群移動', dirs[0]].filter(Boolean).join(' ');
  return { title, rows: rows.concat(tail) };
}

/** 牧場が2つ以上あるときだけ牧場名を出す（今は希望DPだけなので出さない） */
function farmLabel(r) {
  return state.farms.length > 1 ? r.farm : '';
}

/** トークに投稿する文面（カードを送れないときと、コピーして貼るとき用） */
function buildMessage(r, time) {
  const { title, rows } = reportRows(r, time);
  return [`【${title}】${farmLabel(r)}`, ...rows.map(([label, value]) => `${label}：${value}`)].join('\n');
}

/** トークに投稿するカード（Flexible Template）。次の報告はトークルームの下のボタンから開くので、カードにボタンは付けない */
function buildFlex(r, time) {
  const { title, rows } = reportRows(r, time);
  const info = ACTIVITY_INFO[r.activity] || INFO;
  const headColor = r.activity === 'bunben' && r.kind !== '出産' ? '#7a5c2e' : info.color;
  const head = [{ type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'lg', wrap: true }];
  if (farmLabel(r)) head.push({ type: 'text', text: farmLabel(r), color: '#ffffff', size: 'sm' });
  return {
    type: 'flex',
    altText: buildMessage(r, time).slice(0, 400),
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: headColor, paddingAll: '12px', contents: head },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: rows.map(([label, value]) => ({
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          contents: [
            { type: 'text', text: label, size: 'md', color: '#646b62', flex: 2, wrap: true },
            { type: 'text', text: value || '－', size: 'md', color: '#1d211c', weight: 'bold', flex: 5, wrap: true },
          ],
        })),
      },
    },
  };
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
