// Cópia sem alterações do motor GeoRegistro (repositório FelippeAlvarez/teste-geo). Para atualizar, substitua este arquivo inteiro.
/*!
 * GeoRegistro — motor de registro de local (GPS), endereço e horário
 * Versão 1.3.0
 * Copyright © 2026 Felippe Alvarez. Todos os direitos reservados.
 * (Licença de distribuição a terceiros: PENDENTE de definição.)
 *
 * O QUE É
 *   Motor SEM interface visual, para ser copiado para dentro de cada app.
 *   O app cria os botões e telas no próprio visual e chama as funções abaixo.
 *   Sem dependências externas. Funciona em página HTTPS (ex.: GitHub Pages).
 *
 * USO BÁSICO (dentro do app)
 *   1) Opcional, uma vez, ao iniciar o app:
 *        GeoRegistro.configurar({ appId: 'vistoria' });
 *      >>> appId é OBRIGATÓRIO na prática: todos os apps em felippealvarez.github.io
 *      >>> compartilham o mesmo armazenamento do navegador. O appId separa os dados.
 *
 *   2) Quando a pessoa tocar no botão "Registrar local e hora":
 *        const rascunho = await GeoRegistro.capturar({
 *          tipo: 'vistoria',                       // texto livre definido pelo app
 *          onStatus: (s) => mostrarNaTela(s)       // opcional: andamento
 *        });
 *      Mostre ao usuário: rascunho.endereco.texto, rascunho.localizacao.precisaoM,
 *      rascunho.horario.dispositivoISO etc. Nada foi gravado ainda.
 *
 *   3) Quando a pessoa confirmar:
 *        const registro = await GeoRegistro.salvar(rascunho, { observacao: 'texto livre' });
 *
 *   4) Outras funções:
 *        GeoRegistro.listar({ tipo })             -> registros salvos (mais recentes primeiro)
 *        GeoRegistro.obter(id) / excluir(id)
 *        GeoRegistro.verificarIntegridade(reg)    -> confere se o registro foi alterado
 *        GeoRegistro.completarEnderecosPendentes()-> busca endereço dos registros feitos sem internet
 *        GeoRegistro.exportarJSON(registros?) / baixarJSON({registros?, nomeArquivo?})
 *        GeoRegistro.textoResumo(reg)             -> texto pronto para copiar/compartilhar
 *        GeoRegistro.linkMapa(reg, 'google'|'osm')
 *        GeoRegistro.creditos()                   -> dados para a tela de créditos/licenças/versão
 *        GeoRegistro.textos                       -> aviso, manual curto, privacidade-base, limitações
 *        GeoRegistro.diagnostico()                -> o que o aparelho/navegador permite
 *        GeoRegistro.estadoPermissao()            -> 'granted' | 'prompt' | 'denied' | 'desconhecido'
 *
 *   IMAGEM DE MAPA (opcional, desligada por padrão)
 *        GeoRegistro.configurar({ mapa: { ativo: true } });
 *      Com ela ligada, capturar() também monta uma imagem JPEG do mapa (OpenStreetMap) com o
 *      marcador do ponto, o círculo da margem de erro, escala, data/hora e atribuição, e guarda
 *      em rascunho.mapa.dataUrl (use em <img src="...">). Sem internet, o registro sai com
 *      mapa.pendente = true e a imagem pode ser feita depois:
 *        GeoRegistro.completarPendentes()         -> completa endereços E mapas pendentes
 *        GeoRegistro.baixarImagemMapa(reg)        -> baixa o JPEG
 *        GeoRegistro.compartilhar(reg)            -> abre o compartilhamento do aparelho (texto + imagem)
 *        GeoRegistro.exportarJSON(regs, { semImagens: true }) / baixarJSON({ semImagens: true })
 *      Para um registro isolado: capturar({ mapa: true|false }) sobrepõe a configuração.
 *
 *   PDF (sem biblioteca externa; A4, uma página por registro)
 *        GeoRegistro.baixarPDF(reg | [regs], nome?)        -> baixa o PDF
 *        GeoRegistro.compartilharPDF(reg | [regs])         -> abre o compartilhamento do aparelho com o PDF
 *        GeoRegistro.gerarPDF(reg | [regs])                -> Promise<Blob application/pdf> (para o app usar como quiser)
 *      O PDF traz data/hora, conferência de hora, endereço, coordenadas, margem de erro, link do mapa,
 *      observação, imagem do mapa (quando houver), hashes, avisos de limitação e créditos.
 *
 * ERROS
 *   As funções que falham lançam um Error com .codigo e .message em português:
 *   PERMISSAO_NEGADA, SEM_GPS, INSEGURO, ORIGEM_INVALIDA, TEMPO_ESGOTADO, POSICAO_INDISPONIVEL, REGISTRO_INVALIDO.
 *
 * LIMITES (leia GeoRegistro.textos.limitacoes)
 *   Registro feito só no aparelho é declaração do usuário com indícios técnicos,
 *   não prova robusta: relógio e GPS do aparelho podem ser alterados.
 */
