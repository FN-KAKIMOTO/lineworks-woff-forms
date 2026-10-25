'use strict';

// ===== 報告の種類ごとの決まり =====
// トークルームの下のボタン（Bot の固定メニュー）から ?type=… で開く。種類の名前は Apps Script の ACTIVITIES と同じ。
// 種類ごとの直しはここだけを見ればよいように、欄の作り・送る中身・入力チェック・続けて入力・トークのカード・声の入れ方をまとめる。
//
// 決まり:
//   title・cow（牛の欄の名前）・date（日付の欄の名前）・color（カードの色）
//   farmnote: Farmnote に登録する報告か（確認の画面に「Farmnote に登録する」を出す。Apps Script の ACTIVITIES と同じ）
//   cowCard: 1頭の牛の欄を出すか、multiCow: 複数頭の牛の欄を出すか、fields: 項目の欄（無ければ種類の名前の欄。予防的投与は治療の欄）
//   herdLabel: どこの牛群で起きたかの欄の名前（無ければ出さない）
//   tx: 一緒に入れる投薬の欄（label・calving: 分娩の投薬を先に出す・checked と preset: 最初から入れる組み合わせ・keep: 続けて入力で残す
//       ・showKubun: カードに区分を出す）。欄を出すかは Apps Script の attachKubun で決まる
//   example・say: 「まとめて話す」の例と話す順（声の入力の型。一部だけ話して、残りをタップ・文字で入れてもよい）
// 動き（collect と card はどの種類にもある。ほかは要るものだけ）:
//   setup(): 欄を作る  collect(base): 送る中身（base は牧場・牛・日付・作業者）
//   validate(r, bad): 入力チェック（cowCard の種類は共通のチェックのあと、ほかは前）
//   reset(): 「続けて入力」で空にする（牧場・作業者・日付は残る）
//   card(r, c): トークのカードの見出し（title）と行（rows）。見出しの色を変えるときは color も返す。
//       c は cow（牛）・day（「10月22日」）・isToday・time（送信時刻）・tail（メモ・作業者・投薬の共通の行）・oneLine（改行を空白に）
//   voice(f, h): 声の結果 f を欄に入れる（h は put・putText・pick・pickMany と要確認の notes）
//   remember(saved, r): 次に開いたときのために覚える  onBoards(): 掲示板の一覧を読んだあと  sayItems(): 話す順を作る
//   onFarm(): 牧場を選び直したとき（牧場ごとの候補を出し直す）
//   boardFirst: 投稿先の既定を掲示板にする（前回選んだ掲示板、無ければ名前にこの語が入った掲示板）

const TIME_KINDS = [['found', '生まれていた（子牛発見時刻）'], ['birth', '分娩に立ち会った（分娩時刻）']];
// バンカーの餌の変更で、変更後の餌が無くてよい変更内容（Apps Script の BUNKER_EMPTIED と同じ。tools/check_woff.mjs で確かめる）
const BUNKER_EMPTIED = '使い切り（空になった）';

// 治療（アブレスト以外）と予防的投与は同じ欄（予防的投与は区分が決まっている）
const TREATMENT_REPORT = {
  multiCow: true,
  setup: setupChiryou,
  collect(base) {
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
  },
  validate: validateChiryou,
  reset() {
    // 続けて同じ治療を別の牛に入れることが多いので、治療区分・薬は残し、牛・体温・メモだけ空にする
    ['#cTemp', '#cMemo'].forEach((s) => { $(s).value = ''; });
    $$('#cStatus input').forEach((el) => { el.checked = false; });
    $('#cowList').textContent = '';
    addCowRow();
  },
  card(r, c) {
    const rows = [[cowsLabel(r.cows), cowsLine(r.cows)]];
    if (r.disease) rows.push(['疾病名', r.disease]);
    rows.push(['薬', drugsLine(r.drugs)]);
    if (r.temp) rows.push(['体温', `${Number(r.temp).toFixed(1)}℃`]);
    if (r.status) rows.push(['ステータス', r.status]);
    if (!c.isToday) rows.push(['治療日', c.day]);
    return { title: r.kubun === '治療' ? '治療の報告' : `${r.kubun}の報告`, rows: rows.concat(c.tail) };
  },
  voice(f, h) {
    applyCows(f.cows || [], h.notes);
    if (ACTIVITY === 'chiryou') h.pick($('.db-kubun', state.drugBlock.node), f.kubun, '治療区分');
    h.put($('#cDisease'), f.disease, '疾病名');
    h.put($('#cTemp'), f.temp, '体温');
    h.pick($('#cStatus'), f.status, 'ステータス');
    applyDrugs(state.drugBlock, f.drugs, h.notes);
    h.putText($('#cMemo'), f.memo);
  },
};

