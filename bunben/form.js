'use strict';

// ===== フォーム・確認・送信・トークのカード =====
// 種類ごとの違い（欄・送る中身・入力チェック・続けて入力・カードの行）は reports.js の REPORTS。ここは全部の報告で共通の流れ

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
  $('#appVersion').textContent = `画面の版 ${APP_VERSION}`; // 古い画面のままか見分けるため
  $('#damTag').addEventListener('input', showDamHits);
  fixTagOnBlur($('#damTag'));
  $('#damId').addEventListener('input', onDamId);
  // 子牛の持ち主（頭5桁）は母牛で決まる
  ['input', 'change'].forEach((ev) => {
    $('#damTag').addEventListener(ev, onDamChange);
    $('#damId').addEventListener(ev, onDamChange);
  });
  $('#next').addEventListener('click', onNext);
  $('#back').addEventListener('click', onBack);

  // 内容が変わったら受付IDを作り直す（同じ受付IDは「送信済み」とみなされるため）
  $('#form').addEventListener('input', () => { state.pendingId = ''; });
  $('#form').addEventListener('change', () => { state.pendingId = ''; });

  $(`#${INFO.fields || ACTIVITY}Fields`).hidden = false;
  // 1頭の牛の欄（cowCard）か複数頭の欄（multiCow）。牛群移動は移動先のカードで牛を入れ、引き継ぎは牛が無い
  $('#cowCard').hidden = !INFO.cowCard;
  $('#multiCowCard').hidden = !INFO.multiCow;
  if (INFO.multiCow) {
    $('#addCowRow').addEventListener('click', () => {
      const tag = addCowRow();
      if (tag) tag.focus();
    });
    addCowRow();
  }
  if (INFO.setup) INFO.setup();
  setupHerd();
  setupTx();
  setupVoice();
  setupDest();
  trackTouched();
  applyFarm();
  loadBoards();
}

/**
 * 確認の画面の投稿先。既定は開いたトーク（本人名義）。ほかのトーク（「投稿先」タブで名前の付いた、開いたことのあるトーク）は
 * Bot 名義で投稿する。掲示板（書き込める掲示板）は本人名義で投稿する。引き継ぎメモは掲示板が既定。
 * トーク以外から開いたときは前回選んだ投稿先か「投稿しない（文面をコピー）」
 */
function setupDest() {
  const sel = $('#dest');
  const boards = $('optgroup', sel);
  const cur = sel.value;
  sel.textContent = '';
  const hereName = state.channel && state.channel.name;
  if (state.canPost) sel.append(new Option(hereName ? `このトーク（${hereName}）` : 'このトーク', HERE));
  state.destinations.forEach((c) => sel.append(new Option(c.name, c.channelId)));
  if (!state.canPost) sel.append(new Option('トークに投稿しない（文面をコピーして貼る）', COPY));
  const last = (loadSaved().dest || {})[ACTIVITY];
  if (!state.canPost) sel.value = [...sel.options].some((o) => o.value === last) ? last : COPY;
  if (boards) sel.append(boards);
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  // 候補が1つでも出す（どこに投稿されるかを確認の画面で見られるように）
  sel.onchange = showPostNote;
  $('#farmnoteField').hidden = !INFO.farmnote;
  $('#farmnoteHint').hidden = !INFO.farmnote;
}

/** 書き込める掲示板を読み、投稿先に足す（Developer Console のアプリに board の権限が無いときは出ない） */
async function loadBoards() {
  if (TRIAL || !state.token) return;
  try {
    const res = await api('boards');
    state.boards = res.boards || [];
  } catch (_) {
    state.boards = [];
  }
  state.boardsLoaded = true;
  const sel = $('#dest');
  if (!state.boards.length || $('optgroup', sel)) {
    if (INFO.onBoards) INFO.onBoards();
    return;
  }
  const group = document.createElement('optgroup');
  group.label = '掲示板';
  state.boards.forEach((b) => group.append(new Option(b.name, BOARD + b.boardId)));
  sel.append(group);
  // 掲示板が既定の報告（引き継ぎ）は、前回選んだ掲示板、無ければ名前に boardFirst の語が入った掲示板。トーク以外から開いたときは前回の投稿先
  const last = (loadSaved().dest || {})[ACTIVITY];
  const options = [...group.children];
  const pick = options.find((o) => o.value === last)
    || (INFO.boardFirst ? options.find((o) => o.textContent.includes(INFO.boardFirst)) : null);
  if (pick && (INFO.boardFirst || !state.canPost)) sel.value = pick.value;
  if (INFO.onBoards) INFO.onBoards();
  if (state.view === 'confirm') showPostNote();
}

/** 選んでいる投稿先: 開いたトーク（woff）・ほかのトーク（bot）・掲示板（board）。投稿しないときは null */
function currentDest() {
  const v = $('#dest').value;
  const name = ($('#dest').selectedOptions[0] || {}).textContent || '';
  if (v === HERE) return { channelId: state.channelId, via: 'woff', name };
  if (v.startsWith(BOARD)) return { boardId: v.slice(BOARD.length), via: 'board', name };
  if (v && v !== COPY) return { channelId: v, via: 'bot', name };
  return null;
}

