/* =========================================================
   JEU DES OEUFS — player.js
   Tela do aluno: entrada por PIN, personagem, texto com vocabulário
   sublinhado, ovos, "próximo parágrafo" e ranking ao vivo.
   Cada aluno avança sozinho — ninguém espera os outros.
   ========================================================= */

const PAGE = document.body.dataset.page;   // 'entrada' | 'jogo'
const SAVE_KEY = 'oeufs_player_v1';

const P = {
  pin:null, id:null, apelido:'', personagem:null,
  etapa:'pin',          // pin | carrossel | apelido | jogo
  carIndex:0,
  fase:'lobby',         // lobby | jogo
  meta:{ titulo:'' },
  paragrafos:null,      // [{texto, vocabulario:[{termo,traducao,nivel}]}]
  par:0,                // parágrafo atual deste aluno
  ovos:OVOS_INICIAIS,
  revelados:{},         // { parágrafo: { indiceDoVocab: true } }
  terminou:false,
  aba:'texto',          // texto | ranking
  fala:false,           // leitura em voz alta (francês) — começa desativada
  ultima:null,          // último vocábulo clicado {p, v}
  jogadores:{},
  erro:'', resumed:false
};

let listeners = [];

/* =========================================================
   PERSISTÊNCIA
   ========================================================= */
function salvar(){
  saveState(SAVE_KEY, { v:1, pin:P.pin, id:P.id, apelido:P.apelido, personagem:P.personagem });
}
function esquecer(){ clearState(SAVE_KEY); }
function sairDoJogo(){
  if(!confirm('Sair do jogo? Você precisará entrar de novo com o PIN.')) return;
  playSound('click');
  esquecer();
  location.href = 'index.html';
}

/* o Firebase devolve chaves numéricas seguidas como array — normaliza */
function normRev(r){
  const o = {};
  Object.keys(r || {}).forEach(p => {
    const inner = r[p];
    if(!inner) return;
    o[p] = {};
    Object.keys(inner).forEach(v => { if(inner[v]) o[p][v] = true; });
  });
  return o;
}
function listaDe(x){
  if(Array.isArray(x)) return x.filter(Boolean);
  return Object.values(x || {});
}

/* =========================================================
   RENDER
   ========================================================= */
function render(){
  fecharBalao();
  renderTopbar();
  const c = document.getElementById('content');
  if(PAGE === 'entrada'){ c.innerHTML = telaPin(); focarPin(); return; }
  if(P.etapa === 'carrossel'){ c.innerHTML = telaCarrossel(); montarSwipe(); return; }
  if(P.etapa === 'apelido'){ c.innerHTML = telaApelido(); return; }
  if(P.fase !== 'jogo'){ c.innerHTML = telaEspera(); return; }
  if(P.terminou){ c.innerHTML = telaFim(); return; }
  c.innerHTML = telaJogo();
}

function renderTopbar(){
  const bar = document.getElementById('topbar');
  if(PAGE === 'entrada'){
    bar.innerHTML = `
      <div class="topbar-row">
        <img src="images/logo_fad.png" alt="" class="topbar-logo" onerror="this.style.display='none'">
        <span class="level-label">jeu des oeufs</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>`;
    return;
  }
  const total = P.paragrafos ? P.paragrafos.length : 0;
  const pct = (P.fase === 'jogo' && total) ? Math.round((P.terminou ? total : P.par) / total * 100) : 0;
  const label = P.pin ? `jeu des oeufs · pin ${P.pin}` : 'jeu des oeufs';
  bar.innerHTML = `
    ${P.resumed ? `<span class="resume-note">progresso retomado de onde você parou</span>` : ''}
    <div class="topbar-row">
      <span class="level-label">${esc(label)}</span>
      <button class="mute-btn" title="som" onclick="alternarSom(this)">${som.icon()}</button>
      <button class="restart-btn" title="sair do jogo" onclick="sairDoJogo()">&#8634;</button>
      <span class="ovos-badge${P.ovos <= 10 ? ' baixo' : ''}" id="ovosBadge">🥚 ${formatScore(P.ovos)}</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>`;
}
function alternarSom(btn){ btn.innerText = som.toggle() ? '🔇' : '🔊'; }