const REPORTS = {
  bunben: {
    title: '分娩の報告', cow: '母牛', date: '分娩日', color: '#2f7d4f', farmnote: true, cowCard: true,
    tx: { label: '母牛への投薬も入れる（予防的投与・治療）', calving: true, showKubun: true },
    example: '例「ネの527番、出産、自然分娩。メス、ホルスタイン、40キロ、番号は6720。ニュートレス500、メロキシリン5」',
    say: ['母牛の番号（ネの527番）', '出産・死産・流産', '分娩難易（自然分娩・介助）', '生まれていた か 立ち会った か',
      '子牛の性別・品種・体重（メス、ホルスタイン、40キロ）', '子牛の番号は真ん中の4桁だけ（番号は6720）', '母牛に入れた薬と量（ニュートレス500、メロキシリン5）'],
    setup: setupBunben,
    collect: (base) => ({
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
    }),
    validate: validateBunben,
    reset() {
      $('#memo').value = '';
      check('kind', '出産');
      check('difficulty', '自然分娩');
      check('timeKind', 'found');
      $('#calves').textContent = '';
      addCalf();
      applyKind();
    },
    card(r, c) {
      const how = r.timeKind === 'birth' ? '分娩に立ち会い' : '子牛を発見';
      const rows = [
        ['母牛', c.cow],
        [c.isToday ? '時刻' : '日付', [c.isToday ? c.time : c.day, how].filter(Boolean).join(' ')],
        ['分類', [r.kind, r.difficulty].filter(Boolean).join('・')],
      ];
      const calves = r.calves.filter((x) => r.kind === '出産' || hasCalfInfo(x));
      calves.forEach((x, i) => {
        const no = calves.length > 1 ? String(i + 1) : '';
        // 子牛は1行: 「K1547 メス・黒毛和種・57kg」。タイプは選んだときの繁殖雌牛だけ出す（ほかは品種と性別で決まる）
        const ear = x.tag || (x.id ? fmtCalfId(x.id) : x.noId ? '耳標なし' : '');
        const weight = x.weight ? `${x.weight}kg` : x.noWeight ? '体重未測定' : '';
        const attrs = [x.sex, x.breed, x.type === '繁殖雌牛' ? x.type : '', weight].filter(Boolean).join('・');
        rows.push([`子牛${no}`, [ear, attrs].filter(Boolean).join(' ')]);
        if (x.memo) rows.push([`出生メモ${no}`, c.oneLine(x.memo)]);
      });
      const title = r.kind === '出産' ? '分娩の報告' : `${r.kind}の報告`;
      // 死産・流産は見出しの色を変える
      return { title, rows: rows.concat(c.tail), color: r.kind === '出産' ? '' : '#7a5c2e' };
    },
    voice(f, h) {
      h.pick($('#kind'), f.kind, '分類');
      h.pick($('#difficulty'), f.difficulty, '分娩難易');
      h.pick($('#timeKind'), f.timeKind, '時刻の種類');
      h.putText($('#memo'), f.memo);
      applyCalves(f.calves || [], h.notes, h);
    },
  },

  shippei: {
    title: '疾病の報告', cow: '牛', date: '発生日', color: '#b45309', farmnote: true, cowCard: true, herdLabel: '発生した牛群',
    example: '例「Dの295番、2群で第四胃食滞、体温38.5度、自家治療。ウルソ40打った」',
    say: ['牛の番号', '発生した牛群（2群で・VICで）', '疾病名', '体温（39度5分）', '獣医か自家治療か・再診・抗生剤', '入れた薬と量'],
    setup: setupShippei,
    collect: (base) => ({
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
    }),
    validate(r, bad) {
      if (!r.disease) bad($('#disease').value === OTHER ? $('#diseaseOther') : $('#disease'), '疾病名を選ぶか入れてください');
      if (!r.temp && !r.noTemp) bad($('#temp'), '体温を入れてください（測っていなければチェック）');
      if (!tempOk(r.temp)) bad($('#temp'), '体温を確認してください（35〜43℃）');
      if (!r.shinryo) bad($('#shinryo'), '獣医か自家治療かを選んでください');
    },
    reset() {
      $('#herd').value = '';
      ['#disease', '#diseaseOther', '#temp', '#sMemo'].forEach((s) => { $(s).value = ''; });
      $('#diseaseOtherField').hidden = true;
      $('#noTemp').checked = false;
      $('#temp').disabled = false;
      $$('#shinryo input, #saishin input, #kousei input').forEach((el) => { el.checked = false; });
    },
    card(r, c) {
      const rows = [['牛', c.cow], ['疾病名', r.disease]];
      if (r.temp) rows.push(['体温', `${Number(r.temp).toFixed(1)}℃`]);
      rows.push(['診療', [r.shinryo, r.saishin, r.kousei].filter(Boolean).join('・')]);
      rows.push(['牛群', r.herd]);
      if (!c.isToday) rows.push(['発生日', c.day]);
      return { title: '疾病の報告', rows: rows.concat(c.tail) };
    },
    voice(f, h) {
      h.put($('#disease'), f.disease, '疾病名');
      h.put($('#temp'), f.temp, '体温');
      h.put($('#herd'), f.herd, '発生した牛群');
      h.pick($('#shinryo'), f.shinryo, '診療');
      h.pick($('#saishin'), f.saishin, '再診');
      h.pick($('#kousei'), f.kousei, '抗生剤');
      h.putText($('#sMemo'), f.memo);
    },
  },

  // 乳房炎（疑い）: 原因菌は検査のあとで分かることが多く、未特定なら「乳房炎疑い」として記録する
  nyuboen: {
    title: '乳房炎（疑い）の報告', cow: '牛', date: '発生日', color: '#c2410c', farmnote: true, cowCard: true, herdLabel: '発生した牛群',
    example: '例「ネの446番、右後ろ、乳房炎の疑い。体温39.5。セフロキシム1本」',
    say: ['牛の番号', '分房（右後ろ）', '原因菌（わかれば。OS・CO など。分からなければ言わない）', '体温', '入れた薬と量'],
    setup: setupNyuboen,
    collect: (base) => ({
      ...base,
      quarters: values($('#nQuarters')),
      bacteria: $('#nBacteria').value,
      temp: $('#nTemp').value.trim(),
      severity: value('nSeverity'),
      herd: $('#herd').value,
      memo: $('#nMemo').value.trim(),
      treatment: collectTx(),
    }),
    validate(r, bad) {
      if (!r.quarters.length) bad($('#nQuarters'), '分房を選んでください');
      if (!tempOk(r.temp)) bad($('#nTemp'), '体温を確認してください（35〜43℃）');
    },
    reset() {
      ['#nBacteria', '#nTemp', '#nMemo'].forEach((s) => { $(s).value = ''; });
      $$('#nQuarters input, #nSeverity input').forEach((el) => { el.checked = false; });
      $('#herd').value = '';
    },
    card(r, c) {
      const rows = [['牛', c.cow], ['分房', r.quarters.join('・')]];
      if (r.bacteria) rows.push(['原因菌', r.bacteria]);
      if (r.temp) rows.push(['体温', `${Number(r.temp).toFixed(1)}℃`]);
      if (r.severity) rows.push(['重篤度', r.severity]);
      rows.push(['牛群', r.herd]);
      if (!c.isToday) rows.push(['発生日', c.day]);
      // 原因菌が分からないときは「疑い」
      return { title: r.bacteria ? '乳房炎の報告' : '乳房炎（疑い）の報告', rows: rows.concat(c.tail) };
    },
    voice(f, h) {
      h.pickMany($('#nQuarters'), f.quarters, '分房');
      h.put($('#nBacteria'), f.bacteria, '原因菌');
      h.put($('#nTemp'), f.temp, '体温');
      h.pick($('#nSeverity'), f.severity, '重篤度');
      h.put($('#herd'), f.herd, '発生した牛群');
      h.putText($('#nMemo'), f.memo);
    },
  },

  // 応急削蹄の依頼: 蹄病は断定せず、牛と予定日（既定は明日）だけ。気になる肢・メモは任意
  sakutei: {
    title: '応急削蹄の依頼', cow: '牛', date: '依頼日', color: '#78716c', farmnote: true, multiCow: true, herdLabel: '気づいた牛群（いる牛群）',
    example: '例「ネの371番、左前を気にしてる。明日、内田さんに応急削蹄」',
    say: ['牛の番号（何頭でも）', '気になる肢（わかれば）', 'いつ（明日・木曜）', '削蹄師さん・様子（メモ）'],
    setup() {
      $('#kPlanned').value = dayAfter(1);
      $('#kPlanned').min = today();
      multiSegment($('#kLegs'), 'kLegs', state.choices.quarter, []);
    },
    collect: (base) => ({
      ...base,
      damTag: '',
      damId: '',
      cows: $$('#cowList .m-cow').map(readCowRow).filter(Boolean),
      legs: values($('#kLegs')),
      plannedDate: $('#kPlanned').value,
      herd: $('#herd').value,
      memo: $('#kSMemo').value.trim(),
    }),
    validate(r, bad) {
      checkCowRows($$('#cowList .m-cow'), bad, new Set(), '');
      if (!r.plannedDate) bad($('#kPlanned'), '応急削蹄の予定日を入れてください');
      else if (r.plannedDate < today()) bad($('#kPlanned'), '応急削蹄の予定日が過去になっています');
    },
    reset() {
      // 同じ日に続けて頼むことが多いので、予定日と牛群は残す
      $('#kSMemo').value = '';
      $$('#kLegs input').forEach((el) => { el.checked = false; });
      $('#cowList').textContent = '';
      addCowRow();
    },
    card(r, c) {
      const [, pm, pd] = r.plannedDate.split('-').map(Number);
      const rows = [[r.cows.length > 1 ? `${r.cows.length}頭` : '牛', r.cows.map((x) => x.tag || x.id).join('・')], ['予定日', `${pm}月${pd}日`], ['牛群', r.herd]];
      if (r.legs.length) rows.push(['気になる肢', r.legs.join('・')]);
      return { title: '応急削蹄の依頼', rows: rows.concat(c.tail) };
    },
    voice(f, h) {
      applyCows(f.cows || [], h.notes);
      h.pickMany($('#kLegs'), f.legs, '気になる肢');
      h.put($('#kPlanned'), f.plannedDate, '予定日');
      h.put($('#herd'), f.herd, '牛群');
      h.putText($('#kSMemo'), f.memo);
    },
  },

  kiroku: {
    title: '個体の記録', cow: '牛', date: '記録日', color: '#0f766e', farmnote: true, cowCard: true,
    example: '例「ネの146番、分娩10日後検診、問題なし」',
    say: ['牛の番号', '記録すること（検診の結果・PL・提出したこと など）', '体重・BCS（あれば）'],
    setup: setupKiroku,
    collect: (base) => ({ ...base, memo: $('#kMemo').value.trim(), weight: $('#kWeight').value.trim(), bcs: $('#kBcs').value.trim() }),
    validate(r, bad) {
      if (!r.memo && !r.weight && !r.bcs) bad($('#kMemo'), '記録すること（メモか体重・BCS）を入れてください');
      if (r.bcs && !(Number(r.bcs) >= 1 && Number(r.bcs) <= 5)) bad($('#kBcs'), 'BCS を確認してください（1〜5）');
    },
    reset() {
      // 同じ記録（検診の結果・農協提出済 など）を続けて別の牛に入れることが多いので、メモは残す
      ['#kWeight', '#kBcs'].forEach((s) => { $(s).value = ''; });
    },
    card(r, c) {
      // 個体の記録はメモが本体なので、メモを1行目に出す
      const rows = [['牛', c.cow]];
      if (r.memo) rows.push(['記録', c.oneLine(r.memo)]);
      if (r.weight) rows.push(['体重', `${r.weight}kg`]);
      if (r.bcs) rows.push(['BCS', r.bcs]);
      if (!c.isToday) rows.push(['記録日', c.day]);
      return { title: '個体の記録', rows: rows.concat(c.tail.filter(([label]) => label !== 'メモ')) };
    },
    voice(f, h) {
      h.putText($('#kMemo'), f.memo);
      h.put($('#kWeight'), f.weight, '体重');
      h.put($('#kBcs'), f.bcs, 'BCS');
      if (f.weight || f.bcs) $('#kWeight').closest('details').open = true;
    },
  },

  kannyu: {
    title: '乾乳の報告', cow: '牛', date: '乾乳日', color: '#4338ca', farmnote: true, cowCard: true,
    // 乾乳は乾乳セット（いつもの組み合わせの「乾乳：」）が入った状態で開き、続けて入力でも残す
    tx: { label: '乾乳セット（投薬）も入れる', checked: true, preset: '乾乳', keep: true },
    example: '例「ネの300番、乾乳。いつものセット」',
    say: ['牛の番号', '乾乳セット以外に入れた薬（あれば）', 'メモ'],
    collect: (base) => ({ ...base, memo: $('#kaMemo').value.trim(), treatment: collectTx() }),
    reset() {
      $('#kaMemo').value = '';
    },
    card(r, c) {
      const rows = [['牛', c.cow]];
      if (!c.isToday) rows.push(['乾乳日', c.day]);
      return { title: '乾乳の報告', rows: rows.concat(c.tail) };
    },
    voice(f, h) {
      h.putText($('#kaMemo'), f.memo);
    },
  },

  haiyou: {
    title: '死亡・廃用の報告', cow: '牛', date: '死亡・廃用の日', color: '#4b5563', farmnote: true, cowCard: true,
    example: '例「Dの356番、死亡、起立不能」',
    say: ['牛の番号', '死亡か淘汰か', '理由'],
    setup: setupHaiyou,
    collect: (base) => ({ ...base, kind: value('hKind'), reason: $('#hReason').value, memo: $('#hMemo').value.trim() }),
    validate(r, bad) {
      if (!r.kind) bad($('#hKind'), '死亡か淘汰かを選んでください');
      if (!r.reason) bad($('#hReason'), '理由を選んでください');
    },
    reset() {
      ['#hReason', '#hMemo'].forEach((s) => { $(s).value = ''; });
      $$('#hKind input').forEach((el) => { el.checked = false; });
    },
    card(r, c) {
      const rows = [['牛', c.cow], ['理由', r.reason]];
      if (!c.isToday) rows.push(['日付', c.day]);
      return { title: `${r.kind}の報告`, rows: rows.concat(c.tail) };
    },
    voice(f, h) {
      h.pick($('#hKind'), f.kind, '種別');
      h.put($('#hReason'), f.reason, '理由');
      h.putText($('#hMemo'), f.memo);
    },
  },

  idou: {
    title: '牛群移動の報告', cow: '牛', date: '移動日', color: '#1d5fa8', farmnote: true,
    example: '例「ネの446番とネの464番を3群に移動」',
    say: ['牛の番号', '移動先の牛群（3群に・VICに）'],
    setup: setupIdou,
    collect: (base) => ({
      ...base,
      damTag: '',
      damId: '',
      memo: $('#iMemo').value.trim(),
      // 移動先のカードごとの牛を1頭ずつに並べる。空の行は飛ばす。10桁の数字は個体識別番号として送る
      moves: $$('#moveGroups .mgroup').flatMap((g) => $$('.m-cow', g).map(readCowRow).filter(Boolean).map((x) => ({
        ...x,
        herd: g.dataset.herd,
        dir: g.dataset.herd ? g.dataset.group : '', // トークに出す行き先（シートには保存しない）
      }))),
    }),
    validate: validateMoves,
    reset() {
      $('#iMemo').value = '';
      $('#moveGroups').textContent = '';
      addGroup();
    },
    card: (r, c) => idouRows(r, c.day, c.isToday, c.tail),
    voice(f, h) {
      applyMoves(f.moves || [], h.notes);
      h.putText($('#iMemo'), f.memo);
    },
  },

  chiryou: {
    title: '治療の報告', cow: '牛', date: '治療日', color: '#6d28d9', farmnote: true,
    example: '例「ネの145番、乳房炎疑い、メロキシリン5ミリ」',
    say: ['牛の番号（同じ処置なら何頭でも）', '治療区分（治療・ワクチン など）', '薬と量', '疾病名・体温（治療のとき）'],
    ...TREATMENT_REPORT,
    // 次に開いたとき同じ治療区分を選んでおく
    remember(saved, r) {
      saved.chiryouKubun = r.kubun;
    },
  },

  yobou: {
    title: '予防的投与の報告', cow: '牛', date: '投与日', color: '#7c3aed', farmnote: true, fields: 'chiryou',
    example: '例「Kの1547番、コクシックス30ミリ」',
    say: ['牛の番号（何頭でも）', '薬と量'],
    ...TREATMENT_REPORT,
  },

  sairan: {
    title: '採卵用プログラム', cow: '牛', date: '処置日', color: '#be185d', farmnote: true, multiCow: true,
    example: '例「採卵SDの501番、7日目の夕方」',
    say: ['牛の番号', '処置（7日目の夕方 など）'],
    setup: setupSairan,
    collect: (base) => ({
      ...base,
      damTag: '',
      damId: '',
      cows: $$('#cowList .m-cow').map(readCowRow).filter(Boolean),
      step: value('sStep'),
      asayu: value('sAsayu'),
      memo: $('#srMemo').value.trim(),
    }),
    validate: validateSairan,
    reset() {
      // 同じ日の次の処置へ。処置・朝夕を外し、牛は残す（同じドナーに続けて打つことが多い）
      $$('input[name="sStep"], #sAsayu input').forEach((el) => { el.checked = false; });
      $('#srMemo').value = '';
      showStepDrugs();
    },
    card(r, c) {
      const rows = [['処置', [r.step, r.asayu && !r.step.includes(r.asayu) ? `（${r.asayu}）` : ''].join('')], [cowsLabel(r.cows), cowsLine(r.cows)]];
      if (!c.isToday) rows.push(['処置日', c.day]);
      return { title: '採卵用プログラム', rows: rows.concat(c.tail) };
    },
    voice(f, h) {
      applyCows(f.cows || [], h.notes);
      const step = f.step && $$('input[name="sStep"]').find((i) => i.value === f.step);
      if (step && !$$('input[name="sStep"]').some((i) => i.checked && i.closest('.seg').dataset.touched)) {
        step.checked = true;
        step.dispatchEvent(new Event('change', { bubbles: true }));
        step.closest('.seg').classList.add('voiced');
      }
      h.pick($('#sAsayu'), f.asayu, '朝・夕');
      h.putText($('#srMemo'), f.memo);
    },
  },

  // 引き継ぎ: 掲示板の引き継ぎの型（「引き継ぎの型」タブ）どおりの項目で書き、その掲示板に投稿する。牛の欄は無い
  hikitsugi: {
    title: '引き継ぎ', cow: '', date: '日付', color: '#334155', farmnote: false, boardFirst: '引き継ぎ',
    example: '例「1号機の要注意牛はネの41、左前を痛がってる。スラリーは送らないで」',
    say: [], // 引き継ぎ先の型の項目を順に出す（sayItems）
    setup: setupHikitsugi,
    collect: (base) => ({
      ...base,
      damTag: '',
      damId: '',
      memo: '',
      target: value('hTarget'),
      items: collectHandover(),
    }),
    validate(r, bad) {
      if (!r.target) bad($('#hTarget'), '引き継ぎ先を選んでください');
      else if (!Object.values(r.items).some((v) => (Array.isArray(v) ? v.length : v))) bad($('#hItems .h-item textarea, #hItems .h-item input'), '引き継ぐことを入れてください');
    },
    reset() {
      renderHandover();
    },
    card(r, c) {
      // 引き継ぎは型の項目の順に、書いた（選んだ）ものだけを、書いたとおりの改行で出す
      const rows = Object.entries(r.items).map(([name, v]) => [name, Array.isArray(v) ? v.join('・') : v]).filter(([, v]) => v);
      return { title: `${r.target}の引き継ぎ ${c.day}`, rows: rows.concat(c.tail) };
    },
    voice(f, h) {
      // 引き継ぎの型の項目ごと: 文は後ろに足す、選択はボタン、複数選択は複数、日付・数はそのまま
      $$('#hItems .h-item').forEach((card) => {
        const v = (f.items || {})[card.dataset.item];
        if (v == null || v === '') return;
        const type = card.dataset.type;
        if (type === '選択') h.pick($('.seg', card), v, card.dataset.item);
        else if (type === '複数選択') h.pickMany($('.seg', card), Array.isArray(v) ? v : [v], card.dataset.item);
        else if (type === '文') h.putText($('textarea', card), v);
        else h.put($('input', card), v, card.dataset.item);
      });
    },
    // 次に開いたとき同じ引き継ぎ先で開く
    remember(saved, r) {
      saved.handoverTarget = r.target;
    },
    // 選んでいる引き継ぎ先の掲示板を投稿先にし、書き込めないときはそう知らせる
    onBoards() {
      pickHandoverBoard();
      handoverBoardNote();
    },
    // 話す順は、選んだ引き継ぎ先の型の項目の順
    sayItems() {
      const t = currentTemplate();
      return t ? t.items.map((it) => [it.name, it.type === '選択' || it.type === '複数選択' ? it.options.map((o) => o.split('：')[0]).slice(0, 4).join('・') : it.note]) : [];
    },
  },

  // バンカーの餌の変更: Farmnote の活動ではない（「バンカー餌変更」タブに1変更1行）。牛の欄は無い。
  // バンカー・餌は「バンカー」「餌」タブに候補があればタップで入る（無くても自由に入れる）
  bunker: {
    title: 'バンカーの餌の変更', cow: '', date: '変更日', color: '#a16207', farmnote: false,
    example: '例「2番バンカー、一番草から二番草サイレージに切り替え。8時10分」',
    say: ['バンカー（2番バンカー）', '変更内容（切り替え・詰め込み開始・使い切り）', '変更前の餌と変更後の餌（一番草から二番草に）', '時刻（わかれば）'],
    setup: setupBunker,
    collect: (base) => ({
      ...base,
      damTag: '',
      damId: '',
      bunker: $('#bBunker').value.trim(),
      time: $('#bTime').value,
      change: value('bChange'),
      before: $('#bBefore').value.trim(),
      after: $('#bAfter').value.trim(),
      memo: $('#bMemo').value.trim(),
    }),
    validate(r, bad) {
      if (!r.bunker) bad($('#bBunker'), 'バンカーを入れてください');
      if (!r.change) bad($('#bChange'), '変更内容を選んでください');
      else if (r.change !== BUNKER_EMPTIED && !r.after) bad($('#bAfter'), '変更後の餌を入れてください');
    },
    reset() {
      // 続けて別のバンカーを入れることが多いので、日付・作業者は残し、ほかは空にする（変更内容は最初の「餌の切り替え」に戻す）
      ['#bBunker', '#bBefore', '#bAfter', '#bTime', '#bMemo'].forEach((s) => { $(s).value = ''; });
      check('bChange', (state.choices.bunkerChange || [])[0]);
      applyBunkerChange();
      renderBunkerChips();
    },
    card(r, c) {
      const rows = [['バンカー', r.bunker], ['変更', r.change]];
      if (r.before || r.after) rows.push(['餌', `${r.before || '（未記入）'} → ${r.after || '（なし）'}`]);
      // 今日なら時刻（入れた時刻か送信した時刻）、後から報告したときは日付（と入れた時刻）
      rows.push(c.isToday ? ['時刻', r.time || c.time] : ['日付', [c.day, r.time].filter(Boolean).join(' ')]);
      return { title: 'バンカーの餌の変更', rows: rows.concat(c.tail) };
    },
    voice(f, h) {
      h.put($('#bBunker'), f.bunker, 'バンカー');
      h.pick($('#bChange'), f.change, '変更内容');
      h.put($('#bBefore'), f.before, '変更前の餌');
      h.put($('#bAfter'), f.after, '変更後の餌');
      h.put($('#bTime'), f.time, '時刻');
      h.putText($('#bMemo'), f.memo);
    },
    onFarm: () => renderBunkerChips(),
  },

  // 薬品在庫の確認（週1回）: 置き場所の品目（「薬品在庫の品目」タブ）をすべて数えて入れる。Farmnote の活動ではない（「薬品在庫」タブに1品目1行）。
  // MIN を下回った品目は赤くなり、トークのカードに MAX までの補充の数が出る
  zaiko: {
    title: '薬品在庫の確認', cow: '', date: '確認日', color: '#0e7490', farmnote: false,
    example: '例「セフロキシム22、セファゼット12、タイニーPK 9、シリンジ5ml 80」',
    say: ['品目と残りの数を、数えた順に（セフロキシム22、タイニーPK 9）', '無い品目は「ゼロ」', 'メモ（希望から借りた薬など）'],
    setup: setupZaiko,
    collect: (base) => ({
      ...base,
      damTag: '',
      damId: '',
      place: value('zPlace'),
      counts: $$('#zItems .z-item').map((node) => ({ name: node.dataset.name, count: $('.z-count', node).value.trim() })),
      memo: $('#zMemo').value.trim(),
    }),
    validate: validateZaiko,
    reset() {
      // 次の置き場所を続けて数えることがあるので、置き場所・日付・作業者は残し、数とメモを空にする
      $$('#zItems .z-count').forEach((el) => { el.value = ''; });
      $('#zMemo').value = '';
      renderStockState();
    },
    card(r, c) {
      const counted = stockCounted(r);
      const need = counted.filter((x) => x.need);
      // 補充が要る品目だけを1行ずつ（「タイニーPK：残り9本 → 21本補充」）。ほかは数だけ
      const rows = need.map((x) => [x.name, `残り${x.count}${x.unit}${x.refill !== null ? ` → ${x.refill}${x.unit}補充` : ''}`]);
      rows.push(need.length ? ['ほか', `${counted.length - need.length}品目はMIN以上`] : ['品目', `${counted.length}品目すべてMIN以上`]);
      if (!c.isToday) rows.push(['確認日', c.day]);
      // 補充が要るときは見出しを赤くし、品目の数を見出しに出す（トークの一覧でも分かるように）
      const title = `薬品在庫 ${r.place}：${need.length ? `補充${need.length}品目` : '補充なし'}`;
      return { title, rows: rows.concat(c.tail), color: need.length ? '#b91c1c' : '' };
    },
    voice(f, h) {
      // 話した品目の欄に数を入れる（手で入れた欄は変えない）。この置き場所に無い品目は要確認
      (f.counts || []).forEach((x) => {
        const node = $$('#zItems .z-item').find((n) => n.dataset.name === x.name);
        if (node) h.put($('.z-count', node), x.count, x.name);
        else h.notes.push(`品目「${x.name}」: 声では${x.count}（${value('zPlace')}の品目に無い）`);
      });
      h.putText($('#zMemo'), f.memo);
      renderStockState();
    },
    // 次に開いたとき同じ置き場所で開く
    remember(saved, r) {
      saved.zaikoPlace = r.place;
    },
    onFarm: () => renderPlaces(),
  },
};

