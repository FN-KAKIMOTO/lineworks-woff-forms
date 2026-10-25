'use strict';

// ===== フォームの部品（いくつかの報告で使う欄） =====
// 牧場・作業者、母牛（1頭の牛の欄）、牛の行（複数頭の欄）、どこの牛群か、牛群移動の移動先、子牛、
// 投薬の欄（治療・予防的投与と、分娩・疾病などに一緒に入れる投薬）、引き継ぎの型、採卵の処置

// ---------- 牧場・作業者 ----------

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
  $$('#calves .calf').forEach(renderOwners);
  $$('#moveGroups .mgroup').forEach(renderGroups);
  if (INFO.herdLabel) renderHerdSelect();
  if (INFO.onFarm) INFO.onFarm();
  showDamHits();
}

// ---------- 母牛（1頭の牛の欄） ----------

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
      if (tagEl.id === 'damTag') onDamChange();
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

// ---------- 牛の行（治療・予防的投与・採卵用プログラム・応急削蹄の依頼。牛群移動は移動先のカードの中） ----------

/**
 * 牛の1行（牛群移動・治療・採卵の処置で共通）。耳標を入れる（10桁の数字なら個体識別番号として扱う）。
 * 「母牛」タブに合う牛があれば候補ボタンを出す。✕で行を消したら onChange を呼ぶ
 */
function cowRow(onChange) {
  const row = $('#moveCowTpl').content.firstElementChild.cloneNode(true);
  const tagEl = $('.m-tag', row);
  const idEl = $('.m-id', row); // 候補を選んだときの個体識別番号（見えない）
  tagEl.addEventListener('input', () => {
    idEl.value = '';
    cowHits(tagEl, idEl, $('.m-hits', row));
  });
  fixTagOnBlur(tagEl);
  $('.m-delcow', row).addEventListener('click', () => {
    row.remove();
    onChange();
    state.pendingId = '';
  });
  return row;
}

/** 行の耳標・個体識別番号を読む（空の行は null） */
function readCowRow(row) {
  const v = fixTag($('.m-tag', row).value);
  if (!v) return null;
  const isId = /^\d{10}$/.test(v);
  return { tag: isId ? '' : v, id: isId ? v : $('.m-id', row).value };
}

/** 治療・採卵の処置の牛の欄に1行足す */
function addCowRow() {
  if ($$('#cowList .m-cow').length >= MAX_COWS) return null;
  const row = cowRow(renumberCowRows);
  $('#cowList').append(row);
  renumberCowRows();
  return $('.m-tag', row);
}

function renumberCowRows() {
  const rows = $$('#cowList .m-cow');
  rows.forEach((row) => { $('.m-delcow', row).hidden = rows.length === 1; });
  $('#addCowRow').hidden = rows.length >= MAX_COWS;
}

/** 耳標の行のチェック（牛群移動・治療・採卵の処置で共通）。seen は同じ報告の中の二重入力を見る */
function checkCowRows(rows, bad, seen, prefix) {
  const filled = rows.filter((row) => readCowRow(row));
  if (!filled.length && rows.length) bad($('.m-tag', rows[0]), `${prefix}牛の耳標を入れてください`);
  filled.forEach((row) => {
    const el = $('.m-tag', row);
    const v = fixTag(el.value);
    if (/^\d{5,9}$|^\d{11,}$/.test(v)) bad(el, `「${v}」: 個体識別番号なら10桁です`);
    const key = /^\d{10}$/.test(v) ? v : normalize(v);
    if (seen.has(key)) bad(el, `「${v}」が2回入っています`);
    seen.add(key);
  });
}

// ---------- どこの牛群で起きたか（疾病・乳房炎・応急削蹄の依頼） ----------

/** どこの牛群で起きたか（REPORTS の herdLabel がある報告）。「牛群」タブの牛群を行き先ごとにまとめ、最後に「わからない」 */
function setupHerd() {
  $('#herdCard').hidden = !INFO.herdLabel;
  if (!INFO.herdLabel) return;
  $('#herdLabel').textContent = INFO.herdLabel;
  renderHerdSelect();
}