function showPostNote() {
  const dest = currentDest();
  $('#postNote').textContent = !dest
    ? 'スプレッドシートに保存します。トークへは、送信後に出る文面をコピーして貼ってください。'
    : dest.via === 'woff'
      ? '送信すると、スプレッドシートに保存し、このトークルームにあなたの名前で投稿します。'
      : dest.via === 'board'
        ? `送信すると、スプレッドシートに保存し、掲示板「${dest.name}」にあなたの名前で投稿します。`
        : `送信すると、スプレッドシートに保存し、トーク「${dest.name}」に Bot「FDP報告ボタン」の名前で投稿します（カードにあなたの名前が入ります）。`;
}

// ---------- 確認・送信 ----------

/** 送る中身。牧場・牛・日付・作業者は共通で、ほかは報告の種類ごと（REPORTS の collect） */
function collect() {
  const base = {
    activity: ACTIVITY,
    farm: $('#farm').value,
    damTag: fixTag($('#damTag').value),
    damId: $('#damId').value.trim(),
    date: $('#date').value,
    worker: $('#worker').value,
  };
  return INFO.collect(base);
}

/**
 * 入力チェック。エラーの文の一覧を返し、直すところに赤い枠を付ける。
 * 牛を自分の欄で入れる種類（牛群移動・治療など）と引き継ぎは、種類ごとのチェックを共通のチェックより前に、
 * 1頭の牛の欄（cowCard）の種類は後に並べる（上から順に直せるように、画面の並びに合わせる）
 */