// ---------- 種類ごとの欄の作り ----------

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

/** 乳房炎（疑い）: 分房は複数選べる。原因菌の既定は「未特定（疑い）」 */
function setupNyuboen() {
  multiSegment($('#nQuarters'), 'nQuarters', state.choices.quarter, []);
  fillSelect($('#nBacteria'), state.choices.bacteria, '未特定（疑い）');
  segment($('#nSeverity'), 'nSeverity', state.choices.severity, '');
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

function setupHaiyou() {
  segment($('#hKind'), 'hKind', state.choices.haiyouKind, '');
  fillSelect($('#hReason'), state.choices.haiyouReason, '選択してください');
}

function setupIdou() {
  $('#addGroup').addEventListener('click', () => addGroup());
  addGroup();
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

/** バンカーの餌の変更: 変更内容のボタン（最初は「餌の切り替え」）と、バンカー・餌の候補のボタン（入れている文字に合うもの） */
function setupBunker() {
  const changes = state.choices.bunkerChange || [];
  segment($('#bChange'), 'bChange', changes, changes[0] || '');
  $$('#bChange input').forEach((el) => el.addEventListener('change', applyBunkerChange));
  [['#bBunker', '#bBunkerHits', 'bunkers'], ['#bBefore', '#bBeforeHits', 'feeds'], ['#bAfter', '#bAfterHits', 'feeds']].forEach(([input, box, key]) => {
    ['input', 'focus'].forEach((ev) => $(input).addEventListener(ev, () => candidateChips($(input), $(box), key)));
  });
  applyBunkerChange();
  renderBunkerChips();
}

/** 使い切り（空になった）のときは変更後の餌が無くてよい */
function applyBunkerChange() {
  $('#bAfterLabel').classList.toggle('req', value('bChange') !== BUNKER_EMPTIED);
}

/** バンカーの候補を出し、餌の候補は閉じる（牧場を選び直したとき・続けて入力するとき） */
function renderBunkerChips() {
  candidateChips($('#bBunker'), $('#bBunkerHits'), 'bunkers');
  ['#bBeforeHits', '#bAfterHits'].forEach((s) => { $(s).textContent = ''; });
}

/** 今の牧場の候補（「バンカー」「餌」タブ）のうち、入れている文字に合うものをボタンで出す（8つまで）。押すとその名前が入る */
function candidateChips(input, box, key) {
  box.textContent = '';
  const farm = currentFarm();
  const q = normalize(input.value);
  ((farm && farm[key]) || []).filter((name) => !q || (normalize(name).includes(q) && normalize(name) !== q)).slice(0, 8).forEach((name) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = name;
    b.addEventListener('click', () => {
      input.value = name;
      input.dataset.touched = '1';
      input.classList.remove('invalid');
      box.textContent = '';
      state.pendingId = '';
    });
    box.append(b);
  });
}

/**
 * 薬品在庫の確認: 置き場所のボタン（2つ以上のときだけ出す）と、品目ごとの数の欄。品目は牧場を選び直したとき（onFarm）に作る。
 * 数を入れるたびに、MIN を下回った品目を赤くし、入れた品目の数を出す。Enter で次の品目へ
 */
function setupZaiko() {
  $('#zItems').addEventListener('input', (e) => { if (e.target.matches('.z-count')) renderStockState(); });
  $('#zItems').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('.z-count')) return;
    e.preventDefault();
    const all = $$('#zItems .z-count');
    const next = all[all.indexOf(e.target) + 1];
    if (next) next.focus();
    else e.target.blur();
  });
}

