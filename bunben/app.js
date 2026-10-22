'use strict';

// ===== デプロイ後に書き換える =====
const CONFIG = {
  woffId: '8IjjeCbtPxsinTC8-7cXug', // Developer Console（アプリ「分娩報告フォーム」の WOFF「分娩報告」）で発行された WOFF ID
  gasUrl: 'https://script.google.com/macros/s/AKfycbxeEl4u7byBq21WFH3mvap8JZ-HnzlqYByUhncD_jDPivvF98okpf0PI487SNvMh7Rcow/exec',
};

// 画面の版。送信のたびに Apps Script へ渡し、実行ログに残る（スマホが古い画面を使っていないかを見る）。
// index.html の app.js?v=… も同じ値にそろえる（古いファイルを使い回させないため）
const APP_VERSION = '2026-10-22d';

const PARAMS = new URLSearchParams(location.search);
const MOCK = PARAMS.has('mock');
// 試行モード（?trial=1）: WOFF を使わずブラウザで開く。キー（GAS の TRIAL_KEY）は初回に貼り付けてもらい、その端末に保存する
const TRIAL = PARAMS.has('trial');
// 報告の種類。トークルームの下のボタン（Bot の固定メニュー）から ?type=… で開く
// farmnote: 確認の画面に「Farmnote に登録する」を出すか（Farmnote に登録する報告か。GAS の ACTIVITIES と同じ）
// cowCard: 1頭の牛の欄を出すか、fields: 項目の欄（予防的投与は治療の欄を使う）、example: 「まとめて話す」の例、
// say: 話す順（声の入力の型）。一部だけ話して、残りをタップ・文字で入れてもよい
const ACTIVITY_INFO = {
  bunben: { title: '分娩の報告', cow: '母牛', date: '分娩日', color: '#2f7d4f', farmnote: true, cowCard: true,
    example: '例「ネの527番、出産、自然分娩。メス、ホルスタイン、40キロ。ニュートレス500、メロキシリン5」',
    say: ['母牛の番号（ネの527番）', '出産・死産・流産', '分娩難易（自然分娩・介助）', '生まれていた か 立ち会った か',
      '子牛の性別・品種・体重（メス、ホルスタイン、40キロ）', '子牛の個体識別番号（わかれば）', '母牛に入れた薬と量（ニュートレス500、メロキシリン5）'] },
  shippei: { title: '疾病の報告', cow: '牛', date: '発生日', color: '#b45309', farmnote: true, cowCard: true,
    example: '例「Dの295番、2群で第四胃食滞、体温38.5度、自家治療。ウルソ40打った」',
    say: ['牛の番号', '発生した牛群（2群で・VICで）', '疾病名', '体温（39度5分）', '獣医か自家治療か・再診・抗生剤', '入れた薬と量'] },
  nyuboen: { title: '乳房炎（疑い）の報告', cow: '牛', date: '発生日', color: '#c2410c', farmnote: true, cowCard: true,
    example: '例「ネの446番、右後ろ、乳房炎の疑い。体温39.5。セフロキシム1本」',
    say: ['牛の番号', '分房（右後ろ）', '原因菌（わかれば。OS・CO など。分からなければ言わない）', '体温', '入れた薬と量'] },
  sakutei: { title: '応急削蹄の依頼', cow: '牛', date: '依頼日', color: '#78716c', farmnote: true,
    example: '例「ネの371番、左前を気にしてる。明日、内田さんに応急削蹄」',
    say: ['牛の番号（何頭でも）', '気になる肢（わかれば）', 'いつ（明日・木曜）', '削蹄師さん・様子（メモ）'] },
  kiroku: { title: '個体の記録', cow: '牛', date: '記録日', color: '#0f766e', farmnote: true, cowCard: true,
    example: '例「ネの146番、分娩10日後検診、問題なし」',
    say: ['牛の番号', '記録すること（検診の結果・PL・提出したこと など）', '体重・BCS（あれば）'] },
  kannyu: { title: '乾乳の報告', cow: '牛', date: '乾乳日', color: '#4338ca', farmnote: true, cowCard: true,
    example: '例「ネの300番、乾乳。いつものセット」',
    say: ['牛の番号', '乾乳セット以外に入れた薬（あれば）', 'メモ'] },
  haiyou: { title: '死亡・廃用の報告', cow: '牛', date: '死亡・廃用の日', color: '#4b5563', farmnote: true, cowCard: true,
    example: '例「Dの356番、死亡、起立不能」',
    say: ['牛の番号', '死亡か淘汰か', '理由'] },
  idou: { title: '牛群移動の報告', cow: '牛', date: '移動日', color: '#1d5fa8', farmnote: true,
    example: '例「ネの446番とネの464番を3群に移動」',
    say: ['牛の番号', '移動先の牛群（3群に・VICに）'] },
  chiryou: { title: '治療の報告', cow: '牛', date: '治療日', color: '#6d28d9', farmnote: true,
    example: '例「ネの145番、乳房炎疑い、メロキシリン5ミリ」',
    say: ['牛の番号（同じ処置なら何頭でも）', '治療区分（治療・ワクチン など）', '薬と量', '疾病名・体温（治療のとき）'] },
  yobou: { title: '予防的投与の報告', cow: '牛', date: '投与日', color: '#7c3aed', farmnote: true, fields: 'chiryou',
    example: '例「Kの1547番、コクシックス30ミリ」',
    say: ['牛の番号（何頭でも）', '薬と量'] },
  sairan: { title: '採卵用プログラム', cow: '牛', date: '処置日', color: '#be185d', farmnote: true,
    example: '例「採卵SDの501番、7日目の夕方」',
    say: ['牛の番号', '処置（7日目の夕方 など）'] },
  hikitsugi: { title: '引き継ぎ', cow: '', date: '日付', color: '#334155', farmnote: false,
    example: '例「1号機の要注意牛はネの41、左前を痛がってる。スラリーは送らないで」',
    say: [] }, // 引き継ぎ先の型の項目を順に出す
};
// トークルームの下のボタン「疾病・乳房炎」（?type=sick）と「ほかの報告」（?type=other）から選ぶ種類
const CHOOSERS = {
  sick: { title: '疾病・乳房炎', types: [
    ['shippei', '疾病', '疾病名・体温・獣医か自家治療か（治療も一緒に入れられる）'],
    ['nyuboen', '乳房炎（疑い）', '分房・体温。原因菌は分からなくてよい（治療も一緒に入れられる）'],
  ] },
  other: { title: 'ほかの報告', types: [
    ['sakutei', '応急削蹄の依頼', '蹄病は断定せず、削蹄の予定を作る'],
    ['kiroku', '個体の記録', '検診の結果・所見など。体重・BCS'],
    ['sairan', '採卵用プログラム', 'OPU と体内採卵の各回の注射・シダー'],
    ['kannyu', '乾乳', '乾乳と乾乳セット'],
    ['yobou', '予防的投与', '薬・量（いつもの組み合わせ）'],
    ['hikitsugi', '引き継ぎ', 'VMS・AMR・ハーズマン（掲示板の引き継ぎの型どおりに投稿）'],
    ['haiyou', '死亡・廃用', '死亡・淘汰と理由'],
    ['chiryou', '治療（アブレスト以外）', 'ワクチン・繁殖治療など。薬・量・投薬区分'],
  ] },
};
const MAX_MOVES = 4; // 牛群移動の1回の報告で送れる頭数（GAS と同じ。5頭以上は PC で入れる）
const MAX_COWS = 10; // 治療・採卵の処置の1回の報告で送れる頭数（GAS と同じ）
const MAX_DRUGS = 10; // 治療の薬の数（GAS と同じ）
const HERDS_FIRST = 8; // 移動先の牛群は「牛群」タブの上から8つを出し、残りは「ほかの牛群」で開く
const PICKING = CHOOSERS[PARAMS.get('type')] || null; // 種類を選ぶ画面から始める
// 報告の種類。「疾病・乳房炎」「ほかの報告」から選んだときに決まるので let
let ACTIVITY = ACTIVITY_INFO[PARAMS.get('type')] ? PARAMS.get('type') : 'bunben';
let INFO = ACTIVITY_INFO[ACTIVITY];
const OTHER = '__other__'; // 疾病名・薬「その他（入力）」
const HERE = '__here__'; // 投稿先「このトーク」（開いたトークに本人名義で投稿）
const COPY = '__copy__'; // 投稿先「トークに投稿しない」（トーク以外から開いたとき。文面をコピーして貼る）
const BOARD = 'board:'; // 投稿先の掲示板（board:掲示板ID）
const VOICE_MAX_SEC = 180; // 1回の録音は3分まで
const HERD_ACTIVITIES = ['shippei', 'nyuboen', 'sakutei']; // どこの牛群で起きたかを入れる報告
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
  drugs: [],
  sairanSteps: [],
  attachKubun: {},
  calving: { presets: [], drugs: [] }, // 分娩のときに母牛に入れる投薬（「分娩の投薬」タブ）
  memoPhrases: [], // よく使うメモ
  handover: [], // 引き継ぎの型（引き継ぎ先ごとの項目）
  herdUnknown: 'わからない',
  lastPost: null, // 引き継ぎ: 保存したときに Apps Script が作った掲示板の件名と本文
  voiceOn: false, // Apps Script に OpenAI の API キーがあるか（無ければ「まとめて話す」は出さない）
  boards: [], // 書き込める掲示板（投稿先の候補）
  boardsLoaded: false, // 掲示板の一覧を読み終えたか（引き継ぎの投稿先の案内に使う）
  txBlock: null, // 一緒に入れる投薬の欄
  // 声で入れた結果（送信のときに要確認・文字起こしとして送る）
  voice: { used: false, transcript: '', uncertain: [], recorder: null, chunks: [], timer: null, busy: false },
  presets: [],
  canPost: false,
  channelId: '', // 開いたトーク（スマホアプリのトークから開いたときだけ）
  channel: null, // 開いたトークの { channelId, name }（名前は「投稿先」タブで管理者が付ける）
  destinations: [], // ほかに投稿できるトーク [{ channelId, name }]
  drugBlock: null, // 治療の投薬の欄
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
  if (MOCK) await loadScript(`mock.js?v=${APP_VERSION}`);
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
    state.channelId = await currentChannelId();
    state.canPost = Boolean(state.channelId);
  }
  let res;
  try {
    res = await api('config', { channelId: state.channelId });
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
  state.drugs = res.drugs || [];
  state.sairanSteps = res.sairanSteps || [];
  state.attachKubun = res.attachKubun || {};
  state.calving = res.calving || { presets: [], drugs: [] };
  state.memoPhrases = res.memoPhrases || [];
  state.handover = res.handover || [];
  state.herdUnknown = res.herdUnknown || 'わからない';
  state.voiceOn = Boolean(res.voice);
  state.presets = res.presets || [];
  state.channel = res.channel || null;
  state.destinations = res.destinations || [];
  if (!state.farms.length) throw new Error('設定シート「牧場」に牧場がありません');
  $('#loading').hidden = true;
  if (PARAMS.get('admin') === 'menu' && state.user.isAdmin) setupAdmin();
  if (PICKING) {
    showChooser();
    return;
  }
  openForm();
}