function validate(r) {
  const errors = [];
  const bad = (el, msg) => {
    if (el) el.classList.add('invalid');
    errors.push(msg);
  };
  $$('.invalid').forEach((el) => el.classList.remove('invalid'));
  if (!r.farm) bad($('#farm'), '牧場を選んでください');
  if (INFO.cowCard && !r.damTag && !r.damId) {
    bad($('#damTag'), `${INFO.cow}の耳標か個体識別番号を入れてください`);
    $('#damId').classList.add('invalid');
  }
  if (r.damId && r.damId.length !== 10) bad($('#damId'), `${INFO.cow}の個体識別番号は10桁です`);
  if (!INFO.cowCard && INFO.validate) INFO.validate(r, bad);
  if (INFO.herdLabel && !r.herd) bad($('#herd'), `${INFO.herdLabel}を選んでください`);
  if (!r.date) bad($('#date'), `${INFO.date}を入れてください`);
  else if (r.date > today()) bad($('#date'), `${INFO.date}が未来になっています`);
  if (!r.worker) bad($('#worker'), '作業者を選んでください');
  if (r.treatment) validateDrugBlock(state.txBlock, r.treatment.drugs, bad);
  if (INFO.cowCard && INFO.validate) INFO.validate(r, bad);
  return errors;
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
  renderUncertain($('#confirmUncertain'), state.voice.uncertain);
  showPostNote();
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
  const id = state.pendingId;
  const destValue = $('#dest').value;
  const dest = currentDest();
  try {
    const res = await api('submit', {
      report: {
        ...state.report,
        id,
        farmnote: !INFO.farmnote || $('#farmnote').checked,
        // 声で入れたときは、要確認と話した内容もシートに残す
        inputMethod: state.voice.used ? '声あり' : '手だけ',
        uncertain: state.voice.uncertain,
        transcript: state.voice.transcript,
        dest,
      },
    });
    // 時刻はシートに記録された送信時刻を使う
    const report = state.report;
    state.lastPost = res.post || null;
    const message = buildMessage(report, res.time);
    remember(report, destValue);
    state.pendingId = '';
    $('#doneMessage').textContent = message;
    $('#copyBox').hidden = true;
    // 二重送信（何も保存していない）のときは「保存しました」と出さない
    $('#doneText').textContent = res.duplicate ? '送信済みでした' : `保存しました（${res.rows}行）`;
    if (res.duplicate) {
      $('#doneNote').textContent = 'この内容は送信済みでした（二重には保存していません）';
    } else if (dest && dest.via === 'woff') {
      // 保存できた時点で完了画面を出し、トークへの投稿はその後に続ける
      $('#doneNote').textContent = 'スプレッドシートに保存しました。トークに投稿しています…';
      postToTalk(report, res.time, message);
    } else if (dest && dest.via === 'board') {
      $('#doneNote').textContent = `スプレッドシートに保存しました。掲示板「${dest.name}」に投稿しています…`;
      postViaBoard(report, id, dest, res.time);
    } else if (dest) {
      $('#doneNote').textContent = `スプレッドシートに保存しました。トーク「${dest.name}」に投稿しています…`;
      postViaBot(report, id, dest.channelId, dest.name, res.time);
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

/** ほかのトークに Bot「FDP報告ボタン」名義で投稿する（Apps Script が送る。カードに「報告: 名前」が入る） */
async function postViaBot(report, id, channelId, name, time) {
  state.posting = true;
  $('#back').disabled = true;
  try {
    await api('post', { activity: report.activity, id, channelId, flex: buildFlex(report, time) });
    $('#doneNote').textContent = `スプレッドシートに保存し、トーク「${name}」にも投稿しました`;
  } catch (e) {
    $('#doneNote').textContent = `${e.message}（スプレッドシートには保存済み）。下の文面を貼ってください`;
    $('#copyBox').hidden = false;
  } finally {
    state.posting = false;
    $('#back').disabled = false;
  }
}

/** 掲示板に本人名義で投稿する（Apps Script が送る）。件名は1行目、本文は残り。引き継ぎメモは区分ごとの見出し（■VMS など） */
async function postViaBoard(report, id, dest, time) {
  state.posting = true;
  $('#back').disabled = true;
  try {
    const { title, text } = boardContent(report, time);
    await api('post', { activity: report.activity, id, boardId: dest.boardId, boardName: dest.name, title, text });
    $('#doneNote').textContent = `スプレッドシートに保存し、掲示板「${dest.name}」にも投稿しました`;
  } catch (e) {
    $('#doneNote').textContent = `${e.message}（スプレッドシートには保存済み）。下の文面を貼ってください`;
    $('#copyBox').hidden = false;
  } finally {
    state.posting = false;
    $('#back').disabled = false;
  }
}

function boardContent(r, time) {
  // 引き継ぎは、保存したときに Apps Script が引き継ぎの型で作った件名・本文（シートの行と同じ）
  if (r.activity === 'hikitsugi' && state.lastPost) return state.lastPost;
  const [first, ...rest] = buildMessage(r, time).split('\n');
  return { title: first, text: rest.join('\n') || first };
}

/** 続けて入力: 牧場・作業者・日付は残し、牛ごとの内容を空にする（何を残すかは REPORTS の reset） */
function resetForNext() {
  ['#damTag', '#damId'].forEach((s) => { $(s).value = ''; });
  $('#damHits').textContent = '';
  resetVoice();
  // 一緒に入れる投薬は外す（乾乳の乾乳セットのように、続けて入れることが多いもの（tx.keep）は残す）
  if (state.txBlock && !(INFO.tx && INFO.tx.keep)) {
    $('#txOn').checked = false;
    applyTx();
  }
  if (INFO.reset) INFO.reset();
  $('#farmnote').checked = true; // Farmnote に登録するかは報告ごとに選ぶ（既定は登録する）
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

// ---------- トークに投稿する文面・カード ----------

/**
 * トークに投稿する見出しと「項目：内容」の行（テキストとカードの両方で使う。シートの保存内容とは別）。
 * トークで読みやすいよう短くする: 日付は今日なら出さない（投稿時刻でわかる）、作業者は投稿した本人と違うとき（代理入力）だけ出す。
 * 種類ごとの行は REPORTS の card。メモ・作業者・一緒に入れた投薬は共通の行（tail）として後ろに付ける
 */
function reportRows(r, time) {
  const info = REPORTS[r.activity];
  const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ');
  const [, m, d] = r.date.split('-').map(Number);
  const isToday = r.date === today();
  const day = `${m}月${d}日`;
  const tail = [];
  if (r.memo) tail.push(['メモ', oneLine(r.memo)]);
  if (!isSelf(r.worker)) tail.push(['作業者', r.worker]);
  // 一緒に入れた投薬（分娩は区分も出す）
  if (r.treatment) {
    tail.unshift([(info.tx || {}).showKubun ? `投薬（${r.treatment.kubun}）` : '投薬', drugsLine(r.treatment.drugs)]);
  }
  return info.card(r, { cow: r.damTag || r.damId, day, isToday, time, tail, oneLine });
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
  const { title, rows, color } = reportRows(r, time);
  const headColor = color || (REPORTS[r.activity] || INFO).color; // 見出しの色は種類ごと（card が色を返したときはその色）
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

// ---------- 端末に覚えておくもの（牧場・作業者・投稿先） ----------

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

/** 次回のために牧場・作業者・投稿先を覚えておく（端末ごと。投稿先はトーク以外から開いたときの既定にする） */
function remember(r, dest) {
  try {
    const saved = loadSaved();
    saved.farm = r.farm;
    saved.workers = { ...(saved.workers || {}), [r.farm]: r.worker };
    if (dest && dest !== HERE) saved.dest = { ...(saved.dest || {}), [r.activity]: dest };
    const info = REPORTS[r.activity];
    if (info && info.remember) info.remember(saved, r); // 治療区分・引き継ぎ先など、種類ごとに覚えるもの
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch (_) {
    // 保存できなくても入力には影響しない
  }
}