/** 今の牧場の薬品在庫の品目（「薬品在庫の品目」タブ）の置き場所。前回の置き場所で開く（端末ごと） */
function renderPlaces() {
  const farm = currentFarm();
  const places = [...new Set(((farm && farm.stock) || []).map((x) => x.place))];
  const cur = value('zPlace') || loadSaved().zaikoPlace;
  segment($('#zPlace'), 'zPlace', places, places.includes(cur) ? cur : places[0] || '');
  $$('#zPlace input').forEach((el) => el.addEventListener('change', renderStock));
  $('#zPlaceCard').hidden = places.length < 2;
  renderStock();
}

/** その置き場所の品目（設定の順） */
function stockItems(place) {
  const farm = currentFarm();
  return ((farm && farm.stock) || []).filter((x) => x.place === place);
}

/** 選んでいる置き場所の品目を、区分ごとのカードに数の欄で並べる。置き場所を選び直しても、同じ品目に入れた数は残す */
function renderStock() {
  const box = $('#zItems');
  const prev = Object.fromEntries($$('.z-item', box).map((n) => [n.dataset.name, $('.z-count', n).value]));
  box.textContent = '';
  const items = stockItems(value('zPlace'));
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'errors';
    p.textContent = '数える品目がありません。管理者が「薬品在庫の品目」タブに品目を入れると使えます';
    box.append(p);
  }
  let card = null;
  items.forEach((it, i) => {
    if (!card || it.group !== items[i - 1].group) {
      card = document.createElement('section');
      card.className = 'card';
      if (it.group) {
        const h = document.createElement('h2');
        h.textContent = it.group;
        card.append(h);
      }
      box.append(card);
    }
    const tpl = $('#stockItemTpl').content.cloneNode(true);
    const node = $('.z-item', tpl);
    node.dataset.name = it.name;
    $('.z-label', node).textContent = it.name;
    $('.z-spec', node).textContent = [it.spec, it.min !== null || it.max !== null ? `MIN ${it.min !== null ? it.min : '－'}・MAX ${it.max !== null ? it.max : '－'}` : '']
      .filter(Boolean).join('　');
    $('.z-unit', node).textContent = it.unit;
    const input = $('.z-count', node);
    input.setAttribute('aria-label', `${it.name}の数`);
    input.value = prev[it.name] || '';
    card.append(tpl);
  });
  renderStockState();
}