/* =========================================================
   TELA 1 — ENTRADA POR PIN (index.html)
   ========================================================= */
function telaPin(){
  const salvo = loadState(SAVE_KEY);
  const retomar = (salvo && salvo.pin && salvo.id)
    ? `<button class="btn-ghost btn" style="margin-top:10px" onclick="retomarSessao()">voltar ao jogo ${esc(salvo.pin)}</button>` : '';
  const url = new URL(location.href);
  const pinUrl = (url.searchParams.get('pin') || '').replace(/\D/g,'').slice(0,6);
  return `
    <div class="home-card">
      <div class="ovo-grande">🥚</div>
      <h1>jeu des oeufs</h1>
      <p class="home-sub">Digite o PIN que aparece na tela do professor.</p>
      <input id="pinInput" class="pin-input" inputmode="numeric" pattern="[0-9]*"
             maxlength="6" placeholder="000000" value="${esc(pinUrl)}"
             oninput="this.value=this.value.replace(/\\D/g,'')"
             onkeydown="if(event.key==='Enter') entrarPorPin()">
      ${P.erro ? `<div class="gabarito">${P.erro}</div>` : ''}
      ${retomar}
    </div>
    <div class="footer-space"></div>
    <button class="btn btn-block" onclick="entrarPorPin()">entrar</button>
    <button class="btn-ghost btn" style="margin-top:10px" onclick="irParaHost()">sou professor</button>`;
}
function irParaHost(){ playSound('click'); location.href = 'host.html'; }
function focarPin(){
  const el = document.getElementById('pinInput');
  if(el && !el.value) setTimeout(() => el.focus(), 120);
  if(el && el.value.length === 6 && !P.erro) entrarPorPin();
}
function retomarSessao(){
  const salvo = loadState(SAVE_KEY);
  if(!salvo || !salvo.pin) return;
  playSound('click');
  location.href = 'player.html?pin=' + encodeURIComponent(salvo.pin);
}
async function entrarPorPin(){
  playSound('click');
  const el = document.getElementById('pinInput');
  const pin = (el ? el.value : '').replace(/\D/g,'');
  if(pin.length !== 6){ P.erro = 'O PIN tem 6 dígitos. Confira na tela do professor.'; render(); return; }
  if(!db){ P.erro = 'Sem conexão com o servidor. Recarregue a página.'; render(); return; }
  try{
    const snap = await gameRef(pin,'meta').get();
    if(!snap.exists()){ P.erro = `Nenhum jogo encontrado com o PIN ${pin}.`; render(); return; }
    location.href = 'player.html?pin=' + encodeURIComponent(pin);
  }catch(e){
    P.erro = 'Não foi possível consultar o jogo. Verifique a conexão.';
    render();
  }
}

/* =========================================================
   TELA 2 — CARROSSEL DE PERSONAGENS
   ========================================================= */