function renderHerdSelect() {
  const sel = $('#herd');
  const cur = sel.value;
  sel.textContent = '';
  sel.append(new Option('選択してください', ''));
  herdGroups().forEach((g) => {
    const group = document.createElement('optgroup');
    group.label = g;
    currentHerds().filter((h) => h.group === g).forEach((h) => group.append(new Option(h.name, h.name)));
    sel.append(group);
  });
  sel.append(new Option(state.herdUnknown, state.herdUnknown));
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  sel.addEventListener('change', () => sel.classList.remove('invalid'));
}

function currentHerds() {
  const farm = currentFarm();
  return farm && farm.herds ? farm.herds : [];
}

/** 「牛群」タブの行き先（上から出てきた順）。フォームではタブとして出す */
function herdGroups() {
  return [...new Set(currentHerds().map((h) => h.group))];
}

// ---------- 牛群移動の移動先 ----------

/**
 * 移動先のカード。行き先（アブレスト・希望・VMS）と移動先の牛群を1回選び、同じ移動先へ行く牛を（合計4頭まで）並べる。
 * 交換のように移動先が違うときは「別の移動先を追加」でカードを増やす（まだ使っていない行き先が開く）
 */
function addGroup() {
  if (moveCowCount() >= MAX_MOVES) return;
  const list = $('#moveGroups');
  const node = $('#moveGroupTpl').content.firstElementChild.cloneNode(true);
  node.dataset.key = `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  node.dataset.herd = '';
  const groups = herdGroups();
  const used = $$('.mgroup', list).map((g) => g.dataset.group);
  node.dataset.group = groups.find((g) => !used.includes(g)) || groups[0] || '';
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

/** 移動する牛の1行（移動先のカードの中） */
function addCow(group) {
  if (moveCowCount() >= MAX_MOVES) return null;
  const row = cowRow(renumberGroups);
  $('.m-cows', group).append(row);
  renumberGroups();
  return $('.m-tag', row);
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

/** 行き先のタブを出し、選んだ行き先の牛群をボタンで出す */
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

// ---------- 子牛（分娩） ----------

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

function addCalf() {
  const list = $('#calves');
  if (list.children.length >= 3) return;
  const node = $('#calfTpl').content.firstElementChild.cloneNode(true);
  const key = `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  node.dataset.key = key;
  segment($('.c-sex', node), `${key}-sex`, state.choices.sex, '');
  fillSelect($('.c-breed', node), state.choices.breed, '選択してください');
  fillSelect($('.c-color', node), state.choices.color, '未選択');

  const tagEl = $('.c-tag', node);
  $('.c-mid', node).addEventListener('input', () => updateCalfId(node));
  tagEl.addEventListener('input', () => { node.dataset.tagManual = tagEl.value ? '1' : ''; });
  // 「耳標をまだ付けていない」「測れなかった」にチェックしたら、その欄は空にして入力できなくする
  [['.c-noid', '.c-mid'], ['.c-noweight', '.c-weight']].forEach(([boxSel, inputSel]) => {
    const box = $(boxSel, node);
    const input = $(inputSel, node);
    box.addEventListener('change', () => {
      input.disabled = box.checked;
      if (box.checked) {
        input.value = '';
        input.classList.remove('invalid');
      }
      if (inputSel === '.c-mid') updateCalfId(node);
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
  renderOwners(node);
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

/**
 * 子牛の持ち主（希望・DP。「牧場」タブの子牛IDの頭5桁ごとの行）のボタン。選ぶと番号の頭5桁が決まる。
 * 子牛の持ち主は母牛で決まるので、母牛の耳標（ネ・SK／D・SD）から選んでおく。手で選び直した子牛はそのまま
 */
function renderOwners(node) {
  const farm = currentFarm();
  const rules = farm ? farm.tagRules : [];
  const box = $('.c-owner', node);
  segment(box, `${node.dataset.key}-owner`, rules.map((r) => [r.prefix, `${r.owner || r.prefix}（${r.prefix}）`]), value(null, box));
  $$('input', box).forEach((el) => el.addEventListener('change', (e) => {
    if (e.isTrusted) {
      node.dataset.ownerManual = '1';
      $('.c-owner-hint', node).hidden = true;
    }
    updateCalfId(node);
  }));
  ownerFromDam(node);
  updateCalfId(node);
}

/** 母牛の耳標の頭（ネ・SK／D・SD。「採卵」は飛ばす）から、子牛の持ち主の行を探す。耳標が無ければ「母牛」タブで番号から引く */
function damOwner() {
  const farm = currentFarm();
  if (!farm) return null;
  let tag = fixTag($('#damTag').value);
  if (!tag && $('#damId').value.length === 10) tag = (farm.dams.find((x) => x.id === $('#damId').value) || {}).tag || '';
  const m = tag.match(/^(?:採卵)?\s*([^\d\s（(]+)/);
  if (!m) return null;
  const head = m[1].toUpperCase();
  const rule = farm.tagRules.find((r) => (r.damHeads || []).includes(head));
  return rule ? { rule, head } : null;
}

/** 母牛から子牛の持ち主を選ぶ（手で選び直した子牛・10桁を入れた子牛はそのまま） */
function ownerFromDam(node) {
  const hint = $('.c-owner-hint', node);
  if (node.dataset.ownerManual) return;
  const hit = damOwner();
  const input = hit && $$('.c-owner input', node).find((i) => i.value === hit.rule.prefix);
  if (!input) {
    hint.hidden = true;
    return;
  }
  input.checked = true;
  $('.c-owner', node).classList.remove('invalid');
  hint.textContent = `母牛（${hit.head}）から${hit.rule.owner || hit.rule.prefix}の子牛にしました。違うときは選び直してください`;
  hint.hidden = false;
}

/** 母牛が変わったら、子牛の持ち主と番号を合わせ直す */
function onDamChange() {
  $$('#calves .calf').forEach((node) => {
    ownerFromDam(node);
    updateCalfId(node);
  });
}

const CALF_ID_HINT = '希望かDPかを選び、真ん中の4桁を入れてください。頭の5桁と最後の1桁は自動で入ります（10桁をそのまま入れても大丈夫です）';

/**
 * 子牛の個体識別番号をそろえる。真ん中の4桁なら、持ち主の頭5桁と最後の1桁（計算）を足して10桁にする。
 * 10桁を入れたときは、頭5桁が「牧場」タブにあって最後の1桁も合えば、持ち主を選んで真ん中の4桁の表示に直す
 */
function updateCalfId(node) {
  const midEl = $('.c-mid', node);
  const info = $('.c-id-full', node);
  const farm = currentFarm();
  let d = toDigits(midEl.value).slice(0, 10);
  if (d.length === 10 && farm && validCowId(d)) {
    const input = $$('.c-owner input', node).find((i) => d.startsWith(i.value));
    if (input) {
      input.checked = true;
      node.dataset.ownerManual = '1';
      $('.c-owner-hint', node).hidden = true;
      d = d.slice(5, 9);
    }
  }
  if (midEl.value !== d) midEl.value = d;
  const prefix = value(null, $('.c-owner', node));
  let id = '';
  if (d.length === 10) id = d;
  else if (d.length === 4 && prefix) id = `${prefix}${d}${checkDigit(prefix + d)}`;
  $('.c-id', node).value = id;
  const ok = !id || validCowId(id);
  $('.c-pre', node).textContent = d.length === 10 ? '' : prefix || '-----';
  $('.c-cd', node).textContent = d.length === 10 ? '' : id ? id[9] : '-';
  info.classList.toggle('bad', !ok);
  if ($('.c-noid', node).checked) info.textContent = '耳標をまだ付けていないときは、番号は空のままで送れます';
  else if (!ok) info.textContent = '最後の1桁が合いません。番号を確かめてください';
  else if (id) info.textContent = `個体識別番号 ${id.slice(0, 5)}.${id.slice(5, 9)}.${id[9]}`;
  else if (d && !prefix) info.textContent = '希望かDPかを選んでください';
  else info.textContent = CALF_ID_HINT;
  if (id) midEl.classList.remove('invalid');
  autoTag(node);
}

/** 個体識別番号から自家耳標番号を作る（例: 14175 → K。1417567193 → K6719） */
function autoTag(node) {
  if (node.dataset.tagManual) return;
  const id = $('.c-id', node).value;
  const farm = currentFarm();
  // 最後の1桁が合わない番号からは作らない（打ち間違いの番号で耳標が入るのを防ぐ）
  const rule = farm && validCowId(id) ? farm.tagRules.find((r) => id.startsWith(r.prefix)) : null;
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

/** 子牛の欄に何か入っているか（死産・流産でも、入れた子牛はチェックしてカードに出す） */
function hasCalfInfo(c) {
  return Boolean(c.id || c.tag || c.name || c.sex || c.breed || c.weight || c.memo);
}

// ---------- 投薬の欄 ----------

/**
 * 投薬の欄（治療区分・いつもの組み合わせ・薬）を root に作る。治療のフォームのほか、分娩・疾病などに一緒に入れる投薬でも使う。
 * kubuns: 選べる治療区分（1つなら区分の欄は隠す）、initial: 最初に選ぶ区分、onKubun: 区分を変えたときに呼ぶ。
 * 区分を選ぶと、いつもの組み合わせ（押すと薬と量が入る）と薬の候補をその区分のものに絞る
 */
function drugBlock(root, { kubuns, initial, onKubun = () => {}, presets = null, drugFirst = [] }) {
  const node = $('#drugBlockTpl').content.firstElementChild.cloneNode(true);
  const key = `db${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const kubunBox = $('.db-kubun', node);
  const block = {
    node,
    list: $('.db-list', node),
    kubun: () => value(null, kubunBox),
    presets, // 区分に関わらず出す組み合わせ（分娩の投薬）。null なら「いつもの組み合わせ」の区分のもの
    drugFirst, // 薬の候補で先に出す薬（分娩の投薬）
  };
  segment(kubunBox, `${key}-kubun`, kubuns, kubuns.includes(initial) ? initial : kubuns[0]);
  $('.db-kubun-box', node).hidden = kubuns.length < 2;
  $$('input', kubunBox).forEach((el) => el.addEventListener('change', () => {
    applyKubun(block);
    onKubun(block.kubun());
  }));
  $('.db-add', node).addEventListener('click', () => addDrug(block));
  root.append(node);
  applyKubun(block);
  return block;
}

/** 治療区分が変わったとき: いつもの組み合わせ・薬の候補を出し直す（薬は空の1行に戻す） */
function applyKubun(block) {
  const kubun = block.kubun();
  const box = $('.db-presets', block.node);
  box.textContent = '';
  const presets = block.presets || (state.presets || []).filter((p) => p.kubun === kubun);
  $('.db-preset-box', block.node).hidden = !presets.length;
  presets.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-btn';
    b.textContent = p.label;
    b.addEventListener('click', () => {
      $$('.preset-btn', box).forEach((x) => x.classList.toggle('on', x === b));
      block.list.textContent = '';
      p.drugs.forEach((d) => addDrug(block, d));
      state.pendingId = '';
    });
    box.append(b);
  });
  block.list.textContent = '';
  addDrug(block);
}

/**
 * 治療区分で絞った薬の候補。「薬」タブは区分ごとに使われやすい順に並んでいるので、その順のまま出す
 * （治療区分の列が空の薬はどの区分でも出す）
 */
function drugsForKubun(kubun) {
  const seen = new Set();
  return state.drugs.filter((d) => {
    if (d.kubun && d.kubun.length && !d.kubun.includes(kubun)) return false;
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

/** 薬の行（いつもの量・単位・投薬区分）。同じ薬でも区分で量が違うことがあるので、選んでいる区分の行を先に見る */
function findDrug(name, kubun) {
  return state.drugs.find((x) => x.name === name && (x.kubun || []).includes(kubun))
    || state.drugs.find((x) => x.name === name);
}

/**
 * 薬の1行: 薬を選ぶと、いつもの量・単位・投薬区分が入る。単位と投薬区分は文字で出し、投薬区分は押すと選び直せる。
 * 無い薬は「その他（入力）」で名前・単位・投薬区分を入れる。preset（いつもの組み合わせの薬）があればそれで埋める
 */
function addDrug(block, preset) {
  const list = block.list;
  if (list.children.length >= MAX_DRUGS) return;
  const node = $('#drugTpl').content.firstElementChild.cloneNode(true);
  const nameEl = $('.d-name', node);
  const names = [...new Set(block.drugFirst.concat(drugsForKubun(block.kubun()).map((d) => d.name)))];
  if (preset && !names.includes(preset.name)) names.push(preset.name);
  fillSelect(nameEl, names, '薬を選ぶ');
  nameEl.append(new Option('その他（入力）', OTHER));
  fillSelect($('.d-route', node), state.choices.route, '投薬区分');
  const routeSel = $('.d-route', node);
  const routeBtn = $('.d-route-label', node);
  const setUnit = (unit) => {
    $('.d-unit', node).value = unit;
    $('.d-unit-label', node).textContent = unit;
  };
  const setRoute = (route) => {
    routeSel.value = state.choices.route.includes(route) ? route : '';
    routeBtn.textContent = routeSel.value || '投薬区分';
  };
  routeBtn.addEventListener('click', () => {
    routeBtn.hidden = true;
    routeSel.hidden = false;
    routeSel.focus();
  });
  routeSel.addEventListener('change', () => setRoute(routeSel.value));
  nameEl.addEventListener('change', () => {
    const other = nameEl.value === OTHER;
    $('.d-other', node).hidden = !other;
    // その他の薬は単位と投薬区分をその場で入れる
    $('.d-unit', node).hidden = !other;
    $('.d-unit-label', node).hidden = other;
    routeSel.hidden = !other;
    routeBtn.hidden = other;
    const d = findDrug(nameEl.value, block.kubun());
    $('.d-qty', node).value = d ? d.qty : '';
    setUnit(d ? d.unit : '');
    setRoute(d ? d.route : '');
  });
  $('.d-del', node).addEventListener('click', () => {
    node.remove();
    renumberDrugs(block);
    state.pendingId = '';
  });
  list.append(node);
  if (preset) {
    nameEl.value = preset.name;
    nameEl.dispatchEvent(new Event('change'));
    const m = String(preset.qty || '').match(/^([\d.]+)\s*(.*)$/);
    $('.d-qty', node).value = m ? m[1] : '';
    if (m && m[2]) setUnit(m[2]);
    if (preset.route) setRoute(preset.route);
  } else {
    setRoute('');
  }
  renumberDrugs(block);
}

function renumberDrugs(block) {
  const nodes = $$('.drug', block.list);
  nodes.forEach((n) => { $('.d-del', n).hidden = nodes.length === 1; });
  $('.db-add', block.node).hidden = nodes.length >= MAX_DRUGS;
}

/** 投薬の欄の薬（名前か量が入っている行だけ。その他（入力）の薬は入れた名前・単位） */
function collectDrugs(block) {
  return $$('.drug', block.list).map((n) => ({
    name: $('.d-name', n).value === OTHER ? $('.d-other', n).value.trim() : $('.d-name', n).value,
    qty: $('.d-qty', n).value.trim(),
    unit: $('.d-unit', n).value.trim(),
    route: $('.d-route', n).value,
  })).filter((d) => d.name || d.qty);
}

/** 投薬の欄のチェック: 治療区分と薬（1つ以上。その他は名前を入れる。量は数字） */
function validateDrugBlock(block, drugs, bad) {
  if (!block.kubun()) bad($('.db-kubun', block.node), '治療区分を選んでください');
  const nodes = $$('.drug', block.list);
  if (!drugs.length) bad($('.d-name', nodes[0]), '薬を選んでください');
  nodes.forEach((n, i) => {
    const no = nodes.length > 1 ? `薬${i + 1}` : '薬';
    const sel = $('.d-name', n);
    const name = sel.value === OTHER ? $('.d-other', n).value.trim() : sel.value;
    const qty = $('.d-qty', n).value.trim();
    if (!name && qty) bad(sel.value === OTHER ? $('.d-other', n) : sel, `${no}を選んでください`);
    if (sel.value === OTHER && !name) bad($('.d-other', n), `${no}の名前を入れてください`);
    if (qty && !(Number(qty) > 0)) bad($('.d-qty', n), `${no}の量を確認してください`);
  });
}

/** 薬は「名前 量」を1行にまとめる（「メロキシリン注5% 5ml、トラムリン注 5ml」） */
function drugsLine(drugs) {
  return drugs.map((d) => [d.name, d.qty ? `${d.qty}${d.unit}` : ''].filter(Boolean).join(' ')).join('、');
}

// ---------- 一緒に入れる投薬（分娩・疾病・乳房炎・乾乳） ----------

/**
 * 一緒に入れる投薬（分娩・疾病・乳房炎・乾乳。出すかは Apps Script の attachKubun、欄の決まりは REPORTS の tx）。
 * チェックを入れると投薬の欄が開き、送ると「治療」タブにも同じ牛の行が入る。
 * 分娩は予防的投与か治療、ほかは治療。乾乳は乾乳セット（いつもの組み合わせの「乾乳：」）が入った状態で開く
 */
function setupTx() {
  const kubuns = state.attachKubun[ACTIVITY];
  const tx = INFO.tx || {};
  $('#txCard').hidden = !kubuns;
  if (!kubuns) return;
  $('#txLabel').textContent = tx.label || '治療（投薬）も入れる';
  // 分娩は「分娩の投薬」タブの組み合わせと薬を先に出す（乾乳セットなどほかの組み合わせは出さない）
  const calving = tx.calving ? { presets: state.calving.presets, drugFirst: state.calving.drugs } : {};
  state.txBlock = drugBlock($('#txBlock'), { kubuns, initial: kubuns[0], ...calving });
  $('#txOn').addEventListener('change', applyTx);
  if (tx.checked) {
    $('#txOn').checked = true;
    pickTxPreset(tx.preset);
  }
  applyTx();
}

function applyTx() {
  $('#txBlock').hidden = !$('#txOn').checked;
}

/** いつもの組み合わせのうち、名前が name で始まるもの（「乾乳：…」）を押した状態にする */
function pickTxPreset(name) {
  const b = name && $$('.preset-btn', state.txBlock.node).find((x) => x.textContent.startsWith(name));
  if (b) b.click();
}

/** 一緒に入れる投薬（チェックが入っていなければ null） */
function collectTx() {
  return state.txBlock && $('#txOn').checked ? { kubun: state.txBlock.kubun(), drugs: collectDrugs(state.txBlock) } : null;
}

// ---------- 引き継ぎの型 ----------

function currentTemplate() {
  return state.handover.find((t) => t.name === value('hTarget')) || null;
}

/**
 * 引き継ぎの型の項目の欄。文 → 文字の欄、選択 → ボタン、複数選択 → 複数選べるボタン、日付 → 日付、数 → 数字。
 * 曜日の選択（月曜：…）は明日の曜日、「毎月○日」の選択は明日の日付に合うものを最初から選んでおく
 */
function renderHandover() {
  const t = currentTemplate();
  const box = $('#hItems');
  box.textContent = '';
  if (!t) return;
  handoverBoardNote();
  const tomorrow = new Date(Date.now() + 86400000);
  const wd = '日月火水木金土'[tomorrow.getDay()];
  t.items.forEach((it, i) => {
    const card = document.createElement('section');
    card.className = 'card h-item';
    card.dataset.item = it.name;
    card.dataset.type = it.type;
    const key = `h${i}`;
    if (it.type === '選択' || it.type === '複数選択') {
      card.innerHTML = '<div class="field"><span class="label"></span><div class="seg"></div><p class="hint"></p></div>';
      const seg = $('.seg', card);
      if (it.type === '選択') {
        const pick = it.options.find((o) => o.startsWith(`${wd}曜`))
          || it.options.find((o) => o.startsWith(`毎月${tomorrow.getDate()}日`))
          || (it.options.some((o) => o.startsWith('毎月')) ? it.options.find((o) => o.includes('該当しない')) : '') || '';
        segment(seg, key, it.options, pick);
      } else {
        multiSegment(seg, key, it.options, []);
      }
      if (it.options.some((o) => o.length > 8)) seg.classList.add('seg-wrap');
    } else {
      card.innerHTML = '<label class="field"><span></span><textarea rows="2"></textarea></label><p class="hint"></p>';
      if (it.type === '日付' || it.type === '数') {
        const input = document.createElement('input');
        input.type = it.type === '日付' ? 'date' : 'number';
        if (it.type === '数') input.inputMode = 'decimal';
        $('textarea', card).replaceWith(input);
      }
    }
    $('.label, span', card).textContent = it.name;
    $('.hint', card).textContent = it.note;
    $('.hint', card).hidden = !it.note;
    box.append(card);
  });
  renderSay();
  pickHandoverBoard();
}

/** 引き継ぎの値（項目名 → 値。複数選択は配列） */
function collectHandover() {
  const items = {};
  $$('#hItems .h-item').forEach((card) => {
    const type = card.dataset.type;
    if (type === '選択') items[card.dataset.item] = value(null, card);
    else if (type === '複数選択') items[card.dataset.item] = values($('.seg', card));
    else items[card.dataset.item] = ($('textarea, input', card).value || '').trim();
  });
  return items;
}

/**
 * 引き継ぎの投稿先の案内。掲示板に書き込めないとき（アプリに board の権限が無い・書き込めない掲示板）は、
 * 確認の画面で選んだトークに同じ項目・順番の文で投稿することを伝える
 */
function handoverBoardNote() {
  const t = currentTemplate();
  const note = $('#hBoardNote');
  if (!t || !t.board) {
    note.textContent = '';
    return;
  }
  const ok = state.boards.some((b) => b.name === t.board);
  note.textContent = ok || !state.boardsLoaded
    ? `投稿先: 掲示板「${t.board}」（掲示板の型と同じ項目・順番）`
    : `掲示板「${t.board}」には今は投稿できません（掲示板の権限がまだ無いか、書き込めない掲示板）。掲示板と同じ項目・順番の文で、確認の画面で選んだトークに投稿します`;
}

/** 引き継ぎ先の掲示板を投稿先にする（掲示板の一覧が読めたとき） */
function pickHandoverBoard() {
  const t = currentTemplate();
  if (!t || !t.board || !state.boards.length) return;
  const b = state.boards.find((x) => x.name === t.board);
  if (b) $('#dest').value = BOARD + b.boardId;
}

// ---------- 採卵の処置 ----------

function currentStep() {
  return state.sairanSteps.find((s) => s.name === value('sStep')) || null;
}

function showStepDrugs() {
  const step = currentStep();
  $('#sStepDrugs').textContent = step
    ? `入る薬: ${step.drugs.map((d) => [d.name, d.qty, d.route].filter(Boolean).join(' ')).join('、')}`
    : '処置を選ぶと、Farmnote に入る薬が出ます';
}