/** 入れた数を見て、MIN を下回った品目を赤くして補充の数を出し、上に「入れた品目の数・補充が要る品目の数」を出す */
function renderStockState() {
  const items = stockItems(value('zPlace'));
  let filled = 0;
  let low = 0;
  $$('#zItems .z-item').forEach((node) => {
    const it = items.find((x) => x.name === node.dataset.name);
    const v = $('.z-count', node).value.trim();
    const x = it && /^\d+$/.test(v) ? stockJudge(it, Number(v)) : null;
    if (x) filled++;
    if (x && x.need) low++;
    node.classList.toggle('low', Boolean(x && x.need));
    $('.z-need', node).hidden = !(x && x.need);
    $('.z-need', node).textContent = x && x.need ? `MIN ${it.min} を下回っています${x.refill !== null ? `（MAX ${it.max} まで ${x.refill}${it.unit} 補充）` : ''}` : '';
  });
  $('#zProgress').textContent = items.length ? `${items.length}品目のうち ${filled}品目を入れました${low ? `。補充が要るのは ${low}品目` : ''}` : '';
}

/** 1品目の判定（Apps Script の validateZaiko_ と同じ）: 在庫数が MIN を下回ったら補充が要り、補充の数は MAX まで */
function stockJudge(it, count) {
  const need = it.min !== null && count < it.min;
  return { ...it, count, need, refill: need && it.max !== null ? Math.max(it.max - count, 0) : null };
}

