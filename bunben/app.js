'use strict';

// ===== 起動・設定・Apps Script とのやりとり =====
// 画面のファイルは index.html の順に読む: util.js（小物）→ parts.js（フォームの部品）→ reports.js（報告の種類ごとの決まり）
// → form.js（フォーム・確認・送信・カード）→ voice.js（まとめて話す）→ app.js（これ。起動と設定）

// ===== デプロイ後に書き換える =====
const CONFIG = {
  woffId: '8IjjeCbtPxsinTC8-7cXug', // Developer Console（アプリ「分娩報告フォーム」の WOFF「分娩報告」）で発行された WOFF ID
  gasUrl: 'https://script.google.com/macros/s/AKfycbxeEl4u7byBq21WFH3mvap8JZ-HnzlqYByUhncD_jDPivvF98okpf0PI487SNvMh7Rcow/exec',
};

// 画面の版。送信のたびに Apps Script へ渡し、実行ログに残る（スマホが古い画面を使っていないかを見る）。
// 画面のファイルを直したら上げる。index.html の各 .js?v=… も同じ値にそろえる（古いファイルを使い回させないため。tools/check_woff.mjs で確かめる）
const APP_VERSION = '2026-10-25b';

const PARAMS = new URLSearchParams(location.search);
const MOCK = PARAMS.has('mock');
// 試行モード（?trial=1）: WOFF を使わずブラウザで開く。キー（GAS の TRIAL_KEY）は初回に貼り付けてもらい、その端末に保存する
const TRIAL = PARAMS.has('trial');
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
    ['bunker', 'バンカーの餌の変更', '餌の切り替え・新しい餌の詰め込み開始・使い切り'],
    ['zaiko', '薬品在庫の確認', '週1回。品目ごとの残りの数（MIN を下回ると補充の依頼になる）'],
    ['haiyou', '死亡・廃用', '死亡・淘汰と理由'],
    ['chiryou', '治療（アブレスト以外）', 'ワクチン・繁殖治療など。薬・量・投薬区分'],
  ] },
};
const MAX_MOVES = 4; // 牛群移動の1回の報告で送れる頭数（GAS と同じ。5頭以上は PC で入れる）
const MAX_COWS = 10; // 治療・採卵の処置の1回の報告で送れる頭数（GAS と同じ）
const MAX_DRUGS = 10; // 治療の薬の数（GAS と同じ）
const HERDS_FIRST = 8; // 移動先の牛群は「牛群」タブの上から8つを出し、残りは「ほかの牛群」で開く
const PICKING = CHOOSERS[PARAMS.get('type')] || null; // 種類を選ぶ画面から始める
// 報告の種類（reports.js の REPORTS の名前）と、その決まり。「疾病・乳房炎」「ほかの報告」から選んだときに決まるので let
let ACTIVITY = REPORTS[PARAMS.get('type')] ? PARAMS.get('type') : 'bunben';
let INFO = REPORTS[ACTIVITY];
const OTHER = '__other__'; // 疾病名・薬「その他（入力）」
const HERE = '__here__'; // 投稿先「このトーク」（開いたトークに本人名義で投稿）
const COPY = '__copy__'; // 投稿先「トークに投稿しない」（トーク以外から開いたとき。文面をコピーして貼る）
const BOARD = 'board:'; // 投稿先の掲示板（board:掲示板ID）
const VOICE_MAX_SEC = 180; // 1回の録音は3分まで
const TRIAL_KEY_STORE = 'bunben-trial-key';
const STORE_KEY = 'bunben-form';

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
  voice: { used: false, transcript: '', uncertain: [], recorder: null, chunks: [], timer: null, busy: false, stream: null, micTimer: null },
  configKey: '', // 開いたときの設定（裏で読んだ新しい設定と比べる）
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
  // 設定は前回この端末で読んだものを使ってすぐにフォームを出し、新しい設定は裏で読む（Apps Script の返事は1.5〜8秒かかる）。
  // 新しい設定は次に開いたときから使い、変わっていたらフォームの上で知らせる。初めての端末・試行モード・管理画面は待って読む
  const cached = TRIAL || PARAMS.get('admin') ? null : readConfigCache();
  const fresh = api('config', { channelId: state.channelId });
  let res;
  if (cached) {
    res = cached;
    fresh.then(onFreshConfig, onFreshConfigError);
  } else {
    try {
      res = await fresh;
    } catch (e) {
      if (TRIAL) writeStore(TRIAL_KEY_STORE, ''); // キーが違うときは次に開いたとき聞き直す
      throw e;
    }
    if (!TRIAL) saveConfigCache(res);
  }
  if (TRIAL) writeStore(TRIAL_KEY_STORE, state.trialKey);
  applyConfig(res);
  if (!state.farms.length) throw new Error('設定シート「牧場」に牧場がありません');
  $('#loading').hidden = true;
  if (PARAMS.get('admin') === 'menu' && state.user.isAdmin) setupAdmin();
  if (PICKING) {
    showChooser();
    return;
  }
  openForm();
}