function openForm() {
  setupForm();
  $('#chooser').hidden = true;
  $('#footer').hidden = false;
  showView('form');
}

/** 「疾病・乳房炎」「ほかの報告」: 種類を選ぶ大きいボタン。押すとその報告のフォームになる */
function showChooser() {
  document.title = PICKING.title;
  $('#title').textContent = PICKING.title;
  $('#who').textContent = `${(state.user && state.user.name) || state.profile.displayName || ''} さん`;
  const box = $('#chooserButtons');
  PICKING.types.forEach(([type, label, note]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primary chooser-btn';
    b.style.background = ACTIVITY_INFO[type].color;
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = label;
    b.lastChild.textContent = note;
    b.addEventListener('click', () => {
      ACTIVITY = type;
      INFO = ACTIVITY_INFO[type];
      openForm();
    });
    box.append(b);
  });
  $('#chooser').hidden = false;
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

/** 開いたトークの channelId。スマホアプリのトークルームから開いたときだけ取れ、そのトークにだけ本人名義で投稿できる */
async function currentChannelId() {
  const os = woff.getOS();
  if (os !== 'ios' && os !== 'android') return '';
  try {
    // 応答が返らない環境でも読み込み中で止まらないよう、3秒で諦める（そのときは文面コピーで対応）
    const timeout = new Promise((resolve) => { setTimeout(() => resolve(''), 3000); });
    return String((await Promise.race([woff.getChannelId(), timeout])) || '');
  } catch (_) {
    return '';
  }
}

async function api(action, extra = {}) {
  let res;
  try {
    // Content-Type を付けない（text/plain）ことで、Apps Script へのプリフライトを避ける
    const auth = TRIAL ? { trialKey: state.trialKey } : { token: state.token, userId: state.profile.userId };
    res = await fetch(CONFIG.gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action, v: APP_VERSION, ...auth, ...extra }),
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
  $('#appVersion').textContent = `画面の版 ${APP_VERSION}`; // 古い画面のままか見分けるため
  $('#damTag').addEventListener('input', showDamHits);
  fixTagOnBlur($('#damTag'));
  $('#damId').addEventListener('input', onDamId);
  $('#next').addEventListener('click', onNext);
  $('#back').addEventListener('click', onBack);

  // 内容が変わったら受付IDを作り直す（同じ受付IDは「送信済み」とみなされるため）
  $('#form').addEventListener('input', () => { state.pendingId = ''; });
  $('#form').addEventListener('change', () => { state.pendingId = ''; });

  $(`#${INFO.fields || ACTIVITY}Fields`).hidden = false;
  // 1頭の牛の欄。牛群移動は移動先のカードで、治療・予防的投与・採卵用プログラムは複数頭の欄で牛を入れる。引き継ぎメモは牛が無い
  const multi = isMultiCow();
  $('#cowCard').hidden = !INFO.cowCard;
  $('#multiCowCard').hidden = !multi;
  if (multi) {
    $('#addCowRow').addEventListener('click', () => {
      const tag = addCowRow();
      if (tag) tag.focus();
    });
    addCowRow();
  }
  if (ACTIVITY === 'bunben') setupBunben();
  if (ACTIVITY === 'shippei') setupShippei();
  if (ACTIVITY === 'nyuboen') setupNyuboen();
  if (ACTIVITY === 'sakutei') setupSakutei();
  if (ACTIVITY === 'kiroku') setupKiroku();
  if (ACTIVITY === 'hikitsugi') setupHikitsugi();
  if (ACTIVITY === 'haiyou') setupHaiyou();
  if (ACTIVITY === 'idou') setupIdou();
  if (ACTIVITY === 'chiryou' || ACTIVITY === 'yobou') setupChiryou();
  if (ACTIVITY === 'sairan') setupSairan();
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
  sel.textContent = '';
  const hereName = state.channel && state.channel.name;
  if (state.canPost) sel.append(new Option(hereName ? `このトーク（${hereName}）` : 'このトーク', HERE));
  state.destinations.forEach((c) => sel.append(new Option(c.name, c.channelId)));
  if (!state.canPost) sel.append(new Option('トークに投稿しない（文面をコピーして貼る）', COPY));
  const last = (loadSaved().dest || {})[ACTIVITY];
  if (!state.canPost) sel.value = [...sel.options].some((o) => o.value === last) ? last : COPY;
  // 候補が1つでも出す（どこに投稿されるかを確認の画面で見られるように）
  sel.addEventListener('change', showPostNote);
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
    if (ACTIVITY === 'hikitsugi') handoverBoardNote();
    return;
  }
  const group = document.createElement('optgroup');
  group.label = '掲示板';
  state.boards.forEach((b) => group.append(new Option(b.name, BOARD + b.boardId)));
  sel.append(group);
  // 引き継ぎメモは掲示板が既定（前回選んだ掲示板、無ければ名前に「引き継ぎ」が入った掲示板）。トーク以外から開いたときは前回の投稿先
  const last = (loadSaved().dest || {})[ACTIVITY];
  const options = [...group.children];
  const pick = options.find((o) => o.value === last)
    || (ACTIVITY === 'hikitsugi' ? options.find((o) => o.textContent.includes('引き継ぎ')) : null);
  if (pick && (ACTIVITY === 'hikitsugi' || !state.canPost)) sel.value = pick.value;
  // 引き継ぎは、選んでいる引き継ぎ先の掲示板を投稿先にする
  if (ACTIVITY === 'hikitsugi') {
    pickHandoverBoard();
    handoverBoardNote();
  }
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

function isMultiCow() {
  return ACTIVITY === 'chiryou' || ACTIVITY === 'yobou' || ACTIVITY === 'sairan' || ACTIVITY === 'sakutei';
}

/** 乳房炎（疑い）: 分房は複数選べる。原因菌は検査のあとで分かることが多く、未特定なら「乳房炎疑い」として記録する */
function setupNyuboen() {
  multiSegment($('#nQuarters'), 'nQuarters', state.choices.quarter, []);
  fillSelect($('#nBacteria'), state.choices.bacteria, '未特定（疑い）');
  segment($('#nSeverity'), 'nSeverity', state.choices.severity, '');
}

/** どこの牛群で起きたか（疾病・乳房炎・応急削蹄の依頼）。「牛群」タブの牛群を行き先ごとにまとめ、最後に「わからない」 */
function setupHerd() {
  const on = HERD_ACTIVITIES.includes(ACTIVITY);
  $('#herdCard').hidden = !on;
  if (!on) return;
  $('#herdLabel').textContent = ACTIVITY === 'sakutei' ? '気づいた牛群（いる牛群）' : '発生した牛群';
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

/** 応急削蹄の依頼: 蹄病は断定せず、牛と予定日（既定は明日）だけ。気になる肢・メモは任意 */
function setupSakutei() {
  $('#kPlanned').value = dayAfter(1);
  $('#kPlanned').min = today();
  multiSegment($('#kLegs'), 'kLegs', state.choices.quarter, []);
}

/** 個体の記録: よく使うメモ（「よく使うメモ」タブ）のボタンを押すと、その文をメモに足す。{日付} は今日の「10/22」 */
function setupKiroku() {
  const box = $('#kPhrases');
  const list = state.memoPhrases.filter((x) => !x.activity || x.activity === '個体の記録');
  box.closest('.field').hidden = !list.length;
  list.forEach(({ label, text }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = phrase(label || text);
    b.addEventListener('click', () => {
      const el = $('#kMemo');
      const t = phrase(text);
      el.value = el.value.trim() ? `${el.value.trim()}\n${t}` : t;
      el.dataset.touched = '1';
      el.classList.remove('invalid');
      state.pendingId = '';
    });
    box.append(b);
  });
}

function phrase(text) {
  const d = new Date();
  return text.replace(/\{日付\}/g, `${d.getMonth() + 1}/${d.getDate()}`);
}

/**
 * 引き継ぎ: 引き継ぎ先（「引き継ぎの型」タブ）を選ぶと、その掲示板のテンプレートと同じ項目・順番の欄を出す。
 * 前回選んだ引き継ぎ先で開く（端末ごと）
 */
function setupHikitsugi() {
  const names = state.handover.map((t) => t.name);
  const last = loadSaved().handoverTarget;
  segment($('#hTarget'), 'hTarget', names, names.includes(last) ? last : names[0] || '');
  $$('#hTarget input').forEach((el) => el.addEventListener('change', renderHandover));
  renderHandover();
}

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

/**
 * 一緒に入れる投薬（分娩・疾病・乳房炎・乾乳）。チェックを入れると投薬の欄が開き、送ると「治療」タブにも同じ牛の行が入る。
 * 分娩は予防的投与か治療、ほかは治療。乾乳は乾乳セット（いつもの組み合わせの「乾乳：」）が入った状態で開く
 */
function setupTx() {
  const kubuns = state.attachKubun[ACTIVITY];
  $('#txCard').hidden = !kubuns;
  if (!kubuns) return;
  $('#txLabel').textContent = ACTIVITY === 'kannyu' ? '乾乳セット（投薬）も入れる'
    : ACTIVITY === 'bunben' ? '母牛への投薬も入れる（予防的投与・治療）' : '治療（投薬）も入れる';
  // 分娩は「分娩の投薬」タブの組み合わせと薬を先に出す（乾乳セットなどほかの組み合わせは出さない）
  const calving = ACTIVITY === 'bunben' ? { presets: state.calving.presets, drugFirst: state.calving.drugs } : {};
  state.txBlock = drugBlock($('#txBlock'), { kubuns, initial: kubuns[0], ...calving });
  $('#txOn').addEventListener('change', applyTx);
  if (ACTIVITY === 'kannyu') {
    $('#txOn').checked = true;
    pickDryPreset();
  }
  applyTx();
}

function applyTx() {
  $('#txBlock').hidden = !$('#txOn').checked;
}

/** 乾乳: いつもの組み合わせの「乾乳：…」を押した状態にする */
function pickDryPreset() {
  const b = $$('.preset-btn', state.txBlock.node).find((x) => x.textContent.startsWith('乾乳'));
  if (b) b.click();
}

/** 一緒に入れる投薬（チェックが入っていなければ null） */
function collectTx() {
  return state.txBlock && $('#txOn').checked ? { kubun: state.txBlock.kubun(), drugs: collectDrugs(state.txBlock) } : null;
}

/**
 * 治療: 治療区分は前回と同じものを選んでおく。区分・いつもの組み合わせ・薬は投薬の欄（drugBlock）。
 * 疾病名・体温・ステータスは区分が「治療」のときだけ出す
 */
function setupChiryou() {
  // 予防的投与の報告は区分が決まっている（区分の欄は隠れる）
  const yobou = ACTIVITY === 'yobou';
  state.drugBlock = drugBlock($('#cDrugBlock'), {
    kubuns: yobou ? ['予防的投与'] : state.choices.chiryouKubun,
    initial: yobou ? '予防的投与' : loadSaved().chiryouKubun,
    onKubun: applyChiryouDetail,
  });
  fillSelect($('#cDisease'), state.diseases, 'なし（入れない）');
  $('#cDisease').append(new Option('その他（入力）', OTHER));
  $('#cDisease').addEventListener('change', () => {
    $('#cDiseaseOtherField').hidden = $('#cDisease').value !== OTHER;
  });
  segment($('#cStatus'), 'cStatus', state.choices.status, '');
  applyChiryouDetail();
}

function applyChiryouDetail() {
  $('#cDetail').hidden = state.drugBlock.kubun() !== '治療';
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

/** 採卵の処置: 「採卵の処置」タブの処置を区分（OPU・体内採卵）ごとのボタンで出す。選ぶと使う薬が下に出る */
function setupSairan() {
  const box = $('#sSteps');
  const kubuns = [...new Set(state.sairanSteps.map((s) => s.kubun))];
  kubuns.forEach((k) => {
    if (k) {
      const h = document.createElement('div');
      h.className = 'step-group';
      h.textContent = k;
      box.append(h);
    }
    const seg = document.createElement('div');
    seg.className = 'seg sStepSeg';
    segment(seg, 'sStep', state.sairanSteps.filter((s) => s.kubun === k).map((s) => s.name), '');
    box.append(seg);
  });
  segment($('#sAsayu'), 'sAsayu', state.choices.asayu, '');
  $$('input[name="sStep"]', box).forEach((el) => el.addEventListener('change', () => {
    $$('.sStepSeg', box).forEach((s) => s.classList.remove('invalid'));
    showStepDrugs();
    // 処置の名前に朝・夕があれば合わせる
    const t = state.choices.asayu.find((x) => el.value.includes(x));
    if (t) check('sAsayu', t);
  }));
  showStepDrugs();
}

function currentStep() {
  return state.sairanSteps.find((s) => s.name === value('sStep')) || null;
}

function showStepDrugs() {
  const step = currentStep();
  $('#sStepDrugs').textContent = step
    ? `入る薬: ${step.drugs.map((d) => [d.name, d.qty, d.route].filter(Boolean).join(' ')).join('、')}`
    : '処置を選ぶと、Farmnote に入る薬が出ます';
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
  if (HERD_ACTIVITIES.includes(ACTIVITY)) renderHerdSelect();
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

/** 「牛群」タブの行き先（上から出てきた順）。フォームではタブとして出す */
function herdGroups() {
  return [...new Set(currentHerds().map((h) => h.group))];
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
      herd: $('#herd').value,
      memo: $('#sMemo').value.trim(),
      treatment: collectTx(),
    };
  }
  if (ACTIVITY === 'nyuboen') {
    return {
      ...base,
      quarters: values($('#nQuarters')),
      bacteria: $('#nBacteria').value,
      temp: $('#nTemp').value.trim(),
      severity: value('nSeverity'),
      herd: $('#herd').value,
      memo: $('#nMemo').value.trim(),
      treatment: collectTx(),
    };
  }
  if (ACTIVITY === 'sakutei') {
    return {
      ...base,
      damTag: '',
      damId: '',
      cows: $$('#cowList .m-cow').map(readCowRow).filter(Boolean),
      legs: values($('#kLegs')),
      plannedDate: $('#kPlanned').value,
      herd: $('#herd').value,
      memo: $('#kSMemo').value.trim(),
    };
  }
  if (ACTIVITY === 'kiroku') {
    return { ...base, memo: $('#kMemo').value.trim(), weight: $('#kWeight').value.trim(), bcs: $('#kBcs').value.trim() };
  }
  if (ACTIVITY === 'kannyu') {
    return { ...base, memo: $('#kaMemo').value.trim(), treatment: collectTx() };
  }
  if (ACTIVITY === 'hikitsugi') {
    return {
      ...base,
      damTag: '',
      damId: '',
      memo: '',
      target: value('hTarget'),
      items: collectHandover(),
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
      moves: $$('#moveGroups .mgroup').flatMap((g) => $$('.m-cow', g).map(readCowRow).filter(Boolean).map((c) => ({
        ...c,
        herd: g.dataset.herd,
        dir: g.dataset.herd ? g.dataset.group : '', // トークに出す行き先（シートには保存しない）
      }))),
    };
  }
  if (ACTIVITY === 'chiryou' || ACTIVITY === 'yobou') {
    const kubun = state.drugBlock.kubun();
    const detail = kubun === '治療';
    return {
      ...base,
      damTag: '',
      damId: '',
      cows: $$('#cowList .m-cow').map(readCowRow).filter(Boolean),
      kubun,
      // 疾病名・体温・ステータスは「治療」のときだけ（ほかの区分では隠れているので送らない）
      disease: !detail ? '' : $('#cDisease').value === OTHER ? $('#cDiseaseOther').value.trim() : $('#cDisease').value,
      temp: detail ? $('#cTemp').value.trim() : '',
      status: detail ? value('cStatus') : '',
      drugs: collectDrugs(state.drugBlock),
      memo: $('#cMemo').value.trim(),
    };
  }
  if (ACTIVITY === 'sairan') {
    return {
      ...base,
      damTag: '',
      damId: '',
      cows: $$('#cowList .m-cow').map(readCowRow).filter(Boolean),
      step: value('sStep'),
      asayu: value('sAsayu'),
      memo: $('#srMemo').value.trim(),
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
    treatment: collectTx(),
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
  const ownCows = !INFO.cowCard; // 牛を自分の欄で入れる種類（牛群移動・治療など）と、牛の無い引き継ぎメモ
  if (!ownCows && !r.damTag && !r.damId) {
    bad($('#damTag'), `${INFO.cow}の耳標か個体識別番号を入れてください`);
    $('#damId').classList.add('invalid');
  }
  if (r.damId && r.damId.length !== 10) bad($('#damId'), `${INFO.cow}の個体識別番号は10桁です`);
  if (ACTIVITY === 'idou') validateMoves(r, bad);
  if (ACTIVITY === 'chiryou' || ACTIVITY === 'yobou') validateChiryou(r, bad);
  if (ACTIVITY === 'sairan') validateSairan(r, bad);
  if (ACTIVITY === 'hikitsugi') {
    if (!r.target) bad($('#hTarget'), '引き継ぎ先を選んでください');
    else if (!Object.values(r.items).some((v) => (Array.isArray(v) ? v.length : v))) bad($('#hItems .h-item textarea, #hItems .h-item input'), '引き継ぐことを入れてください');
  }
  if (ACTIVITY === 'sakutei') {
    checkCowRows($$('#cowList .m-cow'), bad, new Set(), '');
    if (!r.plannedDate) bad($('#kPlanned'), '応急削蹄の予定日を入れてください');
    else if (r.plannedDate < today()) bad($('#kPlanned'), '応急削蹄の予定日が過去になっています');
  }
  if (HERD_ACTIVITIES.includes(ACTIVITY) && !r.herd) bad($('#herd'), `${$('#herdLabel').textContent}を選んでください`);
  if (!r.date) bad($('#date'), `${INFO.date}を入れてください`);
  else if (r.date > today()) bad($('#date'), `${INFO.date}が未来になっています`);
  if (!r.worker) bad($('#worker'), '作業者を選んでください');
  if (r.treatment) validateDrugBlock(state.txBlock, r.treatment.drugs, bad);
  if (ownCows) return errors;
  const tempOk = (t) => !t || (Number(t) >= 35 && Number(t) <= 43);
  if (ACTIVITY === 'nyuboen') {
    if (!r.quarters.length) bad($('#nQuarters'), '分房を選んでください');
    if (!tempOk(r.temp)) bad($('#nTemp'), '体温を確認してください（35〜43℃）');
    return errors;
  }
  if (ACTIVITY === 'kiroku') {
    if (!r.memo && !r.weight && !r.bcs) bad($('#kMemo'), '記録すること（メモか体重・BCS）を入れてください');
    if (r.bcs && !(Number(r.bcs) >= 1 && Number(r.bcs) <= 5)) bad($('#kBcs'), 'BCS を確認してください（1〜5）');
    return errors;
  }
  if (ACTIVITY === 'kannyu') return errors;
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
    checkCowRows($$('.m-cow', g), bad, seen, groups.length > 1 ? `移動先${i + 1}の` : '');
    if (!g.dataset.herd) bad($('.m-herds', g), groups.length > 1 ? `移動先${i + 1}の牛群を選んでください` : '移動先の牛群を選んでください');
  });
  if (r.moves.length > MAX_MOVES) bad(null, `1回に送れるのは${MAX_MOVES}頭までです`);
}

/** 治療: 牛・治療区分・薬（1つ以上。その他は名前を入れる）。体温は入れたときだけ範囲を見る */
function validateChiryou(r, bad) {
  checkCowRows($$('#cowList .m-cow'), bad, new Set(), '');
  validateDrugBlock(state.drugBlock, r.drugs, bad);
  if (r.kubun === '治療' && $('#cDisease').value === OTHER && !r.disease) bad($('#cDiseaseOther'), '疾病名を入れてください（無ければ「なし」）');
  if (r.temp && !(Number(r.temp) >= 35 && Number(r.temp) <= 43)) bad($('#cTemp'), '体温を確認してください（35〜43℃）');
}

/** 採卵の処置: 牛と処置 */
function validateSairan(r, bad) {
  checkCowRows($$('#cowList .m-cow'), bad, new Set(), '');
  if (!r.step) $$('.sStepSeg').forEach((s, i) => (i === 0 ? bad(s, '処置を選んでください') : s.classList.add('invalid')));
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

/** 続けて入力: 牧場・作業者・分娩日は残し、牛ごとの内容を空にする */
function resetForNext() {
  ['#damTag', '#damId'].forEach((s) => { $(s).value = ''; });
  $('#damHits').textContent = '';
  resetVoice();
  // 一緒に入れる投薬は外す（乾乳の乾乳セットは続けて入れることが多いので残す）
  if (state.txBlock && ACTIVITY !== 'kannyu') {
    $('#txOn').checked = false;
    applyTx();
  }
  if (ACTIVITY === 'nyuboen') {
    ['#nBacteria', '#nTemp', '#nMemo'].forEach((s) => { $(s).value = ''; });
    $$('#nQuarters input, #nSeverity input').forEach((el) => { el.checked = false; });
  } else if (ACTIVITY === 'sakutei') {
    // 同じ日に続けて頼むことが多いので、予定日と牛群は残す
    $('#kSMemo').value = '';
    $$('#kLegs input').forEach((el) => { el.checked = false; });
    $('#cowList').textContent = '';
    addCowRow();
  } else if (ACTIVITY === 'kiroku') {
    // 同じ記録（検診の結果・農協提出済 など）を続けて別の牛に入れることが多いので、メモは残す
    ['#kWeight', '#kBcs'].forEach((s) => { $(s).value = ''; });
  } else if (ACTIVITY === 'kannyu') {
    $('#kaMemo').value = '';
  } else if (ACTIVITY === 'hikitsugi') {
    renderHandover();
  }
  if (ACTIVITY === 'shippei' || ACTIVITY === 'nyuboen') $('#herd').value = '';
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
  } else if (ACTIVITY === 'idou') {
    $('#iMemo').value = '';
    $('#moveGroups').textContent = '';
    addGroup();
  } else if (ACTIVITY === 'chiryou' || ACTIVITY === 'yobou') {
    // 続けて同じ治療を別の牛に入れることが多いので、治療区分・薬は残し、牛・体温・メモだけ空にする
    ['#cTemp', '#cMemo'].forEach((s) => { $(s).value = ''; });
    $$('#cStatus input').forEach((el) => { el.checked = false; });
  } else if (ACTIVITY === 'sairan') {
    // 同じ日の次の処置へ。処置・朝夕を外し、牛は残す（同じドナーに続けて打つことが多い）
    $$('input[name="sStep"], #sAsayu input').forEach((el) => { el.checked = false; });
    $('#srMemo').value = '';
    showStepDrugs();
  }
  if (ACTIVITY === 'chiryou' || ACTIVITY === 'yobou') {
    $('#cowList').textContent = '';
    addCowRow();
  }
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
  // 一緒に入れた投薬（分娩は区分も出す）
  if (r.treatment) {
    tail.unshift([r.activity === 'bunben' ? `投薬（${r.treatment.kubun}）` : '投薬', drugsLine(r.treatment.drugs)]);
  }
  if (r.activity === 'shippei') {
    const rows = [['牛', cow], ['疾病名', r.disease]];
    if (r.temp) rows.push(['体温', `${Number(r.temp).toFixed(1)}℃`]);
    rows.push(['診療', [r.shinryo, r.saishin, r.kousei].filter(Boolean).join('・')]);
    rows.push(['牛群', r.herd]);
    if (!isToday) rows.push(['発生日', day]);
    return { title: '疾病の報告', rows: rows.concat(tail) };
  }
  if (r.activity === 'nyuboen') {
    const rows = [['牛', cow], ['分房', r.quarters.join('・')]];
    if (r.bacteria) rows.push(['原因菌', r.bacteria]);
    if (r.temp) rows.push(['体温', `${Number(r.temp).toFixed(1)}℃`]);
    if (r.severity) rows.push(['重篤度', r.severity]);
    rows.push(['牛群', r.herd]);
    if (!isToday) rows.push(['発生日', day]);
    // 原因菌が分からないときは「疑い」
    return { title: r.bacteria ? '乳房炎の報告' : '乳房炎（疑い）の報告', rows: rows.concat(tail) };
  }
  if (r.activity === 'sakutei') {
    const [, pm, pd] = r.plannedDate.split('-').map(Number);
    const rows = [[r.cows.length > 1 ? `${r.cows.length}頭` : '牛', r.cows.map((c) => c.tag || c.id).join('・')], ['予定日', `${pm}月${pd}日`], ['牛群', r.herd]];
    if (r.legs.length) rows.push(['気になる肢', r.legs.join('・')]);
    return { title: '応急削蹄の依頼', rows: rows.concat(tail) };
  }
  if (r.activity === 'kiroku') {
    // 個体の記録はメモが本体なので、メモを1行目に出す
    const rows = [['牛', cow]];
    if (r.memo) rows.push(['記録', oneLine(r.memo)]);
    if (r.weight) rows.push(['体重', `${r.weight}kg`]);
    if (r.bcs) rows.push(['BCS', r.bcs]);
    if (!isToday) rows.push(['記録日', day]);
    return { title: '個体の記録', rows: rows.concat(tail.filter(([label]) => label !== 'メモ')) };
  }
  if (r.activity === 'kannyu') {
    const rows = [['牛', cow]];
    if (!isToday) rows.push(['乾乳日', day]);
    return { title: '乾乳の報告', rows: rows.concat(tail) };
  }
  if (r.activity === 'hikitsugi') {
    // 引き継ぎは型の項目の順に、書いた（選んだ）ものだけを、書いたとおりの改行で出す
    const rows = Object.entries(r.items).map(([name, v]) => [name, Array.isArray(v) ? v.join('・') : v]).filter(([, v]) => v);
    return { title: `${r.target}の引き継ぎ ${day}`, rows: rows.concat(tail) };
  }
  if (r.activity === 'haiyou') {
    const rows = [['牛', cow], ['理由', r.reason]];
    if (!isToday) rows.push(['日付', day]);
    return { title: `${r.kind}の報告`, rows: rows.concat(tail) };
  }
  if (r.activity === 'idou') return idouRows(r, day, isToday, tail);
  const cowsLine = (cows) => cows.map((c) => c.tag || c.id).join('・');
  const cowsLabel = (cows) => (cows.length > 1 ? `${cows.length}頭` : '牛');
  if (r.activity === 'chiryou' || r.activity === 'yobou') {
    const rows = [[cowsLabel(r.cows), cowsLine(r.cows)]];
    if (r.disease) rows.push(['疾病名', r.disease]);
    rows.push(['薬', drugsLine(r.drugs)]);
    if (r.temp) rows.push(['体温', `${Number(r.temp).toFixed(1)}℃`]);
    if (r.status) rows.push(['ステータス', r.status]);
    if (!isToday) rows.push(['治療日', day]);
    return { title: r.kubun === '治療' ? '治療の報告' : `${r.kubun}の報告`, rows: rows.concat(tail) };
  }
  if (r.activity === 'sairan') {
    const rows = [['処置', [r.step, r.asayu && !r.step.includes(r.asayu) ? `（${r.asayu}）` : ''].join('')], [cowsLabel(r.cows), cowsLine(r.cows)]];
    if (!isToday) rows.push(['処置日', day]);
    return { title: '採卵用プログラム', rows: rows.concat(tail) };
  }
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

/** 薬は「名前 量」を1行にまとめる（「メロキシリン注5% 5ml、トラムリン注 5ml」） */
function drugsLine(drugs) {
  return drugs.map((d) => [d.name, d.qty ? `${d.qty}${d.unit}` : ''].filter(Boolean).join(' ')).join('、');
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
 * 牛群移動のカード。同じ行き先・同じ牛群の牛は1行にまとめる（「ネ145・ネ146 → VMS_VIC」）。
 * 行き先が1つなら見出しに出し（「牛群移動 → VMS」）、2つ以上（交換など）なら行の頭に出す
 */
function idouRows(r, day, isToday, tail) {
  const groups = [];
  r.moves.forEach((mv) => {
    let g = groups.find((x) => x.dir === mv.dir && x.herd === mv.herd);
    if (!g) groups.push((g = { dir: mv.dir, herd: mv.herd, cows: [] }));
    g.cows.push(mv.tag || mv.id);
  });
  const dests = [...new Set(groups.map((g) => g.dir))];
  const rows = groups.map((g) => [
    dests.length > 1 ? g.dir : g.cows.length > 1 ? `${g.cows.length}頭` : '牛',
    `${g.cows.join('・')} → ${g.herd}`,
  ]);
  if (!isToday) rows.push(['移動日', day]);
  const title = dests.length === 1 && dests[0] ? `牛群移動 → ${dests[0]}` : '牛群移動';
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

// ---------- まとめて話す ----------

/**
 * 「まとめて話す」の欄と、話す順（声の入力の型）。Apps Script に OpenAI の API キーが無いときは、型だけ出してボタンは押せない
 */
function setupVoice() {
  $('#voiceCard').hidden = false;
  renderSay();
  $('#voiceBtn').disabled = !state.voiceOn;
  $('#voiceOff').hidden = state.voiceOn;
  $('#voiceTextBox').hidden = !state.voiceOn;
  $('#voiceHint').textContent = `${INFO.example}。足りないところ・誤っているところは、あとで手で直せます。先に手で入れた項目は変えません`;
  $('#voiceHint').hidden = !state.voiceOn;
  if (!state.voiceOn) return;
  $('#voiceBtn').addEventListener('click', toggleRecording);
  $('#voiceTextBtn').addEventListener('click', () => {
    const text = $('#voiceText').value.trim();
    if (text) sendVoice({ text });
  });
}

/** 押すと録音を始め、もう一度押すと止めて送る（3分で自動で止める） */
async function toggleRecording() {
  const v = state.voice;
  if (v.busy) return;
  if (v.recorder) {
    v.recorder.stop();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    voiceStatus('この画面では録音できません。「文字で入れる」でキーボードの音声入力を使ってください');
    $('#voiceTextBox').open = true;
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (_) {
    voiceStatus('マイクを使えませんでした。「文字で入れる」でキーボードの音声入力を使ってください');
    $('#voiceTextBox').open = true;
    return;
  }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  v.chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) v.chunks.push(e.data); };
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(v.timer);
    v.recorder = null;
    $('#voiceBtn').classList.remove('rec');
    $('#voiceBtn').textContent = '🎤 まとめて話す';
    const blob = new Blob(v.chunks, { type: rec.mimeType || mime || 'audio/webm' });
    if (!blob.size) {
      voiceStatus('録音できませんでした。もう一度押して話してください');
      return;
    }
    sendVoice({ audio: await blobToBase64(blob), mime: blob.type });
  };
  rec.start();
  v.recorder = rec;
  const started = Date.now();
  $('#voiceBtn').classList.add('rec');
  const tick = () => {
    const s = Math.floor((Date.now() - started) / 1000);
    $('#voiceBtn').textContent = `■ 話し終えたら押す（${Math.floor(s / 60)}:${pad(s % 60)}）`;
    if (s >= VOICE_MAX_SEC && rec.state === 'recording') rec.stop();
  };
  tick();
  v.timer = setInterval(tick, 500);
  voiceStatus('話してください。終わったらもう一度押します');
}

/** 話す順（型）。引き継ぎは選んだ引き継ぎ先の項目の順 */
function renderSay() {
  const list = $('#voiceSay');
  if (!list) return;
  list.textContent = '';
  const t = ACTIVITY === 'hikitsugi' ? currentTemplate() : null;
  const items = t ? t.items.map((it) => [it.name, it.type === '選択' || it.type === '複数選択' ? it.options.map((o) => o.split('：')[0]).slice(0, 4).join('・') : it.note])
    : (INFO.say || []).map((x) => [x, '']);
  items.forEach(([name, note]) => {
    const li = document.createElement('li');
    li.textContent = name;
    if (note) {
      const small = document.createElement('small');
      small.textContent = `（${note.slice(0, 40)}）`;
      li.append(' ', small);
    }
    list.append(li);
  });
  $('#voiceSayBox').hidden = !items.length;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** 録音か文字を Apps Script に送り、返ってきた項目をフォームに入れる（手で入れた項目は変えない） */
async function sendVoice(input) {
  const v = state.voice;
  v.busy = true;
  $('#voiceBtn').disabled = true;
  $('#voiceTextBtn').disabled = true;
  voiceStatus('文字起こしと整理をしています…（10〜20秒）');
  try {
    const res = await api('voice', { activity: ACTIVITY, farm: $('#farm').value, form: collect(), ...input });
    const notes = applyVoice(res.fill || {});
    v.used = true;
    v.transcript = [v.transcript, res.transcript].filter(Boolean).join('\n');
    v.uncertain = [...new Set(v.uncertain.concat(res.uncertain || [], notes))];
    showVoiceResult();
    voiceStatus('話した項目を入れました（色の付いた項目）。要確認と足りないところを手で直してください');
    $('#voiceText').value = '';
    state.pendingId = '';
  } catch (e) {
    voiceStatus(e.message);
  } finally {
    v.busy = false;
    $('#voiceBtn').disabled = false;
    $('#voiceTextBtn').disabled = false;
  }
}

function voiceStatus(msg) {
  $('#voiceStatus').textContent = msg;
  $('#voiceStatus').hidden = !msg;
}

function showVoiceResult() {
  const v = state.voice;
  $('#voiceResult').hidden = !v.used;
  $('#transcript').textContent = v.transcript;
  renderUncertain($('#uncertainBox'), v.uncertain);
}

/** 要確認の一覧（フォームの上と確認の画面。シートの「要確認」列にも残る） */
function renderUncertain(box, list) {
  box.textContent = '';
  box.hidden = !list.length;
  if (!list.length) return;
  const head = document.createElement('div');
  head.textContent = '要確認（シートの「要確認」列に残ります）';
  head.style.fontWeight = '600';
  const ul = document.createElement('ul');
  list.forEach((x) => {
    const li = document.createElement('li');
    li.textContent = x;
    ul.append(li);
  });
  box.append(head, ul);
}

/** 続けて入力するとき: 声の結果と、手で入れた印を消す */
function resetVoice() {
  const v = state.voice;
  Object.assign(v, { used: false, transcript: '', uncertain: [] });
  showVoiceResult();
  voiceStatus('');
  $$('[data-touched]').forEach((el) => { delete el.dataset.touched; });
  $$('.voiced').forEach((el) => el.classList.remove('voiced'));
}

/**
 * 手で入れた（触った）項目に印を付ける。声で入れるときは、印のある項目を変えない。
 * 薬・牛・子牛・移動先の一覧は、どれかを触ったら一覧ごと手で入れたものとみなす
 */
function trackTouched() {
  const mark = (e) => {
    if (!e.isTrusted || !e.target || !e.target.closest) return;
    const el = e.target;
    const holder = el.closest('.seg') || el;
    holder.dataset.touched = '1';
    holder.classList.remove('voiced');
    const list = el.closest('.db-list, .drug-block, #cowList, #calves, #moveGroups');
    if (list) list.dataset.touched = '1';
  };
  $('#form').addEventListener('input', mark, true);
  $('#form').addEventListener('change', mark, true);
  $('#form').addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.preset-btn, .db-add, .d-del, #addCowRow, .m-delcow, #addCalf, .m-addcow, #addGroup, .remove')) mark(e);
  }, true);
}

/** 声の結果をフォームに入れる。手で入れた項目と食い違うものは入れずに、要確認に回す文を返す */
function applyVoice(f) {
  const notes = [];
  const touched = (el) => Boolean(el && el.dataset.touched);
  // 文字の欄・選ぶ欄。選択肢に無い値は「その他（入力）」に入れる
  const put = (el, v, label) => {
    if (v == null || v === '' || !el) return;
    const s = String(v);
    const cur = el.value.trim();
    if (touched(el) && cur) {
      if (cur !== s) notes.push(`${label}: 声では「${s}」（入っている「${cur}」のまま）`);
      return;
    }
    if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === s)) {
      const other = $(`#${el.id}Other`);
      if (![...el.options].some((o) => o.value === OTHER) || !other) {
        notes.push(`${label}: 声では「${s}」（選択肢に無い）`);
        return;
      }
      el.value = OTHER;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      other.value = s;
      other.classList.add('voiced');
      el.classList.add('voiced');
      return;
    }
    el.value = s;
    el.classList.add('voiced');
    el.classList.remove('invalid');
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  // メモ・引き継ぎの文は、入っていれば後ろに足す（消さない）
  const putText = (el, v) => {
    const s = String(v || '').trim();
    if (!s || !el) return;
    const cur = el.value.trim();
    if (cur.includes(s)) return;
    el.value = cur ? `${cur}\n${s}` : s;
    el.classList.add('voiced');
  };
  // ボタンで選ぶ欄
  const pick = (box, v, label) => {
    if (v == null || v === '' || !box) return;
    const input = $$('input', box).find((i) => i.value === String(v));
    if (!input) {
      notes.push(`${label}: 声では「${v}」（選択肢に無い）`);
      return;
    }
    const cur = value(null, box);
    if (touched(box) && cur) {
      if (cur !== String(v)) notes.push(`${label}: 声では「${v}」（選んだ「${cur}」のまま）`);
      return;
    }
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    box.classList.add('voiced');
    box.classList.remove('invalid');
  };
  const pickMany = (box, list, label) => {
    if (!list || !list.length || !box) return;
    const cur = values(box);
    if (touched(box) && cur.length) {
      if (cur.join('・') !== list.join('・')) notes.push(`${label}: 声では「${list.join('・')}」（選んだ「${cur.join('・')}」のまま）`);
      return;
    }
    $$('input', box).forEach((i) => { i.checked = list.includes(i.value); });
    box.classList.add('voiced');
    box.classList.remove('invalid');
  };

  if (f.date) put($('#date'), f.date, INFO.date);
  if (INFO.cowCard && f.tag) put($('#damTag'), f.tag, INFO.cow);
  if (ACTIVITY === 'bunben') {
    pick($('#kind'), f.kind, '分類');
    pick($('#difficulty'), f.difficulty, '分娩難易');
    pick($('#timeKind'), f.timeKind, '時刻の種類');
    putText($('#memo'), f.memo);
    applyCalves(f.calves || [], notes, { put, pick });
  } else if (ACTIVITY === 'shippei') {
    put($('#disease'), f.disease, '疾病名');
    put($('#temp'), f.temp, '体温');
    put($('#herd'), f.herd, '発生した牛群');
    pick($('#shinryo'), f.shinryo, '診療');
    pick($('#saishin'), f.saishin, '再診');
    pick($('#kousei'), f.kousei, '抗生剤');
    putText($('#sMemo'), f.memo);
  } else if (ACTIVITY === 'nyuboen') {
    pickMany($('#nQuarters'), f.quarters, '分房');
    put($('#nBacteria'), f.bacteria, '原因菌');
    put($('#nTemp'), f.temp, '体温');
    pick($('#nSeverity'), f.severity, '重篤度');
    put($('#herd'), f.herd, '発生した牛群');
    putText($('#nMemo'), f.memo);
  } else if (ACTIVITY === 'sakutei') {
    applyCows(f.cows || [], notes);
    pickMany($('#kLegs'), f.legs, '気になる肢');
    put($('#kPlanned'), f.plannedDate, '予定日');
    put($('#herd'), f.herd, '牛群');
    putText($('#kSMemo'), f.memo);
  } else if (ACTIVITY === 'kiroku') {
    putText($('#kMemo'), f.memo);
    put($('#kWeight'), f.weight, '体重');
    put($('#kBcs'), f.bcs, 'BCS');
    if (f.weight || f.bcs) $('#kWeight').closest('details').open = true;
  } else if (ACTIVITY === 'kannyu') {
    putText($('#kaMemo'), f.memo);
  } else if (ACTIVITY === 'haiyou') {
    pick($('#hKind'), f.kind, '種別');
    put($('#hReason'), f.reason, '理由');
    putText($('#hMemo'), f.memo);
  } else if (ACTIVITY === 'idou') {
    applyMoves(f.moves || [], notes);
    putText($('#iMemo'), f.memo);
  } else if (ACTIVITY === 'chiryou' || ACTIVITY === 'yobou') {
    applyCows(f.cows || [], notes);
    if (ACTIVITY === 'chiryou') pick($('.db-kubun', state.drugBlock.node), f.kubun, '治療区分');
    put($('#cDisease'), f.disease, '疾病名');
    put($('#cTemp'), f.temp, '体温');
    pick($('#cStatus'), f.status, 'ステータス');
    applyDrugs(state.drugBlock, f.drugs, notes);
    putText($('#cMemo'), f.memo);
  } else if (ACTIVITY === 'sairan') {
    applyCows(f.cows || [], notes);
    const step = f.step && $$('input[name="sStep"]').find((i) => i.value === f.step);
    if (step && !$$('input[name="sStep"]').some((i) => i.checked && i.closest('.seg').dataset.touched)) {
      step.checked = true;
      step.dispatchEvent(new Event('change', { bubbles: true }));
      step.closest('.seg').classList.add('voiced');
    }
    pick($('#sAsayu'), f.asayu, '朝・夕');
    putText($('#srMemo'), f.memo);
  } else if (ACTIVITY === 'hikitsugi') {
    // 引き継ぎの型の項目ごと: 文は後ろに足す、選択はボタン、複数選択は複数、日付・数はそのまま
    $$('#hItems .h-item').forEach((card) => {
      const v = (f.items || {})[card.dataset.item];
      if (v == null || v === '') return;
      const type = card.dataset.type;
      if (type === '選択') pick($('.seg', card), v, card.dataset.item);
      else if (type === '複数選択') pickMany($('.seg', card), Array.isArray(v) ? v : [v], card.dataset.item);
      else if (type === '文') putText($('textarea', card), v);
      else put($('input', card), v, card.dataset.item);
    });
  }
  // 一緒に入れる投薬（話に出たときだけ開く）
  const tx = f.treatment;
  if (state.txBlock && tx && tx.drugs && tx.drugs.length) {
    $('#txOn').checked = true;
    applyTx();
    if (tx.kubun) pick($('.db-kubun', state.txBlock.node), tx.kubun, '投薬の治療区分');
    applyDrugs(state.txBlock, tx.drugs, notes);
  }
  return notes;
}

/** 声の子牛: 子牛の欄を手で触っていなければ、話した子牛で入れ直す */
function applyCalves(calves, notes, { put, pick }) {
  if (!calves.length) return;
  if ($('#calves').dataset.touched) {
    notes.push(`子牛: 声では${calves.length}頭（入っている子牛のまま）`);
    return;
  }
  $('#calves').textContent = '';
  calves.slice(0, 3).forEach((c) => {
    addCalf();
    const node = $$('#calves .calf').at(-1);
    put($('.c-id', node), c.id, '子牛の個体識別番号');
    put($('.c-tag', node), c.tag, '子牛の耳標');
    pick($('.c-sex', node), c.sex, '子牛の性別');
    put($('.c-breed', node), c.breed, '子牛の品種');
    // タイプは品種と性別で決まる。和牛のメスのときだけ話したタイプを選ぶ
    if (c.type && $$('input', $('.c-type', node)).length > 1) pick($('.c-type', node), c.type, '子牛のタイプ');
    put($('.c-weight', node), c.weight, '子牛の体重');
    put($('.c-color', node), c.color, '子牛の毛色');
  });
  applyKind();
}

/** 声の牛（治療・予防的投与・採卵用プログラム）: 牛の欄を手で触っていなければ、話した牛で入れ直す */
function applyCows(cows, notes) {
  if (!cows.length) return;
  const list = $('#cowList');
  const current = $$('.m-cow', list).map(readCowRow).filter(Boolean).map((c) => c.tag || c.id);
  if (list.dataset.touched && current.length) {
    if (current.join('・') !== cows.join('・')) notes.push(`牛: 声では「${cows.join('・')}」（入っている「${current.join('・')}」のまま）`);
    return;
  }
  list.textContent = '';
  cows.slice(0, MAX_COWS).forEach((t) => {
    const el = addCowRow();
    el.value = t;
    el.classList.add('voiced');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  if (cows.length > MAX_COWS) notes.push(`牛: 1回に送れるのは${MAX_COWS}頭まで（${cows.length}頭話した）`);
}

/** 声の牛群移動: 移動先の欄を手で触っていなければ、移動先ごとのカードに入れ直す */
function applyMoves(moves, notes) {
  if (!moves.length) return;
  const box = $('#moveGroups');
  if (box.dataset.touched) {
    notes.push('牛群移動: 声で話した移動は、入っている移動先のまま（手で直してください）');
    return;
  }
  box.textContent = '';
  const herds = [...new Set(moves.map((m) => m.herd || ''))];
  herds.forEach((herd) => {
    addGroup();
    const node = $$('.mgroup', box).at(-1);
    const h = currentHerds().find((x) => x.name === herd);
    if (h) {
      node.dataset.group = h.group;
      node.dataset.herd = herd;
      renderGroups(node);
      $('.m-herds', node).classList.add('voiced');
    }
    moves.filter((m) => (m.herd || '') === herd).forEach((m, i) => {
      const el = i === 0 ? $('.m-tag', node) : addCow(node);
      if (!el) return;
      el.value = m.tag;
      el.classList.add('voiced');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  renumberGroups();
  if (moves.length > MAX_MOVES) notes.push(`牛群移動: 1回に送れるのは${MAX_MOVES}頭まで（5頭以上は PC で Farmnote に入れる）`);
}

/** 声の薬: 投薬の欄を手で触っていなければ、話した薬で入れ直す（量を言わなかった薬は、いつもの量） */
function applyDrugs(block, drugs, notes) {
  if (!drugs || !drugs.length) return;
  const current = collectDrugs(block);
  if ((block.node.dataset.touched || block.list.dataset.touched) && current.length) {
    const cur = current.map((d) => d.name).join('・');
    const said = drugs.map((d) => d.name).join('・');
    if (cur !== said) notes.push(`薬: 声では「${said}」（入っている「${cur}」のまま）`);
    return;
  }
  block.list.textContent = '';
  $$('.preset-btn', block.node).forEach((x) => x.classList.remove('on'));
  drugs.slice(0, MAX_DRUGS).forEach((d) => {
    const known = findDrug(d.name, block.kubun());
    const unit = known ? known.unit : '';
    const qty = d.qty || (known ? known.qty : '');
    addDrug(block, { name: d.name, qty: qty ? `${qty} ${unit}`.trim() : '', route: known ? known.route : '' });
  });
  $$('.drug', block.list).forEach((n) => n.classList.add('voiced'));
}

// ---------- 小物 ----------

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

/** 次回のために牧場・作業者・投稿先を覚えておく（端末ごと。投稿先はトーク以外から開いたときの既定にする） */
function remember(r, dest) {
  try {
    const saved = loadSaved();
    saved.farm = r.farm;
    saved.workers = { ...(saved.workers || {}), [r.farm]: r.worker };
    if (dest && dest !== HERE) saved.dest = { ...(saved.dest || {}), [r.activity]: dest };
    if (r.activity === 'chiryou') saved.chiryouKubun = r.kubun; // 次に開いたとき同じ治療区分を選んでおく
    if (r.activity === 'hikitsugi') saved.handoverTarget = r.target; // 次に開いたとき同じ引き継ぎ先で開く
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