/** 送った薬品在庫の品目ごとの判定（カード用） */
function stockCounted(r) {
  const items = stockItems(r.place);
  return r.counts.map((x) => {
    const it = items.find((y) => y.name === x.name) || { name: x.name, unit: '', min: null, max: null };
    return stockJudge(it, Number(x.count));
  });
}

// ---------- 種類ごとの入力チェック・カード ----------

/** 分娩: 出産のときは子牛の番号・体重・時刻・分娩難易まで必須。死産・流産はわかる範囲で */
function validateBunben(r, bad) {
  const birth = r.kind === '出産';
  if (birth && !r.difficulty) bad($('#difficulty'), '分娩難易を選んでください');
  const nodes = $$('#calves .calf');
  r.calves.forEach((c, i) => {
    const node = nodes[i];
    const no = r.calves.length > 1 ? `子牛${i + 1}` : '子牛';
    const midEl = $('.c-mid', node);
    const typed = toDigits(midEl.value);
    const owner = value(null, $('.c-owner', node));
    if (!c.noId && typed && !c.id) {
      if (!owner) bad($('.c-owner', node), `${no}が希望の牛かDPの牛かを選んでください`);
      else bad(midEl, `${no}の個体識別番号は真ん中の4桁（か10桁）で入れてください`);
    }
    if (c.id && !validCowId(c.id)) bad(midEl, `${no}の個体識別番号の最後の1桁が合いません。番号を確かめてください`);
    if (birth && !c.id && !c.noId && !typed) bad(midEl, `${no}の個体識別番号（真ん中の4桁）を入れてください（まだ付けていなければチェック）`);
    if (birth && !c.weight && !c.noWeight) bad($('.c-weight', node), `${no}の出生時体重を入れてください（測れなかったらチェック）`);
    const required = birth || hasCalfInfo(c);
    if (required && !c.sex) bad($('.c-sex', node), `${no}の性別を選んでください`);
    if (required && !c.breed) bad($('.c-breed', node), `${no}の品種を選んでください`);
    if (required && !c.type) bad($('.c-type', node), `${no}のタイプを選んでください`);
    if (c.weight && !(Number(c.weight) > 0 && Number(c.weight) < 100)) bad($('.c-weight', node), `${no}の体重を確認してください`);
  });
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
  if (!tempOk(r.temp)) bad($('#cTemp'), '体温を確認してください（35〜43℃）');
}