/** Apps Script の設定（config の返事）を state に入れる */
function applyConfig(res) {
  state.configKey = configKey(res);
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
    b.style.background = REPORTS[type].color;
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = label;
    b.lastChild.textContent = note;
    b.addEventListener('click', () => {
      ACTIVITY = type;
      INFO = REPORTS[type];
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

function showFatal(msg) {
  $('#loading').hidden = true;
  const el = $('#fatal');
  el.textContent = msg;
  el.hidden = false;
}

// ---------- 端末に残す設定（すぐにフォームを出すため） ----------

const CONFIG_STORE = MOCK ? 'fdp-config-mock' : 'fdp-config';
// 投稿先（開いたトークの名前・ほかのトーク）はトークごと。それ以外の設定は人ごと
const CHANNEL_KEYS = ['channel', 'destinations'];

/** 前回この端末で読んだ設定。同じ人・同じ画面の版のときだけ使う（画面を直した版では読み直す） */
function readConfigCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_STORE) || 'null');
    if (!c || c.appVersion !== APP_VERSION || c.userId !== state.profile.userId || !c.res || !(c.res.farms || []).length) return null;
    const ch = (c.channels || {})[state.channelId || ''] || {
      channel: state.channelId ? { channelId: state.channelId, name: '' } : null, destinations: [],
    };
    return Object.assign({}, c.res, ch);
  } catch (_) {
    return null;
  }
}

function saveConfigCache(res) {
  try {
    const prev = JSON.parse(localStorage.getItem(CONFIG_STORE) || 'null');
    const same = prev && prev.appVersion === APP_VERSION && prev.userId === state.profile.userId;
    const rest = Object.assign({}, res);
    CHANNEL_KEYS.forEach((k) => delete rest[k]);
    delete rest.ok;
    const channels = Object.assign({}, same ? prev.channels : {}, { [state.channelId || '']: { channel: res.channel || null, destinations: res.destinations || [] } });
    localStorage.setItem(CONFIG_STORE, JSON.stringify({ appVersion: APP_VERSION, userId: state.profile.userId, savedAt: Date.now(), res: rest, channels }));
  } catch (_) {
    // 残せなくても次に開いたときに待って読むだけ
  }
}

/** フォームの中身に関わる設定（投稿先と入力者以外）。変わったかを比べる */
function configKey(res) {
  const rest = Object.assign({}, res);
  ['ok', 'user', ...CHANNEL_KEYS].forEach((k) => delete rest[k]);
  return JSON.stringify(rest);
}

/** 裏で読んだ新しい設定。次に開いたときのために残し、投稿先と入力者はいまのフォームにも入れる。ほかが変わっていたら知らせる */
function onFreshConfig(res) {
  saveConfigCache(res);
  state.user = res.user;
  const dest = JSON.stringify([res.channel || null, res.destinations || []]);
  if (dest !== JSON.stringify([state.channel, state.destinations])) {
    state.channel = res.channel || null;
    state.destinations = res.destinations || [];
    if (state.view === 'form') setupDest();
  }
  if (configKey(res) !== state.configKey) {
    $('#configNotice').textContent = '設定（作業者・牛群・薬など）が新しくなりました。このまま送れますが、いったん閉じて開き直すと新しい選択肢になります';
    $('#configNotice').hidden = false;
  }
}

/** 裏で読めなかったとき。電波が悪いだけならそのまま。本人確認などで断られたら知らせる（送るときにも同じ理由で止まる） */
function onFreshConfigError(e) {
  const msg = (e && e.message) || '';
  if (!msg || msg.startsWith('通信できませんでした')) return;
  $('#configNotice').textContent = msg;
  $('#configNotice').hidden = false;
}