function telaCarrossel(){
  const n = PERSONAGENS.length;
  const i = P.carIndex;
  const esqI = (i - 1 + n) % n, dirI = (i + 1) % n;
  const item = (idx, cls) => {
    const p = PERSONAGENS[idx];
    return `
      <div class="car-item ${cls}" onclick="irPara(${idx})">
        ${cls === 'car-center' ? `<span class="carousel-name">${esc(p.nome)}</span>` : ''}
        <img src="${charSrc(p.retrato)}" alt="${esc(p.nome)}" onerror="this.onerror=null;this.src=avatarFallback('${jsStr(p.nome)}')">
      </div>`;
  };
  const dots = PERSONAGENS.map((_,k) => `<span class="car-dot ${k===i?'on':''}"></span>`).join('');
  return `
    <div class="question-card">
      <p class="instruction">escolha o seu personagem</p>
      <div class="carousel" id="carousel">
        <button class="car-arrow" onclick="girar(-1)" aria-label="anterior">‹</button>
        <div class="carousel-stage">
          ${item(esqI,'car-side')}
          ${item(i,'car-center')}
          ${item(dirI,'car-side')}
        </div>
        <button class="car-arrow" onclick="girar(1)" aria-label="próximo">›</button>
      </div>
      <div class="car-dots">${dots}</div>
    </div>
    <div class="footer-space"></div>
    <button class="btn btn-block" onclick="escolherPersonagem()">escolher</button>`;
}
function girar(d){
  playSound('click');
  const n = PERSONAGENS.length;
  P.carIndex = (P.carIndex + d + n) % n;
  render();
}
function irPara(idx){ if(idx === P.carIndex) return; playSound('click'); P.carIndex = idx; render(); }
function montarSwipe(){
  const el = document.getElementById('carousel');
  if(!el) return;
  let x0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive:true });
  el.addEventListener('touchend', e => {
    if(x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if(Math.abs(dx) > 40) girar(dx < 0 ? 1 : -1);
    x0 = null;
  }, { passive:true });
}
function escolherPersonagem(){
  playSound('click');
  P.personagem = PERSONAGENS[P.carIndex].nome;
  P.apelido = P.personagem;
  P.etapa = 'apelido';
  render();
}

/* =========================================================
   TELA 3 — APELIDO
   ========================================================= */
function telaApelido(){
  const p = charByName(P.personagem);
  return `
    <div class="question-card">
      <p class="instruction">como você quer aparecer no ranking?</p>
      <img src="${charSrc(p.retrato)}" alt="${esc(p.nome)}" style="width:130px;height:130px;border-radius:50%;object-fit:cover;border:3px solid var(--amarelo);margin-bottom:14px" onerror="this.onerror=null;this.src=avatarFallback('${jsStr(p.nome)}')">
      <p class="field-label">seu apelido</p>
      <input id="nickInput" class="text-input" maxlength="18" value="${esc(P.apelido)}"
             onkeydown="if(event.key==='Enter') entrarNoJogo()">
      ${P.erro ? `<div class="gabarito">${P.erro}</div>` : ''}
    </div>
    <button class="btn-ghost btn" onclick="voltarCarrossel()">trocar de personagem</button>
    <div class="footer-space"></div>
    <button class="btn btn-block" id="joinBtn" onclick="entrarNoJogo()">entrar no jogo</button>`;
}
function voltarCarrossel(){ playSound('click'); P.erro = ''; P.etapa = 'carrossel'; render(); }

async function entrarNoJogo(){
  playSound('click');
  const el = document.getElementById('nickInput');
  const nome = (el ? el.value : '').trim();
  if(nome.length < 2){ P.erro = 'Escolha um apelido com pelo menos 2 letras.'; render(); return; }
  const btn = document.getElementById('joinBtn');
  if(btn){ btn.disabled = true; btn.innerText = 'entrando…'; }
  try{
    const jog = (await gameRef(P.pin,'jogadores').get()).val() || {};
    const existe = Object.values(jog).some(j => (j.apelido||'').toLowerCase() === nome.toLowerCase());
    if(existe){ P.erro = `Já existe alguém chamado "${esc(nome)}" nesse jogo. Escolha outro apelido.`; render(); return; }

    const ref = gameRef(P.pin,'jogadores').push();
    P.id = ref.key;
    P.apelido = nome;
    await ref.set({
      apelido: nome, personagem: P.personagem,
      ovos: OVOS_INICIAIS, paragrafo: 0, terminou: false, entrouEm: SERVER_TS
    });
    salvar();
    P.erro = ''; P.etapa = 'jogo';
    ouvirJogo();
    render();
  }catch(e){
    P.erro = 'Não foi possível entrar. Verifique a conexão e tente de novo.';
    render();
  }
}