/** 採卵の処置: 牛と処置 */
function validateSairan(r, bad) {
  checkCowRows($$('#cowList .m-cow'), bad, new Set(), '');
  if (!r.step) $$('.sStepSeg').forEach((s, i) => (i === 0 ? bad(s, '処置を選んでください') : s.classList.add('invalid')));
}

/** 薬品在庫: 置き場所の品目すべてに数（0以上の整数。無ければ0）。入っていない品目はまとめて1つのエラーにして、欄をすべて赤くする */
function validateZaiko(r, bad) {
  if (!stockItems(r.place).length) {
    bad(null, '数える品目がありません（管理者が「薬品在庫の品目」タブに品目を入れると使えます）');
    return;
  }
  const inputs = $$('#zItems .z-count');
  const empty = inputs.filter((el) => el.value.trim() === '');
  const wrong = inputs.filter((el) => el.value.trim() !== '' && !/^\d{1,5}$/.test(el.value.trim()));
  empty.forEach((el, i) => (i === 0 ? bad(el, `数を入れてください（${empty.length}品目。無いものは0）`) : el.classList.add('invalid')));
  wrong.forEach((el, i) => (i === 0 ? bad(el, '数は0以上の整数で入れてください') : el.classList.add('invalid')));
}

/** 体温は 35〜43℃（空ならよい） */
function tempOk(t) {
  return !t || (Number(t) >= 35 && Number(t) <= 43);
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

/** カードの牛の行（「ネ145・D356」と「2頭」） */
function cowsLine(cows) {
  return cows.map((c) => c.tag || c.id).join('・');
}

function cowsLabel(cows) {
  return cows.length > 1 ? `${cows.length}頭` : '牛';
}