(function (global) {
  'use strict';

  var VERSAO = '1.3.0';
  var ESQUEMA = 1;

  // ---------------------------------------------------------------- configuração
  var CFG = {
    appId: 'app',
    limitePrecisaoM: 25,            // acima disto o registro sai marcado "precisão baixa"
    tempoMaxMs: 25000,              // tempo máximo esperando o GPS melhorar
    limiteDiferencaRelogioSeg: 120, // acima disto: alerta de relógio divergente
    timeoutProvedorMs: 6000,        // tempo máximo por consulta externa
    pdf: {                          // aparência do PDF (cada app pode trocar)
      titulo: 'REGISTRO DE LOCAL E HORA',
      corPrincipal: '#0f2742',      // faixa do cabeçalho
      corDestaque: '#14b8a6',       // detalhes (logotipo, borda do selo, QR)
      rodape: '© 2026 Felippe Alvarez',
      qrCode: true                  // QR code que abre o local no mapa
    },
    contatoNominatim: '',           // e-mail opcional de contato (boa prática da política do Nominatim)
    ordemEndereco: ['nominatim', 'bigdatacloud', 'locationiq'],
    provedores: {
      nominatim:    { ativo: true },
      // Sem chave e sem cadastro, mas só informa localidade (sem rua).
      // DESLIGADO por padrão até conferirmos os termos de uso.
      bigdatacloud: { ativo: false },
      // Gratuito com cadastro (sem cartão, a confirmar). Precisa de chave restrita ao domínio.
      locationiq:   { ativo: false, chave: '', regiao: 'us1' }
    },
    fontesHora: ['worldtimeapi', 'timeapi'],
    mapa: {
      ativo: false,          // desligado por padrão; o app liga com configurar({ mapa: { ativo: true } })
      largura: 640,
      altura: 400,
      qualidadeJPEG: 0.82,
      zoomAuto: true,        // aproxima quando o GPS está preciso, afasta quando está ruim
      zoomFixo: 18,
      zoomMax: 18,
      zoomMin: 14,
      timeoutTileMs: 6000,
      ordem: ['osm'],
      provedores: {
        osm: {
          ativo: true,
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          atribuicao: '© OpenStreetMap contributors',
          nome: 'OpenStreetMap'
        }
      }
    }
  };

  function mesclar(dest, orig) {
    Object.keys(orig || {}).forEach(function (k) {
      var v = orig[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && dest[k] && typeof dest[k] === 'object') {
        mesclar(dest[k], v);
      } else {
        dest[k] = v;
      }
    });
    return dest;
  }

  function configurar(opcoes) {
    var appAntes = CFG.appId;
    mesclar(CFG, opcoes || {});
    if (CFG.appId !== appAntes) { Banco.reiniciar(); }
    return JSON.parse(JSON.stringify(CFG));
  }

  // ---------------------------------------------------------------- utilidades
  function erro(codigo, mensagem) {
    var e = new Error(mensagem);
    e.codigo = codigo;
    return e;
  }

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function comTimeout(url, opcoes, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    var o = {};
    Object.keys(opcoes || {}).forEach(function (k) { o[k] = opcoes[k]; });
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then(
      function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw e; }
    );
  }

  function pad(n, t) { n = String(n); while (n.length < (t || 2)) n = '0' + n; return n; }

  function isoLocal(d) {
    var off = -d.getTimezoneOffset();
    var s = off >= 0 ? '+' : '-';
    off = Math.abs(off);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3) +
      s + pad(Math.floor(off / 60)) + ':' + pad(off % 60);
  }

  function novoId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    var a = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(a);
    else for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return pad(b.toString(16)); }).join('');
  }

  // JSON canônico (chaves ordenadas) para o hash ser sempre reproduzível
  function canonico(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + canonico(v[k]); }).join(',') + '}';
  }

  function sha256hex(texto) {
    if (!(global.crypto && global.crypto.subtle)) return Promise.resolve(null);
    return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return pad(b.toString(16)); }).join('');
    });
  }

  // ---------------------------------------------------------------- GPS
  function obterPosicao(onStatus, limite, tempoMax) {
    return new Promise(function (resolve, reject) {
      var nav = global.navigator;
      if (!nav || !('geolocation' in nav)) {
        return reject(erro('SEM_GPS', 'Este aparelho ou navegador não oferece localização.'));
      }
      var proto = (global.location && global.location.protocol) || 'https:';
      if (proto !== 'https:' && proto !== 'http:') {
        return reject(erro('ORIGEM_INVALIDA', 'Esta página foi aberta como arquivo (por exemplo, recebida pelo WhatsApp ou aberta pelo gerenciador de arquivos). Nesse caso o navegador bloqueia a localização sem perguntar. Abra a página pelo endereço https do site publicado.'));
      }
      if (global.isSecureContext === false) {
        return reject(erro('INSEGURO', 'A localização só funciona em página segura (https).'));
      }
      var melhor = null, ultimoErro = null, fim = false, wid = null, timer = null;

      function parar() {
        fim = true;
        clearTimeout(timer);
        if (wid !== null) { try { nav.geolocation.clearWatch(wid); } catch (e) { /* ignora */ } }
      }
      function concluir() {
        if (fim) return;
        parar();
        if (melhor) return resolve(melhor);
        if (ultimoErro && ultimoErro.code === 2) {
          return reject(erro('POSICAO_INDISPONIVEL', 'Não foi possível determinar a posição. Verifique se o GPS/localização do aparelho está ligado.'));
        }
        reject(erro('TEMPO_ESGOTADO', 'O aparelho não conseguiu obter a localização a tempo. Vá para um local aberto e tente de novo.'));
      }

      wid = nav.geolocation.watchPosition(
        function (p) {
          if (fim) return;
          var c = p.coords;
          var amostra = {
            lat: c.latitude, lon: c.longitude, acc: c.accuracy,
            alt: (typeof c.altitude === 'number') ? c.altitude : null,
            altAcc: (typeof c.altitudeAccuracy === 'number') ? c.altitudeAccuracy : null,
            ts: p.timestamp
          };
          if (!melhor || amostra.acc < melhor.acc) melhor = amostra;
          if (onStatus) onStatus({ etapa: 'localizando', precisaoM: Math.round(amostra.acc) });
          if (amostra.acc <= limite) concluir();
        },
        function (e) {
          if (fim) return;
          if (e && e.code === 1) {
            parar();
            return reject(erro('PERMISSAO_NEGADA', 'A permissão de localização foi negada. Ative a localização para este site nas configurações do navegador e tente de novo.'));
          }
          ultimoErro = e;   // erros transitórios: continua esperando até o tempo máximo
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: tempoMax }
      );
      timer = setTimeout(concluir, tempoMax);
    });
  }

  // ---------------------------------------------------------------- endereço
  var ultimaChamada = {};
  var cacheEnd = {};

  function intervalo(nome, minMs) {
    var espera = (ultimaChamada[nome] || 0) + minMs - Date.now();
    return (espera > 0 ? esperar(espera) : Promise.resolve()).then(function () { ultimaChamada[nome] = Date.now(); });
  }

  function ufDe(a) {
    var iso = a['ISO3166-2-lvl4'] || a['ISO3166-2-lvl3'] || '';
    if (/^BR-[A-Z]{2}$/.test(iso)) return iso.slice(3);
    return a.state || '';
  }

  // Monta "Rua X, 10, Bairro, Cidade - UF, CEP 00000-000" a partir de componentes no padrão OSM
  function montarTexto(a) {
    var rua = a.road || a.pedestrian || a.footway || a.path || a.cycleway || a.residential || a.square || '';
    var num = a.house_number || '';
    var bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.borough || '';
    var cidade = a.city || a.town || a.village || a.municipality || a.county || '';
    var uf = ufDe(a);
    var partes = [];
    if (rua) partes.push(num ? rua + ', ' + num : rua);
    if (bairro) partes.push(bairro);
    if (cidade) partes.push(uf ? cidade + ' - ' + uf : cidade);
    else if (uf) partes.push(uf);
    if (a.postcode) partes.push('CEP ' + a.postcode);
    return { texto: partes.join(', '), aproximado: !rua };
  }

  function http(codigoBase, r) { return erro(codigoBase + '_' + r.status, 'Resposta ' + r.status + ' do provedor.'); }

  var PROVEDORES = {
    nominatim: {
      atribuicao: { nome: 'OpenStreetMap / Nominatim', texto: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
      requerChave: false,
      buscar: function (lat, lon) {
        return intervalo('nominatim', 1100).then(function () {
          var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt-BR' +
            '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) +
            (CFG.contatoNominatim ? '&email=' + encodeURIComponent(CFG.contatoNominatim) : '');
          return comTimeout(url, { headers: { 'Accept': 'application/json' } }, CFG.timeoutProvedorMs);
        }).then(function (r) {
          if (!r.ok) throw http('HTTP', r);
          return r.json();
        }).then(function (d) {
          if (!d || d.error || !d.address) throw erro('SEM_RESULTADO', 'Sem resultado.');
          var m = montarTexto(d.address);
          var texto = m.texto || d.display_name || '';
          if (!texto) throw erro('SEM_RESULTADO', 'Sem resultado.');
          return { texto: texto, aproximado: m.aproximado || !m.texto };
        });
      }
    },

    // ATENÇÃO: campos e termos de uso NÃO verificados em ambiente real. Só informa localidade.
    bigdatacloud: {
      atribuicao: { nome: 'BigDataCloud', texto: 'Reverse geocoding by BigDataCloud', url: 'https://www.bigdatacloud.com' },
      requerChave: false,
      buscar: function (lat, lon) {
        var url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=pt&latitude=' +
          encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon);
        return comTimeout(url, {}, CFG.timeoutProvedorMs).then(function (r) {
          if (!r.ok) throw http('HTTP', r);
          return r.json();
        }).then(function (d) {
          var partes = [];
          var local = d.locality || '';
          var cidade = d.city || '';
          var uf = d.principalSubdivision || '';
          if (local) partes.push(local);
          if (cidade && cidade !== local) partes.push(uf ? cidade + ' - ' + uf : cidade);
          else if (uf) partes.push(uf);
          if (d.postcode) partes.push('CEP ' + d.postcode);
          if (!partes.length) throw erro('SEM_RESULTADO', 'Sem resultado.');
          return { texto: partes.join(', '), aproximado: true };
        });
      }
    },

    locationiq: {
      atribuicao: { nome: 'LocationIQ / OpenStreetMap', texto: 'Search by LocationIQ.com · © OpenStreetMap contributors', url: 'https://locationiq.com' },
      requerChave: true,
      buscar: function (lat, lon, pc) {
        var url = 'https://' + (pc.regiao || 'us1') + '.locationiq.com/v1/reverse?format=json&addressdetails=1&accept-language=pt-BR' +
          '&key=' + encodeURIComponent(pc.chave) + '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon);
        return intervalo('locationiq', 600).then(function () {
          return comTimeout(url, {}, CFG.timeoutProvedorMs);
        }).then(function (r) {
          if (!r.ok) throw http('HTTP', r);
          return r.json();
        }).then(function (d) {
          if (!d || d.error || !d.address) throw erro('SEM_RESULTADO', 'Sem resultado.');
          var m = montarTexto(d.address);
          var texto = m.texto || d.display_name || '';
          if (!texto) throw erro('SEM_RESULTADO', 'Sem resultado.');
          return { texto: texto, aproximado: m.aproximado || !m.texto };
        });
      }
    }
  };

  // Tenta cada provedor ativo, na ordem; passa ao seguinte em caso de erro, limite excedido ou resposta vazia.
  function resolverEndereco(lat, lon) {
    var chave = lat.toFixed(4) + ',' + lon.toFixed(4);
    if (cacheEnd[chave]) {
      var c = cacheEnd[chave];
      return Promise.resolve({ texto: c.texto, aproximado: c.aproximado, provedor: c.provedor, pendente: false,
        tentativas: [{ provedor: c.provedor, ok: true, cache: true }] });
    }
    var nav = global.navigator;
    if (nav && nav.onLine === false) {
      return Promise.resolve({ texto: null, aproximado: null, provedor: null, pendente: true,
        tentativas: [{ provedor: '-', ok: false, erro: 'SEM_INTERNET' }] });
    }
    var tentativas = [];
    var fila = CFG.ordemEndereco.slice();

    function proximo() {
      if (!fila.length) {
        return Promise.resolve({ texto: null, aproximado: null, provedor: null, pendente: true, tentativas: tentativas });
      }
      var nome = fila.shift();
      var pc = CFG.provedores[nome];
      var impl = PROVEDORES[nome];
      if (!pc || !pc.ativo || !impl) return proximo();
      if (impl.requerChave && !pc.chave) {
        tentativas.push({ provedor: nome, ok: false, erro: 'SEM_CHAVE' });
        return proximo();
      }
      return impl.buscar(lat, lon, pc).then(function (r) {
        tentativas.push({ provedor: nome, ok: true });
        cacheEnd[chave] = { texto: r.texto, aproximado: r.aproximado, provedor: nome };
        return { texto: r.texto, aproximado: r.aproximado, provedor: nome, pendente: false, tentativas: tentativas };
      }, function (e) {
        tentativas.push({ provedor: nome, ok: false, erro: (e && (e.codigo || e.name)) || 'ERRO' });
        return proximo();
      });
    }
    return proximo();
  }

  // ---------------------------------------------------------------- hora de referência (internet)
  var FONTES_HORA = {
    worldtimeapi: function () {
      return comTimeout('https://worldtimeapi.org/api/timezone/Etc/UTC', {}, CFG.timeoutProvedorMs).then(function (r) {
        if (!r.ok) throw http('HTTP', r);
        return r.json();
      }).then(function (d) {
        var ms = d.utc_datetime ? Date.parse(String(d.utc_datetime).replace(/(\.\d{3})\d+/, '$1')) : NaN;
        if (isNaN(ms) && typeof d.unixtime === 'number') ms = d.unixtime * 1000;
        if (isNaN(ms)) throw erro('SEM_RESULTADO', 'Sem hora.');
        return ms;
      });
    },
    timeapi: function () {
      return comTimeout('https://timeapi.io/api/time/current/zone?timeZone=UTC', {}, CFG.timeoutProvedorMs).then(function (r) {
        if (!r.ok) throw http('HTTP', r);
        return r.json();
      }).then(function (d) {
        var ms = d.dateTime ? Date.parse(String(d.dateTime).replace(/(\.\d{3})\d+/, '$1') + 'Z') : NaN;
        if (isNaN(ms)) throw erro('SEM_RESULTADO', 'Sem hora.');
        return ms;
      });
    }
  };

  function obterHoraReferencia() {
    var nav = global.navigator;
    if (nav && nav.onLine === false) return Promise.resolve(null);
    var fila = CFG.fontesHora.slice();
    function proximo() {
      if (!fila.length) return Promise.resolve(null);
      var nome = fila.shift();
      var fn = FONTES_HORA[nome];
      if (!fn) return proximo();
      var t0 = Date.now();
      return fn().then(function (srv) {
        var t1 = Date.now();
        var meio = (t0 + t1) / 2;
        return {
          fonte: nome,
          epochMs: Math.round(srv),
          isoUTC: new Date(srv).toISOString(),
          latenciaMs: t1 - t0,
          diferencaSeg: Math.round(((meio - srv) / 1000) * 10) / 10   // positivo = relógio do aparelho adiantado
        };
      }, function () { return proximo(); });
    }
    return proximo();
  }

  // ---------------------------------------------------------------- imagem de mapa
  var cacheTiles = {};
  var cacheTilesOrdem = [];

  function mppAt(lat, z) { return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z); }
  function mundoX(lon, z) { return (lon + 180) / 360 * 256 * Math.pow(2, z); }
  function mundoY(lat, z) {
    var r = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * Math.pow(2, z);
  }

  // Escolhe o maior zoom em que o círculo da margem de erro ainda cabe bem na imagem.
  function escolherZoom(lat, acc, altura, mc) {
    if (!mc.zoomAuto) return mc.zoomFixo;
    var lim = altura * 0.4;
    for (var z = mc.zoomMax; z >= mc.zoomMin; z--) {
      if (acc / mppAt(lat, z) <= lim) return z;
    }
    return mc.zoomMin;
  }

  function carregarImagem(url, ms) {
    if (cacheTiles[url]) return Promise.resolve(cacheTiles[url]);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var t = setTimeout(function () { img.onload = img.onerror = null; reject(erro('TILE_TEMPO', 'Tempo esgotado ao baixar o mapa.')); }, ms);
      img.onload = function () {
        clearTimeout(t);
        cacheTiles[url] = img; cacheTilesOrdem.push(url);
        if (cacheTilesOrdem.length > 48) delete cacheTiles[cacheTilesOrdem.shift()];
        resolve(img);
      };
      img.onerror = function () { clearTimeout(t); reject(erro('TILE_ERRO', 'Não foi possível baixar um pedaço do mapa.')); };
      img.src = url;
    });
  }

  function emLotes(tarefas, limite) {
    var i = 0, res = new Array(tarefas.length);
    function trabalhador() {
      if (i >= tarefas.length) return Promise.resolve();
      var k = i++;
      return tarefas[k]().then(function (v) { res[k] = v; }).then(trabalhador);
    }
    var ws = [];
    for (var n = 0; n < Math.min(limite, tarefas.length); n++) ws.push(trabalhador());
    return Promise.all(ws).then(function () { return res; });
  }

  function utcTexto(offMin) {
    var sinal = offMin >= 0 ? '+' : '-';
    return 'UTC' + sinal + pad(Math.floor(Math.abs(offMin) / 60)) + ':' + pad(Math.abs(offMin) % 60);
  }

  function desenharMapa(info, prov, z) {
    var mc = CFG.mapa, W = mc.largura, H = mc.altura;
    var cv = global.document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, W, H);

    var cx = mundoX(info.lon, z), cy = mundoY(info.lat, z);
    var x0 = cx - W / 2, y0 = cy - H / 2;
    var n = Math.pow(2, z);
    var tx0 = Math.floor(x0 / 256), tx1 = Math.floor((x0 + W - 1) / 256);
    var ty0 = Math.floor(y0 / 256), ty1 = Math.floor((y0 + H - 1) / 256);
    var tarefas = [];
    for (var ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (var tx = tx0; tx <= tx1; tx++) {
        (function (tx, ty) {
          var xw = ((tx % n) + n) % n;
          var url = prov.url.replace('{z}', z).replace('{x}', xw).replace('{y}', ty);
          tarefas.push(function () {
            return carregarImagem(url, mc.timeoutTileMs).then(function (img) {
              ctx.drawImage(img, Math.round(tx * 256 - x0), Math.round(ty * 256 - y0));
            });
          });
        })(tx, ty);
      }
    }

    return emLotes(tarefas, 4).then(function () {
      var px = W / 2, py = H / 2;
      var mpp = mppAt(info.lat, z);
      var r = Math.max(info.acc / mpp, 4);

      // círculo da margem de erro
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(31,95,191,0.18)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1f5fbf'; ctx.stroke();

      // marcador (a ponta do alfinete fica exatamente sobre o ponto)
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-5, -10, -13, -17, -13, -25);
      ctx.arc(0, -25, 13, Math.PI, 0, false);
      ctx.bezierCurveTo(13, -17, 5, -10, 0, 0);
      ctx.closePath();
      ctx.fillStyle = '#d32f2f'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -25, 5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();

      var fonte = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

      // atribuição (obrigatória), no canto superior direito
      ctx.font = '11px ' + fonte;
      var atr = prov.atribuicao || '';
      var wa = ctx.measureText(atr).width + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(W - wa, 0, wa, 18);
      ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(atr, W - wa + 5, 9);

      // faixa de informações na base
      var linhas = [
        info.dataTexto + ' (' + utcTexto(info.offMin) + ')   ·   margem de erro ≈ ' + String(Math.round(info.acc * 10) / 10).replace('.', ',') + ' m',
        info.lat.toFixed(6) + ', ' + info.lon.toFixed(6)
      ];
      if (info.posterior) linhas.push('Imagem gerada depois do registro, em ' + info.geradoTexto);
      var hb = 10 + linhas.length * 17;
      ctx.fillStyle = 'rgba(0,0,0,0.66)'; ctx.fillRect(0, H - hb, W, hb);
      ctx.fillStyle = '#ffffff'; ctx.font = '13px ' + fonte; ctx.textBaseline = 'middle';
      linhas.forEach(function (t, i) { ctx.fillText(t, 8, H - hb + 6 + 9 + i * 17); });

      // barra de escala
      var nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000], len = nice[0];
      nice.forEach(function (v) { if (v / mpp <= 120) len = v; });
      var lp = len / mpp, bx = 10, by = H - hb - 14;
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(bx - 4, by - 14, lp + 8, 22);
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 3); ctx.lineTo(bx + lp, by + 3); ctx.lineTo(bx + lp, by - 4); ctx.stroke();
      ctx.fillStyle = '#222'; ctx.font = '11px ' + fonte; ctx.textBaseline = 'alphabetic';
      ctx.fillText(len >= 1000 ? (len / 1000) + ' km' : len + ' m', bx + 4, by - 6);

      var q = mc.qualidadeJPEG;
      var url = cv.toDataURL('image/jpeg', q);   // falha com SecurityError se o servidor de mapa não permitir uso da imagem
      var mime = 'image/jpeg';
      if (url.indexOf('data:image/jpeg') !== 0) { url = cv.toDataURL('image/png'); mime = 'image/png'; }
      return { dataUrl: url, mimeType: mime };
    });
  }

  // Nunca rejeita: devolve a imagem ou um objeto "pendente" explicando por quê.
  function gerarMapa(info) {
    var mc = CFG.mapa;
    var nav = global.navigator;
    var provs = mc.ordem.filter(function (n) { return mc.provedores[n] && mc.provedores[n].ativo; });
    if (!global.document || !global.document.createElement || !provs.length) {
      return Promise.resolve({ dataUrl: null, pendente: true, erro: 'SEM_CANVAS_OU_PROVEDOR', tentativas: [] });
    }
    if (nav && nav.onLine === false) {
      return Promise.resolve({ dataUrl: null, pendente: true, erro: 'SEM_INTERNET', tentativas: [] });
    }
    var z = escolherZoom(info.lat, info.acc, mc.altura, mc);
    var tentativas = [];
    var fila = provs.slice();

    function proximo() {
      if (!fila.length) return Promise.resolve({ dataUrl: null, pendente: true, erro: 'FALHA_TILES', tentativas: tentativas });
      var nome = fila.shift();
      var prov = mc.provedores[nome];
      return desenharMapa(info, prov, z).then(function (img) {
        return sha256hex(img.dataUrl).then(function (h) {
          tentativas.push({ provedor: nome, ok: true });
          return {
            dataUrl: img.dataUrl, mimeType: img.mimeType, largura: mc.largura, altura: mc.altura, zoom: z,
            provedor: nome, atribuicao: prov.atribuicao, geradoEm: isoLocal(new Date()),
            posterior: !!info.posterior, sha256: h, pendente: false, tentativas: tentativas
          };
        });
      }).then(null, function (e) {
        tentativas.push({ provedor: nome, ok: false, erro: (e && (e.codigo || e.name)) || 'ERRO' });
        return proximo();
      });
    }
    return proximo();
  }

  function infoMapa(lat, lon, acc, epochMs, fuso, offMin, posterior) {
    var dataTexto;
    try { dataTexto = new Date(epochMs).toLocaleString('pt-BR', { timeZone: fuso || undefined }); }
    catch (e) { dataTexto = new Date(epochMs).toISOString(); }
    return {
      lat: lat, lon: lon, acc: acc, offMin: offMin, dataTexto: dataTexto, posterior: !!posterior,
      geradoTexto: posterior ? new Date().toLocaleString('pt-BR', { timeZone: fuso || undefined }) : ''
    };
  }

  function mapaParaCaptura(op, p, instante) {
    var quer = (op.mapa !== undefined) ? !!op.mapa : !!CFG.mapa.ativo;
    if (!quer) return Promise.resolve(null);
    var fuso = '';
    try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignora */ }
    return gerarMapa(infoMapa(p.lat, p.lon, p.acc, instante.getTime(), fuso, -instante.getTimezoneOffset(), false));
  }

  // ---------------------------------------------------------------- hash e integridade
  function nucleo(reg) {
    return {
      id: reg.id, versaoEsquema: reg.versaoEsquema, versaoModulo: reg.versaoModulo, appId: reg.appId,
      tipo: reg.tipo, observacao: reg.observacao, localizacao: reg.localizacao, horario: reg.horario, aparelho: reg.aparelho
    };
  }
  function parteEndereco(reg) {
    var e = reg.endereco || {};
    return { texto: e.texto || null, provedor: e.provedor || null, posterior: !!e.posterior };
  }
  function hashNucleo(reg) { return sha256hex(canonico(nucleo(reg))); }
  // O mapa só entra na conta quando existe imagem; registros sem mapa mantêm a fórmula anterior.
  function hashCompleto(reg, hn) {
    var o = { nucleo: hn, endereco: parteEndereco(reg) };
    if (reg.mapa && reg.mapa.dataUrl && reg.mapa.sha256) { o.mapa = reg.mapa.sha256; o.mapaPosterior = !!reg.mapa.posterior; }
    return sha256hex(canonico(o));
  }

  // Recalcula o hash completo após o endereço ou o mapa serem completados depois, guardando o histórico.
  function atualizarHashCompleto(reg) {
    return hashCompleto(reg, reg.hash.nucleo).then(function (hc) {
      var antes = reg.hash.completo;
      if (hc === antes) return;
      var agora = isoLocal(new Date());
      reg.hash.historico = (reg.hash.historico || []).concat([{ em: agora, completoAnterior: antes }]);
      reg.hash.completoAnterior = antes;
      reg.hash.completo = hc;
      reg.hash.completoRecalculadoEm = agora;
    });
  }

  function calcularHashes(reg) {
    return hashNucleo(reg).then(function (hn) {
      if (hn === null) return { algoritmo: 'SHA-256', nucleo: null, completo: null, indisponivel: true };
      return hashCompleto(reg, hn).then(function (hc) {
        return { algoritmo: 'SHA-256', nucleo: hn, completo: hc };
      });
    });
  }

  function verificarIntegridade(reg) {
    if (!reg || !reg.hash || !reg.hash.nucleo) {
      return Promise.resolve({ ok: false, motivo: 'SEM_HASH', nucleoOk: false, completoOk: false, mapaOk: false });
    }
    var temMapa = !!(reg.mapa && reg.mapa.dataUrl);
    return Promise.all([
      hashNucleo(reg),
      temMapa ? sha256hex(reg.mapa.dataUrl) : Promise.resolve(null)
    ]).then(function (r) {
      var nucleoOk = r[0] === reg.hash.nucleo;
      var mapaOk = temMapa ? (r[1] === reg.mapa.sha256) : true;
      return hashCompleto(reg, reg.hash.nucleo).then(function (hc) {
        var completoOk = hc === reg.hash.completo;
        var motivo = null;
        if (!nucleoOk) motivo = 'DADOS_ALTERADOS';
        else if (!mapaOk) motivo = 'IMAGEM_ALTERADA';
        else if (!completoOk) motivo = 'ENDERECO_OU_MAPA_ALTERADO';
        return { ok: nucleoOk && completoOk && mapaOk, nucleoOk: nucleoOk, completoOk: completoOk, mapaOk: mapaOk, motivo: motivo };
      });
    });
  }

  // ---------------------------------------------------------------- armazenamento local
  var Banco = (function () {
    var dbp = null;
    var memoria = [];
    var modo = 'indexeddb';

    function nome() { return 'geo-registro-' + CFG.appId; }

    function abrir() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve) {
        if (!global.indexedDB) { modo = 'memoria'; return resolve(null); }
        var rq;
        try { rq = global.indexedDB.open(nome(), 1); } catch (e) { modo = 'memoria'; return resolve(null); }
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains('registros')) {
            var s = d.createObjectStore('registros', { keyPath: 'id' });
            s.createIndex('tipo', 'tipo');
          }
        };
        rq.onsuccess = function () { modo = 'indexeddb'; resolve(rq.result); };
        rq.onerror = function () { modo = 'memoria'; resolve(null); };
        rq.onblocked = function () { modo = 'memoria'; resolve(null); };
      });
      return dbp;
    }

    function transacao(tipo, fn) {
      return abrir().then(function (db) {
        if (!db) return fn(null);
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('registros', tipo);
          var st = tx.objectStore('registros');
          var rq = fn(st);
          tx.oncomplete = function () { resolve(rq && 'result' in rq ? rq.result : undefined); };
          tx.onerror = function () { reject(erro('ARMAZENAMENTO', 'Falha ao acessar o armazenamento local.')); };
          tx.onabort = tx.onerror;
        });
      });
    }

    function clonar(o) { return JSON.parse(JSON.stringify(o)); }

    return {
      modo: function () { return modo; },
      reiniciar: function () { dbp = null; },
      put: function (reg) {
        return abrir().then(function (db) {
          if (!db) {
            memoria = memoria.filter(function (r) { return r.id !== reg.id; });
            memoria.push(clonar(reg));
            return;
          }
          return transacao('readwrite', function (st) { return st.put(clonar(reg)); });
        });
      },
      get: function (id) {
        return abrir().then(function (db) {
          if (!db) { var r = memoria.filter(function (x) { return x.id === id; })[0]; return r ? clonar(r) : null; }
          return transacao('readonly', function (st) { return st.get(id); }).then(function (r) { return r || null; });
        });
      },
      todos: function () {
        return abrir().then(function (db) {
          if (!db) return clonar(memoria);
          return transacao('readonly', function (st) { return st.getAll(); });
        });
      },
      apagar: function (id) {
        return abrir().then(function (db) {
          if (!db) { memoria = memoria.filter(function (r) { return r.id !== id; }); return; }
          return transacao('readwrite', function (st) { return st.delete(id); });
        });
      }
    };
  })();

  // ---------------------------------------------------------------- operações principais
  function capturar(op) {
    op = op || {};
    function st(o) { try { if (op.onStatus) op.onStatus(o); } catch (e) { /* ignora erro do app */ } }
    var limite = op.limitePrecisaoM || CFG.limitePrecisaoM;
    var tempoMax = op.tempoMaxMs || CFG.tempoMaxMs;
    st({ etapa: 'solicitando_localizacao' });

    return obterPosicao(st, limite, tempoMax).then(function (p) {
      var instante = new Date();
      st({ etapa: 'obtendo_endereco_e_hora', precisaoM: Math.round(p.acc) });
      return Promise.all([resolverEndereco(p.lat, p.lon), obterHoraReferencia(), mapaParaCaptura(op, p, instante)]).then(function (res) {
        var end = res[0], ref = res[1], mapa = res[2];
        var nav = global.navigator || {};
        var fuso = '';
        try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignora */ }
        var dif = ref ? ref.diferencaSeg : null;
        var rascunho = {
          id: novoId(),
          versaoEsquema: ESQUEMA,
          versaoModulo: VERSAO,
          appId: CFG.appId,
          tipo: op.tipo || 'registro',
          observacao: op.observacao || '',
          localizacao: {
            latitude: p.lat, longitude: p.lon, precisaoM: Math.round(p.acc * 10) / 10,
            altitudeM: p.alt, altitudePrecisaoM: p.altAcc,
            limitePrecisaoM: limite, precisaoBaixa: p.acc > limite
          },
          horario: {
            dispositivoISO: isoLocal(instante),
            dispositivoEpochMs: instante.getTime(),
            fusoIANA: fuso,
            fusoOffsetMin: -instante.getTimezoneOffset(),
            referencia: ref,
            diferencaSeg: dif,
            limiteDiferencaSeg: CFG.limiteDiferencaRelogioSeg,
            alertaRelogio: dif !== null && Math.abs(dif) > CFG.limiteDiferencaRelogioSeg,
            referenciaConfirmada: !!ref
          },
          endereco: {
            texto: end.texto, aproximado: end.aproximado, provedor: end.provedor,
            pendente: end.pendente, posterior: false,
            obtidoEm: end.texto ? isoLocal(new Date()) : null,
            tentativas: end.tentativas
          },
          aparelho: {
            userAgent: nav.userAgent || '', plataforma: nav.platform || '', idioma: nav.language || ''
          },
          mapa: mapa,
          hash: null,
          salvoEm: null
        };
        st({ etapa: 'pronto' });
        return rascunho;
      });
    });
  }

  function salvar(reg, extra) {
    if (!reg || !reg.id || !reg.localizacao || !reg.horario) {
      return Promise.reject(erro('REGISTRO_INVALIDO', 'Registro inválido.'));
    }
    if (extra && typeof extra.observacao === 'string') reg.observacao = extra.observacao;
    return calcularHashes(reg).then(function (h) {
      reg.hash = h;
      reg.salvoEm = isoLocal(new Date());
      return Banco.put(reg).then(function () { return reg; });
    });
  }

  function listar(filtro) {
    return Banco.todos().then(function (rs) {
      rs = (rs || []).filter(function (r) { return !filtro || !filtro.tipo || r.tipo === filtro.tipo; });
      rs.sort(function (a, b) { return b.horario.dispositivoEpochMs - a.horario.dispositivoEpochMs; });
      return rs;
    });
  }

  function obter(id) { return Banco.get(id); }
  function excluir(id) { return Banco.apagar(id); }

  // Completa o endereço dos registros feitos sem internet ou quando todos os provedores falharam.
  function completarEnderecosPendentes() {
    return listar().then(function (rs) {
      var pend = rs.filter(function (r) { return r.endereco && !r.endereco.texto; });
      var feitos = 0;
      return pend.reduce(function (cadeia, reg) {
        return cadeia.then(function () {
          return resolverEndereco(reg.localizacao.latitude, reg.localizacao.longitude).then(function (end) {
            if (!end.texto) return;
            reg.endereco.texto = end.texto;
            reg.endereco.aproximado = end.aproximado;
            reg.endereco.provedor = end.provedor;
            reg.endereco.pendente = false;
            reg.endereco.posterior = true;     // endereço obtido depois do registro
            reg.endereco.obtidoEm = isoLocal(new Date());
            reg.endereco.tentativas = (reg.endereco.tentativas || []).concat(end.tentativas);
            return atualizarHashCompleto(reg).then(function () {
              return Banco.put(reg).then(function () { feitos++; });
            });
          });
        });
      }, Promise.resolve()).then(function () { return { pendentes: pend.length, completados: feitos }; });
    });
  }

  // Gera a imagem de mapa dos registros que ficaram sem ela (sem internet ou falha dos servidores de mapa).
  function completarMapasPendentes() {
    return listar().then(function (rs) {
      var pend = rs.filter(function (r) { return r.mapa && !r.mapa.dataUrl && r.mapa.pendente; });
      var feitos = 0;
      return pend.reduce(function (cadeia, reg) {
        return cadeia.then(function () {
          var l = reg.localizacao, h = reg.horario;
          return gerarMapa(infoMapa(l.latitude, l.longitude, l.precisaoM, h.dispositivoEpochMs, h.fusoIANA, h.fusoOffsetMin, true)).then(function (m) {
            if (!m.dataUrl) { reg.mapa.tentativas = (reg.mapa.tentativas || []).concat(m.tentativas || []); reg.mapa.erro = m.erro; return Banco.put(reg); }
            reg.mapa = m;
            return atualizarHashCompleto(reg).then(function () { return Banco.put(reg).then(function () { feitos++; }); });
          });
        });
      }, Promise.resolve()).then(function () { return { pendentes: pend.length, completados: feitos }; });
    });
  }

  function completarPendentes() {
    return completarEnderecosPendentes().then(function (e) {
      return completarMapasPendentes().then(function (m) { return { enderecos: e, mapas: m }; });
    });
  }

  // ---------------------------------------------------------------- saída
  function linkMapa(reg, tipo) {
    var la = reg.localizacao.latitude, lo = reg.localizacao.longitude;
    if (tipo === 'osm') return 'https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=19/' + la + '/' + lo;
    return 'https://www.google.com/maps?q=' + la + ',' + lo;
  }

  function formatarData(reg) {
    try {
      return new Date(reg.horario.dispositivoEpochMs).toLocaleString('pt-BR', { timeZone: reg.horario.fusoIANA || undefined });
    } catch (e) {
      return reg.horario.dispositivoISO;
    }
  }

  function textoResumo(reg) {
    var l = reg.localizacao, h = reg.horario, e = reg.endereco || {};
    var off = h.fusoOffsetMin, sinal = off >= 0 ? '+' : '-';
    var utc = 'UTC' + sinal + pad(Math.floor(Math.abs(off) / 60)) + ':' + pad(Math.abs(off) % 60);
    var linhas = [];
    linhas.push('REGISTRO DE LOCAL E HORA');
    linhas.push('Tipo: ' + reg.tipo);
    linhas.push('Data/hora (relógio do aparelho): ' + formatarData(reg) + ' (' + utc + ')');
    if (h.referencia) {
      var d = h.diferencaSeg;
      linhas.push('Conferência de hora na internet: ' + h.referencia.fonte + ' (diferença ' + (d > 0 ? '+' : '') + String(d).replace('.', ',') + ' s)' +
        (h.alertaRelogio ? ' — ALERTA: relógio do aparelho divergente' : ''));
    } else {
      linhas.push('Conferência de hora na internet: não realizada');
    }
    if (e.texto) {
      linhas.push('Local: ' + e.texto + (e.aproximado ? ' (endereço aproximado)' : '') +
        (e.posterior ? ' [endereço obtido depois do registro]' : '') + ' — fonte: ' + e.provedor);
    } else {
      linhas.push('Local: endereço não obtido');
    }
    linhas.push('Coordenadas: ' + l.latitude.toFixed(6) + ', ' + l.longitude.toFixed(6) +
      ' (margem de erro de cerca de ' + String(l.precisaoM).replace('.', ',') + ' m' + (l.precisaoBaixa ? ' — PRECISÃO BAIXA' : '') + ')');
    linhas.push('Mapa: ' + linkMapa(reg, 'google'));
    if (reg.mapa && reg.mapa.dataUrl) {
      linhas.push('Imagem do mapa: anexada (' + reg.mapa.atribuicao + ', zoom ' + reg.mapa.zoom + (reg.mapa.posterior ? ', gerada depois do registro' : '') + ')');
    } else if (reg.mapa && reg.mapa.pendente) {
      linhas.push('Imagem do mapa: não gerada (pendente)');
    }
    if (reg.observacao) linhas.push('Observação: ' + reg.observacao);
    if (reg.hash && reg.hash.nucleo) linhas.push('Hash (SHA-256): ' + reg.hash.nucleo);
    linhas.push('Registro: ' + reg.id + ' · módulo GeoRegistro v' + reg.versaoModulo);
    return linhas.join('\n');
  }

  function semImagem(reg) {
    var c = JSON.parse(JSON.stringify(reg));
    if (c.mapa && c.mapa.dataUrl) { c.mapa.dataUrl = null; c.mapa.imagemOmitidaNaExportacao = true; }
    return c;
  }

  function exportarJSON(registros, opcoes) {
    return listar().then(function (todos) {
      var rs = registros || todos;
      if (opcoes && opcoes.semImagens) rs = rs.map(semImagem);
      return JSON.stringify({
        formato: 'geo-registro', esquema: ESQUEMA, versaoModulo: VERSAO, appId: CFG.appId,
        exportadoEm: isoLocal(new Date()), semImagens: !!(opcoes && opcoes.semImagens), registros: rs
      }, null, 2);
    });
  }

  function baixarBlob(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function baixarJSON(op) {
    op = op || {};
    return exportarJSON(op.registros, { semImagens: !!op.semImagens }).then(function (json) {
      var d = new Date();
      var nome = op.nomeArquivo || ('registros-' + CFG.appId + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json');
      baixarBlob(new Blob([json], { type: 'application/json' }), nome);
      return nome;
    });
  }

  function dataUrlParaBlob(du) {
    var p = du.split(',');
    var mime = /data:([^;]+)/.exec(p[0])[1];
    var bin = atob(p[1]);
    var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  }

  function nomeBaseArquivo(reg) {
    var d = new Date(reg.horario.dispositivoEpochMs);
    return 'registro-' + String(reg.tipo).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' +
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function baixarImagemMapa(reg, nome) {
    if (!reg || !reg.mapa || !reg.mapa.dataUrl) return Promise.reject(erro('SEM_MAPA', 'Este registro não tem imagem de mapa.'));
    var ext = reg.mapa.mimeType === 'image/png' ? '.png' : '.jpg';
    var n = nome || (nomeBaseArquivo(reg) + ext);
    baixarBlob(dataUrlParaBlob(reg.mapa.dataUrl), n);
    return Promise.resolve(n);
  }

  // Abre o compartilhamento do aparelho (WhatsApp etc.) com o resumo em texto e, se possível, a imagem.
  function compartilhar(reg) {
    var nav = global.navigator || {};
    if (!nav.share) return Promise.resolve({ ok: false, motivo: 'SEM_COMPARTILHAMENTO' });
    var dados = { title: 'Registro de local e hora', text: textoResumo(reg) };
    try {
      if (reg.mapa && reg.mapa.dataUrl && global.File && nav.canShare) {
        var ext = reg.mapa.mimeType === 'image/png' ? '.png' : '.jpg';
        var f = new global.File([dataUrlParaBlob(reg.mapa.dataUrl)], nomeBaseArquivo(reg) + ext, { type: reg.mapa.mimeType });
        if (nav.canShare({ files: [f] })) dados.files = [f];
      }
    } catch (e) { /* segue só com o texto */ }
    return nav.share(dados).then(
      function () { return { ok: true, comImagem: !!dados.files }; },
      function (e) { return { ok: false, motivo: (e && e.name === 'AbortError') ? 'CANCELADO' : 'ERRO' }; }
    );
  }

  // ---------------------------------------------------------------- PDF (gerador próprio, sem biblioteca)
  // Larguras da fonte Helvetica (unidades de 1/1000 do corpo) para quebrar linhas.
  var LARG_HELV = {
    32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191, 40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
    48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556, 56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556, 64: 1015,
    65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778, 72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778, 80: 667,
    81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944, 88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556, 96: 333,
    97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556, 104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556, 111: 556,
    112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334, 124: 260, 125: 334, 126: 584
  };
  var LARG_EXTRA = { 0xB7: 278, 0xA9: 737, 0xB0: 400, 0xAA: 370, 0xBA: 365, 0x96: 556, 0x97: 1000, 0x95: 350, 0x85: 1000 };
  var CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89,
    0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96,
    0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };

  // Converte texto Unicode em "string binária" na codificação WinAnsi (cp1252) que o PDF usa.
  function cp1252(s) {
    var out = '';
    Array.from(String(s === null || s === undefined ? '' : s)).forEach(function (ch) {
      var c = ch.codePointAt(0);
      if (c === 9 || c === 10 || c === 13) out += ' ';
      else if (c >= 32 && c < 127) out += ch;
      else if (c >= 0xA0 && c <= 0xFF) out += String.fromCharCode(c);
      else if (CP1252[c]) out += String.fromCharCode(CP1252[c]);
      else if (c === 0x2248) out += '~';
      else if (c === 0x2192) out += '>';
      else out += '?';
    });
    return out;
  }

  function largTxt(s, tam, negrito) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), u = LARG_HELV[c];
      if (u === undefined && c >= 0xC0) u = LARG_HELV[String.fromCharCode(c).normalize('NFD').charCodeAt(0)];
      if (u === undefined) u = LARG_EXTRA[c] || 556;
      w += u;
    }
    return w * tam / 1000 * (negrito ? 1.08 : 1);
  }

  // Quebra o texto em linhas que cabem em maxW; palavras maiores que a linha são partidas.
  function quebrarLinhas(texto, tam, maxW, negrito, mono) {
    var t = cp1252(texto);
    function larg(x) { return mono ? x.length * tam * 0.6 : largTxt(x, tam, negrito); }
    var linhas = [], atual = '';
    t.split(' ').forEach(function (pal) {
      while (larg(pal) > maxW) {
        var k = pal.length;
        while (k > 1 && larg(pal.slice(0, k)) > maxW) k--;
        if (atual) { linhas.push(atual); atual = ''; }
        linhas.push(pal.slice(0, k));
        pal = pal.slice(k);
      }
      var tent = atual ? atual + ' ' + pal : pal;
      if (larg(tent) <= maxW) atual = tent;
      else { if (atual) linhas.push(atual); atual = pal; }
    });
    if (atual || !linhas.length) linhas.push(atual);
    return linhas;
  }

  function escPdf(s) { return s.replace(/[\\()]/g, '\\$&'); }

  function bytesDeBinario(str) {
    var u = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255;
    return u;
  }

  function bytesDeDataUrl(du) {
    var bin = atob(du.split(',')[1]);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  // ---------------------------------------------------------------- QR code (gerador próprio, nível M, versões 1 a 10)
  var QR_VERSOES = {
    1: [16, 10, [[1, 16]]], 2: [28, 16, [[1, 28]]], 3: [44, 26, [[1, 44]]], 4: [64, 18, [[2, 32]]], 5: [86, 24, [[2, 43]]],
    6: [108, 16, [[4, 27]]], 7: [124, 18, [[4, 31]]], 8: [154, 22, [[2, 38], [2, 39]]], 9: [182, 22, [[3, 36], [2, 37]]], 10: [216, 26, [[4, 43], [1, 44]]]
  };
  var QR_ALINH = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  var GF_EXP = [], GF_LOG = [];
  (function () { var x = 1; for (var i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]; })();
  function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]; }
  function rsResto(dados, n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var ng = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= gfMul(g[j], GF_EXP[i]); }
      g = ng;
    }
    var r = new Array(n).fill(0);
    dados.forEach(function (d) {
      var f = d ^ r[0];
      r.shift(); r.push(0);
      for (var k = 0; k < n; k++) r[k] ^= gfMul(g[k + 1], f);
    });
    return r;
  }

  // Devolve uma matriz de booleanos (true = módulo escuro) ou null se o texto não couber.
  function qrMatriz(texto) {
    var bytes = [];
    unescape(encodeURIComponent(texto)).split('').forEach(function (c) { bytes.push(c.charCodeAt(0)); });
    var v = 0, i, j;
    for (i = 1; i <= 10; i++) {
      if (4 + (i < 10 ? 8 : 16) + 8 * bytes.length <= QR_VERSOES[i][0] * 8) { v = i; break; }
    }
    if (!v) return null;
    var info = QR_VERSOES[v], totalDados = info[0], nEc = info[1], blocosDef = info[2];
    var bits = [];
    function pb(val, n) { for (var k = n - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
    pb(4, 4); pb(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { pb(b, 8); });
    for (i = 0; i < 4 && bits.length < totalDados * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    for (i = 0; bits.length < totalDados * 8; i++) pb(i % 2 === 0 ? 0xEC : 0x11, 8);
    var cw = [];
    for (i = 0; i < bits.length; i += 8) { var by = 0; for (j = 0; j < 8; j++) by = (by << 1) | bits[i + j]; cw.push(by); }
    var blocos = [], pos = 0;
    blocosDef.forEach(function (d) { for (var k = 0; k < d[0]; k++) { blocos.push(cw.slice(pos, pos + d[1])); pos += d[1]; } });
    var ecs = blocos.map(function (b) { return rsResto(b, nEc); });
    var final = [], maxLen = Math.max.apply(null, blocos.map(function (b) { return b.length; }));
    for (i = 0; i < maxLen; i++) blocos.forEach(function (b) { if (i < b.length) final.push(b[i]); });
    for (i = 0; i < nEc; i++) ecs.forEach(function (e) { final.push(e[i]); });

    var n = 17 + 4 * v, m = [], fn = [];
    for (i = 0; i < n; i++) { m.push(new Array(n).fill(false)); fn.push(new Array(n).fill(false)); }
    function setF(x, y, val) { if (x >= 0 && y >= 0 && x < n && y < n) { m[y][x] = !!val; fn[y][x] = true; } }
    for (i = 0; i < n; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    [[3, 3], [n - 4, 3], [3, n - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var d = Math.max(Math.abs(dx), Math.abs(dy)); setF(c[0] + dx, c[1] + dy, d !== 2 && d !== 4); }
    });
    var al = QR_ALINH[v];
    al.forEach(function (ay) { al.forEach(function (ax) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    function formato(mask) {
      var data = mask, rem = data, k;       // nível M = 00
      for (k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((data << 10) | rem) ^ 0x5412;
      function gb(x) { return ((b >>> x) & 1) !== 0; }
      for (k = 0; k <= 5; k++) setF(8, k, gb(k));
      setF(8, 7, gb(6)); setF(8, 8, gb(7)); setF(7, 8, gb(8));
      for (k = 9; k < 15; k++) setF(14 - k, 8, gb(k));
      for (k = 0; k < 8; k++) setF(n - 1 - k, 8, gb(k));
      for (k = 8; k < 15; k++) setF(8, n - 15 + k, gb(k));
      setF(8, n - 8, true);
    }
    formato(0);
    if (v >= 7) {
      var rem = v, k;
      for (k = 0; k < 12; k++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (v << 12) | rem;
      for (k = 0; k < 18; k++) { var bit = ((vb >>> k) & 1) !== 0, a = n - 11 + (k % 3), b2 = Math.floor(k / 3); setF(a, b2, bit); setF(b2, a, bit); }
    }
    var idx = 0, total = final.length * 8;
    for (var right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < n; vert++) for (j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
        if (!fn[y][x] && idx < total) { m[y][x] = ((final[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0; idx++; }
      }
    }
    function aplica(mask) {
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        if (fn[y][x]) continue;
        var inv;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
        }
        if (inv) m[y][x] = !m[y][x];
      }
    }
    function penal() {
      var p = 0, y, x, run, c, dark = 0;
      for (y = 0; y < n; y++) {
        run = 1;
        for (x = 1; x < n; x++) { if (m[y][x] === m[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
      }
      for (x = 0; x < n; x++) {
        run = 1;
        for (y = 1; y < n; y++) { if (m[y][x] === m[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
      }
      for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) { c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (m[y][x]) dark++;
      p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
      return p;
    }
    var melhor = 0, melhorP = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      aplica(mk); formato(mk);
      var pp = penal();
      if (pp < melhorP) { melhorP = pp; melhor = mk; }
      aplica(mk);                       // desfaz a máscara (a operação é uma inversão)
    }
    aplica(melhor); formato(melhor);
    return m;
  }

  function corHex(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
    if (!m) return [0.06, 0.15, 0.26];
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Monta uma página A4 para o registro (v = resultado de verificarIntegridade).
  function paginaPdf(reg, n, total, v) {
    var PW = 595, PH = 842, M = 42, CW = PW - 2 * M;
    var T = CFG.pdf || {};
    var cP = corHex(T.corPrincipal), cD = corHex(T.corDestaque);
    var ops = [], links = [], imagem = null;
    var tx = textos;
    function Y(yTop) { return (PH - yTop).toFixed(2); }
    function f2(x) { return x.toFixed(2); }
    function cor(c) { ops.push(f2(c[0]) + ' ' + f2(c[1]) + ' ' + f2(c[2]) + ' rg'); }
    function corTr(c, w) { ops.push(f2(c[0]) + ' ' + f2(c[1]) + ' ' + f2(c[2]) + ' RG ' + w + ' w'); }
    function ret(x, yTop, w, h) { ops.push(f2(x) + ' ' + Y(yTop + h) + ' ' + f2(w) + ' ' + f2(h) + ' re f'); }
    function rr(x, yTop, w, h, r, modo) {      // retângulo arredondado; modo: 'f', 'S' ou 'B'
      var x0 = x, y0 = PH - (yTop + h), k = 0.5523 * r;
      ops.push([f2(x0 + r), f2(y0), 'm', f2(x0 + w - r), f2(y0), 'l',
        f2(x0 + w - r + k), f2(y0), f2(x0 + w), f2(y0 + r - k), f2(x0 + w), f2(y0 + r), 'c',
        f2(x0 + w), f2(y0 + h - r), 'l',
        f2(x0 + w), f2(y0 + h - r + k), f2(x0 + w - r + k), f2(y0 + h), f2(x0 + w - r), f2(y0 + h), 'c',
        f2(x0 + r), f2(y0 + h), 'l',
        f2(x0 + r - k), f2(y0 + h), f2(x0), f2(y0 + h - r + k), f2(x0), f2(y0 + h - r), 'c',
        f2(x0), f2(y0 + r), 'l',
        f2(x0), f2(y0 + r - k), f2(x0 + r - k), f2(y0), f2(x0 + r), f2(y0), 'c', 'h', modo].join(' '));
    }
    function circ(cx, cyTop, r) {
      var y0 = PH - cyTop, k = 0.5523 * r;
      ops.push([f2(cx + r), f2(y0), 'm',
        f2(cx + r), f2(y0 + k), f2(cx + k), f2(y0 + r), f2(cx), f2(y0 + r), 'c',
        f2(cx - k), f2(y0 + r), f2(cx - r), f2(y0 + k), f2(cx - r), f2(y0), 'c',
        f2(cx - r), f2(y0 - k), f2(cx - k), f2(y0 - r), f2(cx), f2(y0 - r), 'c',
        f2(cx + k), f2(y0 - r), f2(cx + r), f2(y0 - k), f2(cx + r), f2(y0), 'c h f'].join(' '));
    }
    function pino(cx, cyTop, s, cPino, cBuraco) {   // pino de mapa desenhado em vetor
      var py = PH - cyTop, r = s * 0.42, cy = py + s * 0.12, ponta = py - s * 0.62, h = cy - ponta;
      cor(cPino);
      ops.push([f2(cx), f2(ponta), 'm',
        f2(cx - r * 0.3), f2(ponta + h * 0.35), f2(cx - r), f2(cy - r * 0.45), f2(cx - r), f2(cy), 'c',
        f2(cx - r), f2(cy + r * 0.55), f2(cx - r * 0.55), f2(cy + r), f2(cx), f2(cy + r), 'c',
        f2(cx + r * 0.55), f2(cy + r), f2(cx + r), f2(cy + r * 0.55), f2(cx + r), f2(cy), 'c',
        f2(cx + r), f2(cy - r * 0.45), f2(cx + r * 0.3), f2(ponta + h * 0.35), f2(cx), f2(ponta), 'c h f'].join(' '));
      cor(cBuraco); circ(cx, PH - cy, r * 0.42);
    }
    function txt(x, yTop, str, tam, fonte) {
      ops.push('BT /' + fonte + ' ' + tam + ' Tf ' + f2(x) + ' ' + Y(yTop) + ' Td (' + escPdf(str) + ') Tj ET');
    }
    function centro(x, w, yTop, str, tam, fonte, neg) { txt(x + (w - largTxt(str, tam, neg)) / 2, yTop, str, tam, fonte); }
    var CINZA = [0.35, 0.4, 0.47], CINZA2 = [0.4, 0.44, 0.5], TEXTO = [0.1, 0.12, 0.16], LINHA = [0.88, 0.91, 0.95];

    var h = reg.horario, l = reg.localizacao, e = reg.endereco || {}, m = reg.mapa;
    var y;

    // ---- cabeçalho
    cor(cP); ret(0, 0, PW, 92);
    cor(cD); ret(0, 92, PW, 3);
    cor(cD); rr(M, 21, 50, 50, 12, 'f');
    pino(M + 25, 46, 30, [0.02, 0.2, 0.18], cD);
    cor([1, 1, 1]); txt(M + 64, 43, cp1252(T.titulo || 'REGISTRO DE LOCAL E HORA'), 16.5, 'F2');
    cor([0.73, 0.8, 0.88]);
    txt(M + 64, 61, cp1252('Tipo: ' + reg.tipo + '  ·  App: ' + reg.appId + '  ·  Página ' + n + ' de ' + total), 8.5, 'F1');
    // selo de integridade: só diz "verificada" se a verificação feita agora confirmou
    var selo, lin1, lin2, cSelo;
    var hoje = new Date();
    if (v && v.ok) { lin1 = 'INTEGRIDADE'; lin2 = 'verificada em ' + pad(hoje.getDate()) + '/' + pad(hoje.getMonth() + 1) + '/' + hoje.getFullYear(); cSelo = [0.5, 0.94, 0.89]; }
    else if (v && v.motivo) { lin1 = 'ATENÇÃO'; lin2 = 'integridade não confere'; cSelo = [1, 0.55, 0.55]; }
    else { lin1 = 'INTEGRIDADE'; lin2 = 'não verificada'; cSelo = [0.73, 0.8, 0.88]; }
    var sw = 132, sx = PW - M - sw;
    corTr(cSelo, 1.1); rr(sx, 25, sw, 40, 7, 'S');
    cor(cSelo); centro(sx, sw, 42, cp1252(lin1), 8.5, 'F2', true); centro(sx, sw, 55, cp1252(lin2), 7.5, 'F1');

    // ---- tabela de dados
    y = 116;
    var LX = M + 12, VX = M + 142, VW = CW - 154;
    function q(t, tam, neg) { return quebrarLinhas(t, tam || 10.5, VW, neg); }
    var linhas = [];
    linhas.push(['Data e hora', [{ l: q(formatarData(reg) + ' (' + utcTexto(h.fusoOffsetMin) + ')') }]]);
    var conf = h.referencia
      ? 'Conferida na internet (' + h.referencia.fonte + '): diferença de ' + (h.diferencaSeg > 0 ? '+' : '') + String(h.diferencaSeg).replace('.', ',') + ' s em relação ao relógio do aparelho.'
      : 'Não conferida na internet: a hora é a informada pelo relógio do aparelho.';
    var bloco = [{ l: q(conf) }];
    if (h.alertaRelogio) bloco.push({ l: q('ALERTA: relógio do aparelho divergente da hora da internet.'), c: [0.7, 0.1, 0.1] });
    linhas.push(['Conferência de hora', bloco]);
    if (e.texto) {
      linhas.push(['Local (endereço)', [{ l: q(e.texto) },
        { l: q('Fonte: ' + e.provedor + (e.aproximado ? ' · endereço aproximado' : '') + (e.posterior ? ' · obtido depois do registro' : ''), 8, false), t: 8, c: CINZA2 }]]);
    } else {
      linhas.push(['Local (endereço)', [{ l: q('Endereço não obtido (somente coordenadas).') }]]);
    }
    linhas.push(['Coordenadas', [{ l: [cp1252(l.latitude.toFixed(6) + ', ' + l.longitude.toFixed(6))] }]]);
    linhas.push(['Margem de erro', [{ l: q('cerca de ' + String(l.precisaoM).replace('.', ',') + ' m' + (l.precisaoBaixa ? '  —  PRECISÃO BAIXA' : '')), c: l.precisaoBaixa ? [0.7, 0.1, 0.1] : null }]]);
    var url = linkMapa(reg, 'google');
    linhas.push(['Mapa (link)', [{ l: quebrarLinhas(url, 8.5, VW, false), t: 8.5, c: [0.1, 0.3, 0.7], link: url }]]);
    if (reg.observacao) {
      var ol = q(reg.observacao);
      if (ol.length > 6) { ol = ol.slice(0, 6); ol[5] = ol[5].replace(/\s*\S*$/, '') + ' ... (texto cortado no PDF; completo no arquivo JSON)'; }
      linhas.push(['Observação', [{ l: ol }]]);
    }
    var tTopo = y;
    linhas.forEach(function (ln, i) {
      var cont = 0;
      ln[1].forEach(function (b) { cont += b.l.length * ((b.t || 10.5) + 3.5); });
      var alt = cont + 10;
      cor(i % 2 === 0 ? [0.953, 0.965, 0.984] : [1, 1, 1]); ret(M, y, CW, alt);
      cor(CINZA); txt(LX, y + 13, cp1252(ln[0]).toUpperCase(), 7.5, 'F2');
      var yy = y + 13;
      ln[1].forEach(function (b) {
        var tam = b.t || 10.5;
        b.l.forEach(function (t) {
          cor(b.c || TEXTO); txt(VX, yy, t, tam, 'F1');
          if (b.link) links.push({ x1: VX, y1: PH - (yy + 3), x2: VX + largTxt(t, tam, false), y2: PH - (yy - tam), uri: b.link });
          yy += tam + 3.5;
        });
      });
      y += alt;
    });
    corTr(LINHA, 0.8); rr(M, tTopo, CW, y - tTopo, 6, 'S');
    y += 16;

    // ---- mapa + QR code
    var QB = 108, GAP = 14;
    var matriz = (T.qrCode === false) ? null : qrMatriz(url);
    function desenhaQr(x, yTop) {
      corTr(LINHA, 0.8); rr(x, yTop, QB, QB, 8, 'S');
      var mod = (QB - 20) / (matriz.length), partes = [];
      matriz.forEach(function (lin, r) { lin.forEach(function (d, c) {
        if (d) partes.push(f2(x + 10 + c * mod) + ' ' + Y(yTop + 10 + (r + 1) * mod) + ' ' + f2(mod + 0.05) + ' ' + f2(mod + 0.05) + ' re');
      }); });
      cor(cP); ops.push(partes.join(' ') + ' f');
    }
    function legendaQr(x, yTop, w) {
      cor(CINZA2);
      quebrarLinhas('Aponte a câmera para abrir o local no mapa', 7.5, w, false).forEach(function (t, i) { centro(x, w, yTop + 12 + i * 9, t, 7.5, 'F1'); });
    }
    var reserva = 215;                       // espaço para integridade, avisos e rodapé
    if (m && m.dataUrl && m.mimeType === 'image/jpeg') {
      var mw = matriz ? CW - QB - GAP : Math.min(CW, 460), mh = mw * m.altura / m.largura;
      var disp = PH - 44 - y - reserva - 18;
      if (mh > disp) { mh = Math.max(disp, 110); mw = mh * m.largura / m.altura; }
      ops.push('q ' + f2(mw) + ' 0 0 ' + f2(mh) + ' ' + M + ' ' + Y(y + mh) + ' cm /Im1 Do Q');
      corTr([0.78, 0.82, 0.87], 0.8); ops.push(f2(M) + ' ' + Y(y + mh) + ' ' + f2(mw) + ' ' + f2(mh) + ' re S');
      cor(CINZA2); txt(M, y + mh + 11, cp1252(m.atribuicao + ' · zoom ' + m.zoom + (m.posterior ? ' · imagem gerada depois do registro' : '')), 7, 'F1');
      if (matriz) { var qx = M + mw + GAP; desenhaQr(qx, y); legendaQr(qx, y + QB, QB); }
      imagem = { bytes: bytesDeDataUrl(m.dataUrl), w: m.largura, h: m.altura };
      y += mh + 26;
    } else {
      if (matriz) {
        desenhaQr(M, y);
        cor(TEXTO); txt(M + QB + GAP, y + 20, cp1252('Imagem do mapa'), 8.5, 'F2');
        cor(CINZA2);
        var msg = (m && m.dataUrl) ? 'Imagem em formato PNG não incluída no PDF (consta no arquivo JSON).' : (m && m.pendente ? 'Imagem do mapa ainda não gerada (pendente).' : 'Imagem do mapa não incluída neste registro.');
        quebrarLinhas(msg + ' Aponte a câmera para o QR code para abrir o local no mapa.', 8.5, CW - QB - GAP, false).forEach(function (t, i) { txt(M + QB + GAP, y + 36 + i * 12, t, 8.5, 'F1'); });
        y += QB + 14;
      } else if (m && m.dataUrl) {
        cor(CINZA2); txt(M, y + 8, cp1252('Imagem do mapa em formato PNG não incluída no PDF (consta no arquivo JSON).'), 8.5, 'F1'); y += 22;
      }
    }

    // ---- integridade
    var itens = [['Identificador do registro', reg.id]];
    if (reg.hash && reg.hash.nucleo) {
      itens.push(['Hash SHA-256 (dados do registro: local, hora, tipo e observação)', reg.hash.nucleo]);
      itens.push(['Hash SHA-256 completo (inclui endereço e imagem do mapa)', reg.hash.completo]);
      if (m && m.sha256) itens.push(['Hash SHA-256 da imagem do mapa', m.sha256]);
    } else itens.push(['Hash', 'indisponível neste registro']);
    var nota = (reg.hash && reg.hash.completoRecalculadoEm) ? 'Hash completo recalculado em ' + reg.hash.completoRecalculadoEm + ' (endereço ou imagem obtidos depois).' : '';
    var hi = 30 + itens.length * 23 + (nota ? 11 : 0);
    cor([0.973, 0.98, 0.988]); rr(M, y, CW, hi, 8, 'f'); corTr(LINHA, 0.8); rr(M, y, CW, hi, 8, 'S');
    cor(cD); rr(M + 12, y + 12, 9, 9, 2.5, 'f');
    cor(cP); txt(M + 27, y + 20, cp1252('Integridade do registro'), 9.5, 'F2');
    var iy = y + 36;
    itens.forEach(function (it) {
      cor(CINZA); txt(M + 12, iy, cp1252(it[0]).toUpperCase(), 6.5, 'F2');
      cor(TEXTO); txt(M + 12, iy + 10, cp1252(it[1]), 8, 'F3');
      iy += 23;
    });
    if (nota) { cor(CINZA2); txt(M + 12, iy - 4, cp1252(nota), 7, 'F1'); }
    y += hi + 12;

    // ---- avisos
    var corpo = [];
    (tx.limitacoes || []).slice(0, 2).forEach(function (it) { quebrarLinhas(it, 7.5, CW - 34, false).forEach(function (ln, i) { corpo.push({ ln: ln, ponto: i === 0 }); }); });
    var hb = 28 + corpo.length * 10;
    if (y + hb < PH - 44) {
      cor([1, 0.973, 0.9]); rr(M, y, CW, hb, 6, 'f');
      cor([0.96, 0.7, 0.0]); ret(M, y, 3.5, hb);
      cor(TEXTO); txt(M + 14, y + 16, cp1252('Importante'), 8.5, 'F2');
      cor([0.25, 0.28, 0.33]);
      corpo.forEach(function (c, i) {
        if (c.ponto) txt(M + 14, y + 28 + i * 10, cp1252('•'), 7.5, 'F1');
        txt(M + 23, y + 28 + i * 10, c.ln, 7.5, 'F1');
      });
    }

    // ---- rodapé
    cor(LINHA); ret(M, PH - 36, CW, 0.6);
    cor(CINZA2);
    txt(M, PH - 24, cp1252((T.rodape || '© 2026 Felippe Alvarez') + ' · GeoRegistro v' + VERSAO + ' · PDF gerado em ' + new Date().toLocaleString('pt-BR')), 7.5, 'F1');
    var pg2 = cp1252(n + '/' + total);
    txt(PW - M - largTxt(pg2, 7.5, false), PH - 24, pg2, 7.5, 'F1');

    return { conteudo: ops.join('\n'), imagem: imagem, links: links };
  }

  function montarPdf(regs, verifs) {
    var objs = [];
    function def(id, partes) { objs[id - 1] = partes; }
    function seq(strOuBytes) { return strOuBytes; }
    var PW = 595, PH = 842;
    var total = regs.length;
    var proximo = 7;
    var kids = [];

    def(4, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
    def(5, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
    def(6, ['<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>']);

    regs.forEach(function (reg, i) {
      var pg = paginaPdf(reg, i + 1, total, verifs ? verifs[i] : null);
      var idImg = null, idCont, idPag, annots = [];
      if (pg.imagem) {
        idImg = proximo++;
        def(idImg, ['<< /Type /XObject /Subtype /Image /Width ' + pg.imagem.w + ' /Height ' + pg.imagem.h +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.imagem.bytes.length + ' >>\nstream\n',
          pg.imagem.bytes, '\nendstream']);
      }
      idCont = proximo++;
      var cont = bytesDeBinario(pg.conteudo);
      def(idCont, ['<< /Length ' + cont.length + ' >>\nstream\n', cont, '\nendstream']);
      pg.links.forEach(function (lk) {
        var ida = proximo++;
        def(ida, ['<< /Type /Annot /Subtype /Link /Rect [' + [lk.x1, lk.y1, lk.x2, lk.y2].map(function (v) { return v.toFixed(2); }).join(' ') +
          '] /Border [0 0 0] /A << /S /URI /URI (' + escPdf(lk.uri) + ') >> >>']);
        annots.push(ida + ' 0 R');
      });
      idPag = proximo++;
      def(idPag, ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>' +
        (idImg ? ' /XObject << /Im1 ' + idImg + ' 0 R >>' : '') + ' >> /Contents ' + idCont + ' 0 R' +
        (annots.length ? ' /Annots [' + annots.join(' ') + ']' : '') + ' >>']);
      kids.push(idPag + ' 0 R');
    });

    var d = new Date();
    var data = 'D:' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    def(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    def(2, ['<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + total + ' >>']);
    def(3, ['<< /Title (' + escPdf(cp1252(total === 1 ? 'Registro de local e hora' : 'Registros de local e hora')) + ') /Creator (GeoRegistro) /Producer (GeoRegistro v' + VERSAO + ') /CreationDate (' + data + ') >>']);

    var partes = [], pos = 0, offsets = [];
    function put(x) { var u = typeof x === 'string' ? bytesDeBinario(x) : x; partes.push(u); pos += u.length; }
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    objs.forEach(function (ps, idx) {
      offsets[idx] = pos;
      put((idx + 1) + ' 0 obj\n');
      ps.forEach(put);
      put('\nendobj\n');
    });
    var xref = pos;
    var t = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { t += pad(o, 10) + ' 00000 n \n'; });
    t += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    put(t);
    return new Blob(partes, { type: 'application/pdf' });
  }

  function gerarPDF(regs) {
    var lista = Array.isArray(regs) ? regs : [regs];
    if (!lista.length || lista.some(function (r) { return !r || !r.localizacao || !r.horario; })) {
      return Promise.reject(erro('REGISTRO_INVALIDO', 'Registro inválido.'));
    }
    return Promise.all(lista.map(function (r) { return verificarIntegridade(r).catch(function () { return null; }); })).then(function (vs) {
      try { return montarPdf(lista, vs); }
      catch (e) { throw erro('PDF_FALHOU', 'Não foi possível gerar o PDF.'); }
    });
  }

  function nomePdf(regs) {
    var lista = Array.isArray(regs) ? regs : [regs];
    if (lista.length === 1) return nomeBaseArquivo(lista[0]) + '.pdf';
    var d = new Date();
    return 'registros-' + CFG.appId + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.pdf';
  }

  function baixarPDF(regs, nome) {
    return gerarPDF(regs).then(function (b) { var n = nome || nomePdf(regs); baixarBlob(b, n); return n; });
  }

  function compartilharPDF(regs) {
    var nav = global.navigator || {};
    if (!nav.share) return Promise.resolve({ ok: false, motivo: 'SEM_COMPARTILHAMENTO' });
    return gerarPDF(regs).then(function (b) {
      var f = new global.File([b], nomePdf(regs), { type: 'application/pdf' });
      if (nav.canShare && !nav.canShare({ files: [f] })) return { ok: false, motivo: 'SEM_SUPORTE_A_ARQUIVOS' };
      return nav.share({ title: 'Registro de local e hora', files: [f] }).then(
        function () { return { ok: true }; },
        function (e) { return { ok: false, motivo: (e && e.name === 'AbortError') ? 'CANCELADO' : 'ERRO' }; }
      );
    }, function (e) { return { ok: false, motivo: (e && e.codigo) || 'ERRO' }; });
  }

  function creditos() {
    var atrib = [PROVEDORES.nominatim.atribuicao];
    Object.keys(CFG.provedores).forEach(function (n) {
      if (n !== 'nominatim' && CFG.provedores[n].ativo && PROVEDORES[n]) atrib.push(PROVEDORES[n].atribuicao);
    });
    if (CFG.mapa.ativo) {
      CFG.mapa.ordem.forEach(function (n) {
        var pv = CFG.mapa.provedores[n];
        if (pv && pv.ativo && !atrib.some(function (a) { return a.texto === pv.atribuicao; })) {
          atrib.push({ nome: pv.nome || n, texto: pv.atribuicao, url: pv.url ? pv.url.split('/').slice(0, 3).join('/') : '' });
        }
      });
    }
    return {
      modulo: 'GeoRegistro',
      versao: VERSAO,
      copyright: '© 2026 Felippe Alvarez. Todos os direitos reservados.',
      licenca: 'PENDENTE de definição (distribuição a terceiros)',
      atribuicoes: atrib
    };
  }

  function diagnostico() {
    var nav = global.navigator || {};
    return {
      versao: VERSAO,
      paginaSegura: global.isSecureContext !== false && /^https?:$/.test((global.location && global.location.protocol) || 'https:'),
      origem: (global.location && global.location.protocol) || '',
      geolocalizacao: !!(nav && 'geolocation' in nav),
      indexedDB: !!global.indexedDB,
      armazenamento: Banco.modo(),
      cryptoHash: !!(global.crypto && global.crypto.subtle),
      online: nav.onLine !== false,
      appId: CFG.appId,
      mapaAtivo: !!CFG.mapa.ativo,
      canvas: !!(global.document && global.document.createElement)
    };
  }

  function estadoPermissao() {
    var nav = global.navigator;
    if (!nav || !nav.permissions || !nav.permissions.query) return Promise.resolve('desconhecido');
    return nav.permissions.query({ name: 'geolocation' }).then(function (r) { return r.state; }, function () { return 'desconhecido'; });
  }

  // ---------------------------------------------------------------- textos-base para o app usar
  var textos = {
    aviso: 'Este registro usa a localização do seu aparelho somente neste momento, quando você toca no botão. Nenhum rastreamento contínuo é feito.',
    manual: [
      'Toque em "Registrar local e hora" e autorize a localização quando o navegador pedir.',
      'Aguarde alguns segundos. Quanto menor a margem de erro, mais preciso é o ponto. Em locais abertos costuma ser melhor que em locais fechados.',
      'Se aparecer "precisão baixa", vá para perto de uma janela ou área aberta e tente de novo, ou registre assim mesmo.',
      'Confira o endereço e a hora, escreva uma observação se quiser e toque em "Salvar".',
      'Os registros ficam guardados neste aparelho, neste navegador. Se você limpar os dados do navegador, eles são apagados: exporte uma cópia de vez em quando.',
      'O endereço é obtido na internet. Sem internet, o registro é salvo só com as coordenadas e o endereço pode ser completado depois.',
      'Para guardar ou enviar um registro, use o PDF: ele reúne data e hora, endereço, coordenadas, margem de erro, mapa (quando houver), hashes e avisos. O PDF traz um QR code que abre o local no mapa e um selo de integridade, que só aparece como "verificada" se a verificação feita no momento de gerar o PDF confirmar que o registro não foi alterado. O arquivo JSON continua sendo a cópia completa dos dados.',
      'Se o app estiver com a imagem de mapa ligada, o registro também guarda um mapa com o ponto marcado e um círculo que mostra a margem de erro do GPS. Sem internet, a imagem fica pendente e é feita depois.'
    ],
    limitacoes: [
      'O registro é feito no próprio aparelho. O relógio e o GPS do aparelho podem ser alterados por quem o usa; por isso o registro é uma declaração do usuário acompanhada de indícios técnicos, e não uma prova absoluta.',
      'A conferência de hora na internet e o alerta de relógio divergente ajudam, mas não impedem fraude deliberada.',
      'O hash mostra se o registro foi alterado depois de salvo. Ele não garante que a hora e o local estavam corretos quando foi gerado.',
      'Dentro de edifícios a margem de erro pode ser grande. O endereço pode vir incompleto ou aproximado.',
      'A imagem do mapa é só uma ilustração do mesmo ponto de GPS: não aumenta o valor de prova do registro. O mapa de base pode estar desatualizado. O círculo azul mostra a margem de erro: o aparelho pode estar em qualquer lugar dentro dele.'
    ],
    privacidadeBase: 'MODELO-BASE, PRECISA DE REVISÃO JURÍDICA ANTES DE USO COM TERCEIROS. ' +
      'Este recurso coleta a localização do aparelho (latitude, longitude, margem de erro), a data e a hora, e o endereço correspondente, ' +
      'somente quando o usuário aciona o registro, para a finalidade de comprovar o local e o horário de uma atividade (por exemplo, vistoria ou visita comercial). ' +
      'Não há rastreamento contínuo. Os registros ficam armazenados no aparelho do usuário, que pode excluí-los a qualquer momento. ' +
      'Para obter o endereço e conferir a hora, as coordenadas e uma consulta de horário são enviadas a serviços externos de terceiros ' +
      '(OpenStreetMap/Nominatim, fontes de hora na internet e, se ativada, a imagem de mapa, que é montada a partir de trechos de mapa baixados do OpenStreetMap, cujo servidor recebe a região solicitada), que têm políticas próprias. ' +
      '[PENDENTE: identificação do responsável pelo tratamento, canal de contato do titular, base legal e prazo de guarda.]'
  };

  // ---------------------------------------------------------------- API pública
  global.GeoRegistro = {
    VERSAO: VERSAO,
    configurar: configurar,
    capturar: capturar,
    salvar: salvar,
    listar: listar,
    obter: obter,
    excluir: excluir,
    verificarIntegridade: verificarIntegridade,
    completarEnderecosPendentes: completarEnderecosPendentes,
    completarMapasPendentes: completarMapasPendentes,
    completarPendentes: completarPendentes,
    exportarJSON: exportarJSON,
    baixarJSON: baixarJSON,
    baixarImagemMapa: baixarImagemMapa,
    compartilhar: compartilhar,
    gerarPDF: gerarPDF,
    baixarPDF: baixarPDF,
    compartilharPDF: compartilharPDF,
    textoResumo: textoResumo,
    linkMapa: linkMapa,
    creditos: creditos,
    diagnostico: diagnostico,
    estadoPermissao: estadoPermissao,
    textos: textos,
    _interno: { montarTexto: montarTexto, canonico: canonico, resolverEndereco: resolverEndereco, escolherZoom: escolherZoom, mppAt: mppAt }  // usado nos testes
  };
})(typeof self !== 'undefined' ? self : globalThis);