/* =========================================================
   ESPERA
   ========================================================= */
function telaEspera(){
  const n = Object.keys(P.jogadores).length;
  return `
    <div class="home-card">
      <img src="${retratoDe(P.personagem)}" alt="${esc(P.personagem)}" class="mascot-img" style="border-radius:50%;object-fit:cover;border:3px solid var(--amarelo)" onerror="this.onerror=null;this.src=avatarFallback('${jsStr(P.personagem||'')}')">
      <h1>aguardando o professor começar…</h1>
      <p class="home-sub">Você está no jogo como <strong>${esc(P.apelido)}</strong>.</p>
      <div class="level-preview">
        <div class="level-chip"><span class="chip-num">🥚</span> ${OVOS_INICIAIS} ovos para começar <span class="chip-pts">${n} na sala</span></div>
      </div>
    </div>
    <div class="footer-space"></div>
    <div class="footer-brand"><span>${esc(P.meta.titulo || 'jeu des oeufs')}</span></div>`;
}

/* =========================================================
   JOGO — PARÁGRAFO ATUAL
   ========================================================= */
function telaJogo(){
  const abas = `
    <div class="abas">
      <button class="aba ${P.aba==='texto'?'on':''}" onclick="trocarAba('texto')">texto</button>
      <button class="aba ${P.aba==='ranking'?'on':''}" onclick="trocarAba('ranking')">ranking${posicaoEu() ? ' · ' + posicaoEu() + 'º' : ''}</button>
      <button class="aba aba-fala ${P.fala?'on':''}" onclick="alternarFala()" aria-pressed="${P.fala}" title="ler as palavras em voz alta, em francês">${P.fala ? '🔊' : '🔇'} fala</button>
    </div>`;
  if(P.aba === 'ranking') return abas + cardRanking() + `<div class="footer-space"></div>`;
  if(!P.paragrafos) return abas + `<div class="home-card" style="animation:none"><p class="home-sub">carregando o texto…</p></div>`;
  return abas + cardParagrafo();
}

function posicaoEu(){
  const e = listaRanking(P.jogadores).find(j => j.id === P.id);
  return e ? e.pos : null;
}
function trocarAba(a){ if(P.aba === a) return; playSound('click'); P.aba = a; render(); }

/* =========================================================
   FALA — lê o termo em francês a cada clique (só se ativada)
   velocidade: 60% da anterior (0.9 × 0.6 = 0.54)
   sem atraso: fala no instante do clique
   ========================================================= */
const FALA_VELOCIDADE = 0.54;
let falaTimer = null;

function vozFrancesa(){
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  return vs.find(v => /^fr[-_]FR/i.test(v.lang)) || vs.find(v => /^fr/i.test(v.lang)) || null;
}

/* cancela fala em andamento e qualquer fala agendada */
function pararFala(){
  if(falaTimer){ clearTimeout(falaTimer); falaTimer = null; }
  try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
}

/* fala imediatamente (usado só pelo "Bonjour" de confirmação) */
function falarAgora(texto){
  if(!window.speechSynthesis || !texto) return;
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(texto));
    u.lang = 'fr-FR';                       // sempre francês
    const v = vozFrancesa();
    if(v){ u.voice = v; u.lang = v.lang; }
    u.rate = FALA_VELOCIDADE;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* fala na hora, no clique (só se a fala estiver ativada) */
function falar(texto){
  if(!P.fala || !window.speechSynthesis || !texto) return;
  falarAgora(texto);
}

function alternarFala(){
  if(!window.speechSynthesis){ alert('Este aparelho não tem leitura de voz disponível.'); return; }
  P.fala = !P.fala;
  playSound('click');
  if(P.fala) falarAgora('Bonjour');         // confirma e libera o áudio no celular
  else pararFala();
  render();
}
if(window.speechSynthesis && speechSynthesis.addEventListener){
  speechSynthesis.addEventListener('voiceschanged', () => {});   // carrega a lista de vozes
}

