'use strict';

// ===== まとめて話す（声の入力） =====
// 録音（か、キーボードの音声入力の文）を Apps Script に送り、返ってきた項目をフォームに入れる。
// 種類ごとの入れ方は reports.js の REPORTS の voice

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

/**
 * マイク。LINE WORKS の中のブラウザはマイクの許可を覚えないので、取るたびに許可を聞かれる。
 * 同じフォームで続けて話すときに聞き直さないよう、最後に話してから2分は開いたままにする（その間はマイク使用中の印が出る）
 */
const MIC_KEEP_MS = 2 * 60 * 1000;
async function micStream() {
  const v = state.voice;
  clearTimeout(v.micTimer);
  if (v.stream && v.stream.getAudioTracks().some((t) => t.readyState === 'live')) return v.stream;
  v.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  return v.stream;
}

function releaseMicLater() {
  const v = state.voice;
  clearTimeout(v.micTimer);
  v.micTimer = setTimeout(releaseMic, MIC_KEEP_MS);
}

function releaseMic() {
  const v = state.voice;
  clearTimeout(v.micTimer);
  if (v.stream) v.stream.getTracks().forEach((t) => t.stop());
  v.stream = null;
}

// 画面を離れたら（閉じた・ほかのアプリへ）マイクを放す
window.addEventListener('pagehide', releaseMic);
document.addEventListener('visibilitychange', () => { if (document.hidden && !state.voice.recorder) releaseMic(); });

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
    stream = await micStream();
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
    releaseMicLater();
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

/** 話す順（型）。REPORTS の say（引き継ぎは sayItems で、選んだ引き継ぎ先の項目の順） */
function renderSay() {
  const list = $('#voiceSay');
  if (!list) return;
  list.textContent = '';
  const items = INFO.sayItems ? INFO.sayItems() : (INFO.say || []).map((x) => [x, '']);
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

/**
 * 声の結果をフォームに入れる。手で入れた項目と食い違うものは入れずに、要確認に回す文を返す。
 * 日付・母牛と一緒に入れる投薬は共通で、ほかは報告の種類ごと（REPORTS の voice に put・putText・pick・pickMany を渡す）
 */
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
  if (INFO.voice) INFO.voice(f, { notes, put, putText, pick, pickMany });
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
    put($('.c-mid', node), c.id, '子牛の個体識別番号');
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