function htmlTexto(pi){
  const p = P.paragrafos[pi];
  const vocab = listaDe(p.vocabulario);
  const { segs } = segmentarTexto(p.texto, vocab);
  const rev = P.revelados[pi] || {};
  return segs.map(s => {
    if(s.v === null) return esc(s.t);
    return `<span class="voc${rev[s.v] ? ' aberto' : ''}" style="--c:${corNivel(vocab[s.v].nivel)}" onclick="clicarVoc(${s.v}, this)">${esc(s.t)}</span>`;
  }).join('');
}

/* legenda: cada cor mostra quantos ovos custa o primeiro clique */
function legenda(){
  const itens = [];
  for(let n = 1; n <= 10; n++){
    const c = custoNivel(n);
    const rot = c === 0 ? 'grátis' : (n >= 10 ? c + '+' : String(c)) + '🥚';
    itens.push(`<div class="legenda-item"><span class="legenda-cor" style="background:${corNivel(n)}"></span>${rot}</div>`);
  }
  return `
    <div class="legenda">${itens.join('')}</div>
    <p class="legenda-nota">toque no vocábulo para ver a tradução · a cor indica quantos ovos custa (só na primeira vez)</p>`;
}

/* =========================================================
   BALÃO DE TRADUÇÃO — abre ao clicar na palavra; pode clicar
   quantas vezes quiser (o custo em ovos é cobrado uma só vez)
   ========================================================= */
function fecharBalao(){
  P.balao = null;
  const b = document.getElementById('balao');
  if(b) b.remove();
  document.querySelectorAll('.voc.ativo').forEach(e => e.classList.remove('ativo'));
}

function abrirBalao(el, v, custoCobrado){
  let b = document.getElementById('balao');
  if(b) b.remove();
  document.querySelectorAll('.voc.ativo').forEach(e => e.classList.remove('ativo'));
  el.classList.add('ativo');
  b = document.createElement('div');
  b.id = 'balao';
  b.className = 'balao';
  b.style.setProperty('--c', corNivel(v.nivel));
  b.innerHTML = `
    <div class="balao-termo">${esc(v.termo)}</div>
    <div class="balao-trad">${esc(v.traducao)}</div>
    ${custoCobrado > 0 ? `<div class="balao-custo">−${custoCobrado} 🥚</div>` : ''}
    <span class="balao-seta"></span>`;
  document.body.appendChild(b);

  /* posiciona acima da palavra (ou abaixo, se não couber), dentro da tela */
  const r = el.getBoundingClientRect();
  const bw = b.offsetWidth, bh = b.offsetHeight;
  const vw = document.documentElement.clientWidth;
  let left = r.left + r.width / 2 - bw / 2;
  left = Math.max(8, Math.min(left, vw - bw - 8));
  let topo = r.top - bh - 12;
  let abaixo = false;
  if(topo < 8){ topo = r.bottom + 12; abaixo = true; }
  b.style.left = (left + window.scrollX) + 'px';
  b.style.top  = (topo + window.scrollY) + 'px';
  b.classList.toggle('abaixo', abaixo);
  const seta = b.querySelector('.balao-seta');
  const sx = Math.max(14, Math.min(bw - 14, r.left + r.width / 2 - left));
  seta.style.left = sx + 'px';
}

/* clique fora de uma palavra ou do balão fecha o balão */
document.addEventListener('click', e => {
  if(!P.balao) return;
  if(e.target.closest && (e.target.closest('.voc') || e.target.closest('#balao'))) return;
  fecharBalao();
});

function cardParagrafo(){
  const total = P.paragrafos.length;
  const ultimo = P.par + 1 >= total;
  return `
    <div class="question-card" style="animation:none">
      <p class="par-contador">parágrafo ${P.par + 1} de ${total}</p>
      <div class="texto-par">${htmlTexto(P.par)}</div>
      ${legenda()}
    </div>
    <div class="footer-space"></div>
    <div class="nav-par">
      ${P.par > 0 ? `<button class="btn btn-ghost" onclick="voltarParagrafo()">← voltar</button>` : ''}
      <button class="btn" onclick="proximoParagrafo()">${ultimo ? 'terminar' : 'próximo parágrafo →'}</button>
    </div>`;
}

/* clique no vocábulo: revela a tradução e cobra os ovos (só na primeira vez) */
function clicarVoc(vi, el){
  if(!P.paragrafos || !P.id) return;
  const pi = P.par;
  const vocab = listaDe(P.paragrafos[pi].vocabulario);
  const v = vocab[vi];
  if(!v) return;
  falar(v.termo);                             // sem atraso
  if(!P.revelados[pi]) P.revelados[pi] = {};
  P.ultima = { p:pi, v:vi };

  let cobrado = 0;
  if(!P.revelados[pi][vi]){
    const custo = custoNivel(v.nivel);
    cobrado = custo;
    P.revelados[pi][vi] = true;
    P.ovos = Math.max(0, P.ovos - custo);
    const up = {};
    up[`jogadores/${P.id}/ovos`] = P.ovos;
    up[`jogadores/${P.id}/revelados/${pi}/${vi}`] = true;
    try{ gameRef(P.pin).update(up); }catch(e){}
    if(el) el.classList.add('aberto');
    renderTopbar();
    const b = document.getElementById('ovosBadge');
    if(b){ b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 450); }
  }
  playSound('clicksuave');
  P.balao = { p:pi, v:vi };
  if(el) abrirBalao(el, v, cobrado);
}

function voltarParagrafo(){
  if(!P.paragrafos || P.par <= 0) return;
  playSound('click');
  P.ultima = null;
  P.par--;
  pararFala();
  const up = {};
  up[`jogadores/${P.id}/paragrafo`] = P.par;
  try{ gameRef(P.pin).update(up); }catch(e){}
  render();
  window.scrollTo(0, 0);
}

function proximoParagrafo(){
  if(!P.paragrafos) return;
  const total = P.paragrafos.length;
  playSound('fase');
  P.ultima = null;
  pararFala();
  const up = {};
  if(P.par + 1 < total){
    P.par++;
    up[`jogadores/${P.id}/paragrafo`] = P.par;
  } else {
    P.terminou = true;
    P.aba = 'texto';
    up[`jogadores/${P.id}/paragrafo`] = total;
    up[`jogadores/${P.id}/terminou`] = true;
  }
  try{ gameRef(P.pin).update(up); }catch(e){}
  render();
  window.scrollTo(0, 0);
}

/* =========================================================
   RANKING AO VIVO (aba do aluno) E FIM
   ========================================================= */
function cardRanking(){
  const lista = listaRanking(P.jogadores);
  const cls = lista.length > 10 ? 'rank-list duas' : 'rank-list';
  return `
    <div class="question-card" style="animation:none">
      <p class="instruction">🥚 ranking ao vivo</p>
      <div class="${cls}">${lista.map(j => linhaRanking(j, P.id)).join('')}</div>
    </div>`;
}

function telaFim(){
  const pos = posicaoEu();
  return `
    <div class="home-card" style="animation:none">
      <div class="ovo-grande">🥚</div>
      <h1>texto terminado!</h1>
      <p class="final-score">${formatScore(P.ovos)}<span> ovos</span></p>
      <div class="breakdown">
        <div class="breakdown-row"><span>posição agora</span><span>${pos ? pos + 'º' : '—'}</span></div>
        <div class="breakdown-row"><span>parágrafos</span><span>${P.paragrafos ? P.paragrafos.length : '—'}</span></div>
      </div>
      <p class="home-sub">Acompanhe o ranking: os outros colegas ainda podem estar jogando.</p>
    </div>
    ${cardRanking()}
    <div class="footer-space"></div>
    <button class="btn btn-block" onclick="sairDoJogo()">sair</button>`;
}

/* =========================================================
   ESCUTA DO FIREBASE
   ========================================================= */
function ouvirJogo(){
  listeners.forEach(l => { try{ l.ref.off(l.ev, l.cb); }catch(e){} });
  listeners = [];
  const on = (sub, cb) => {
    const ref = gameRef(P.pin, sub);
    ref.on('value', cb);
    listeners.push({ ref, ev:'value', cb });
  };

  on('meta', s => {
    const m = s.val();
    if(!m){
      esquecer(); alert('O professor encerrou este jogo.'); location.href = 'index.html'; return;
    }
    P.meta.titulo = m.titulo || '';
    render();
  });

  on('estado', s => {
    const e = s.val() || {};
    const antes = P.fase;
    const primeira = !P.estadoVisto;          // não toca o som ao recarregar a página
    P.estadoVisto = true;
    P.fase = e.fase === 'jogo' ? 'jogo' : 'lobby';
    if(antes !== P.fase){
      if(!primeira && P.fase === 'jogo') playSound('start');
      render();
    }
  });

  on('paragrafos', s => {
    const v = s.val();
    P.paragrafos = v ? listaDe(v).map(p => ({ texto:p.texto || '', vocabulario:listaDe(p.vocabulario) })) : null;
    if(P.paragrafos && P.par >= P.paragrafos.length) P.par = P.paragrafos.length - 1;
    render();
  });

  /* todos os jogadores: ranking ao vivo */
  on('jogadores', s => {
    P.jogadores = s.val() || {};
    const sou = P.jogadores[P.id];
    if(!sou && P.etapa === 'jogo' && P.id){ /* removido pelo professor */ }
    /* só redesenha a tela quando ela mostra o ranking ou a espera;
       no texto, atualiza apenas a barra de cima para não atrapalhar a leitura */
    const telaDependeDoRanking = (P.fase !== 'jogo') || P.terminou || P.aba === 'ranking';
    if(telaDependeDoRanking) render(); else renderTopbar();
    if(P.fase === 'jogo' && !P.terminou && P.aba === 'texto'){
      const aba = document.querySelectorAll('.aba')[1];
      if(aba){ const p = posicaoEu(); aba.textContent = 'ranking' + (p ? ' · ' + p + 'º' : ''); }
    }
  });
}

/* =========================================================
   BOOT
   ========================================================= */
async function boot(){
  if(PAGE === 'entrada'){ render(); return; }

  const url = new URL(location.href);
  const pinUrl = (url.searchParams.get('pin') || '').replace(/\D/g,'');
  const salvo = loadState(SAVE_KEY);
  P.pin = pinUrl || (salvo ? salvo.pin : null);

  if(!P.pin || !db){ location.href = 'index.html'; return; }

  /* retoma a sessão se o aluno ainda existir no jogo */
  if(salvo && salvo.pin === P.pin && salvo.id){
    try{
      const snap = await gameRef(P.pin, 'jogadores/' + salvo.id).get();
      if(snap.exists()){
        const j = snap.val();
        P.id = salvo.id; P.apelido = j.apelido; P.personagem = j.personagem;
        P.ovos = typeof j.ovos === 'number' ? j.ovos : OVOS_INICIAIS;
        P.par = j.paragrafo || 0;
        P.terminou = !!j.terminou;
        P.revelados = normRev(j.revelados);
        P.etapa = 'jogo'; P.resumed = true;
        ouvirJogo(); render(); return;
      }
    }catch(e){}
  }

  /* o jogo existe? */
  try{
    const meta = await gameRef(P.pin,'meta').get();
    if(!meta.exists()){ esquecer(); location.href = 'index.html'; return; }
    P.meta.titulo = (meta.val()||{}).titulo || '';
  }catch(e){ location.href = 'index.html'; return; }

  P.carIndex = Math.floor(Math.random() * PERSONAGENS.length);
  P.etapa = 'carrossel';
  render();
}

boot();
