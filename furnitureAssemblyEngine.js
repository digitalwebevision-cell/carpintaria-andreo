/* ============================================================
   NOVARI — MOTOR 3D (Babylon.js)
   Lê o projeto (cm) e constrói cada módulo com peças independentes:
   laterais, fundo, prateleiras, portas, gavetas, puxadores, bancada…
   Atualização incremental: só reconstrói o módulo cuja geometria mudou;
   acabamentos alteram os materiais partilhados sem reconstruir nada.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.NovariCatalog;
  const CM = 0.01; // 1 cm em unidades Babylon (metros)
  const ESP = 0.018; // espessura dos painéis
  const ESP_FRENTE = 0.019;
  const FOLGA = 0.003;

  function criar(container, callbacks) {
    const B = global.BABYLON;
    if (!B) throw new Error('Babylon.js não foi carregado.');
    const cb = callbacks || {};

    // -------------------------------------------------------------
    // Motor, cena, câmera, luzes
    // -------------------------------------------------------------
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none;touch-action:none;';
    canvas.setAttribute('aria-label', 'Visualização 3D do projeto');
    container.innerHTML = '';
    container.appendChild(canvas);

    const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
    const scene = new B.Scene(engine);
    scene.clearColor = new B.Color4(0, 0, 0, 0); // mostra o fundo do CSS
    scene.imageProcessingConfiguration.contrast = 1.12;
    scene.imageProcessingConfiguration.exposure = 1.02;

    const camera = new B.ArcRotateCamera('camera', -Math.PI / 2 - 0.45, 1.12, 7, new B.Vector3(0, 1.1, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 1.2;
    camera.upperRadiusLimit = 30;
    camera.lowerBetaLimit = 0.02;
    camera.upperBetaLimit = Math.PI / 2 - 0.03;
    camera.wheelDeltaPercentage = 0.015;
    camera.pinchDeltaPercentage = 0.008;
    camera.panningSensibility = 180;
    camera.minZ = 0.05;
    camera.maxZ = 100;
    camera.inertia = 0.85;

    const hemi = new B.HemisphericLight('hemi', new B.Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.78;
    hemi.diffuse = new B.Color3(1, 0.98, 0.95);
    hemi.groundColor = new B.Color3(0.45, 0.42, 0.38);
    hemi.specular = new B.Color3(0.12, 0.12, 0.12);

    const sol = new B.DirectionalLight('sol', new B.Vector3(0.35, -1, 0.6), scene);
    sol.position = new B.Vector3(-3, 8, -5);
    sol.intensity = 0.85;
    sol.diffuse = new B.Color3(1, 0.96, 0.9);
    sol.autoCalcShadowZBounds = true;

    const preenchimento = new B.DirectionalLight('preenchimento', new B.Vector3(-0.4, -0.35, 1), scene);
    preenchimento.intensity = 0.32;
    preenchimento.specular = B.Color3.Black();

    const sombras = new B.ShadowGenerator(2048, sol);
    sombras.usePercentageCloserFiltering = true;
    sombras.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM;
    sombras.bias = 0.0012;
    sombras.normalBias = 0.015;
    sombras.darkness = 0.42;

    // Brilho só para as fitas LED (uma âncora invisível mantém a lista "apenas incluídos" não vazia)
    const brilho = new B.GlowLayer('brilho', scene, { mainTextureSamples: 2, blurKernelSize: 32 });
    brilho.intensity = 0.55;
    const ancoraBrilho = B.MeshBuilder.CreateBox('ancora-brilho', { size: 0.001 }, scene);
    ancoraBrilho.isVisible = false;
    ancoraBrilho.isPickable = false;
    brilho.addIncludedOnlyMesh(ancoraBrilho);

    // -------------------------------------------------------------
    // Materiais (partilhados — reutilizados por todos os módulos)
    // -------------------------------------------------------------
    function std(nome, hex, spec, power) {
      const m = new B.StandardMaterial(nome, scene);
      m.diffuseColor = B.Color3.FromHexString(hex);
      const s = spec === undefined ? 0.05 : spec;
      m.specularColor = new B.Color3(s, s, s);
      m.specularPower = power || 32;
      return m;
    }

    const mats = {
      frente: std('frente', '#c9a47c'),
      corpo: std('corpo', '#c9a47c'),
      interior: std('interior', '#ece7de', 0.04),
      rodape: std('rodape', '#2d2a27', 0.05),
      bancada: std('bancada', '#ebe7e0', 0.28, 64),
      metal: std('metal', '#b7b3ac', 0.7, 64),
      metalEscuro: std('metalEscuro', '#262626', 0.45, 64),
      inox: std('inox', '#c5c8ca', 0.75, 80),
      vidroPreto: std('vidroPreto', '#111111', 0.9, 128),
      espelho: std('espelho', '#d9e2e7', 1, 256),
      cuba: std('cuba', '#9a9ea1', 0.6, 64),
      parede: std('parede', '#f2eee8', 0.02),
      caixilho: std('caixilho', '#fbfbfa', 0.1),
      vidroJanela: std('vidroJanela', '#dbe9f1', 0.4),
      portaEntrada: std('portaEntrada', '#b69d80', 0.05),
      led: std('led', '#fff3da'),
      agua: std('agua', '#3b82c4', 0.3),
      gas: std('gas', '#d9a21f', 0.3),
      eletrica: std('eletrica', '#f7f7f5', 0.2),
      eletricaFuro: std('eletricaFuro', '#3a3a3a'),
      selecao: std('selecao', '#c1935a'),
      interiorFrio: std('interiorFrio', '#f4f6f7', 0.2),
      prateleiraVidro: std('prateleiraVidro', '#dfe7ea', 0.6)
    };
    mats.led.emissiveColor = new B.Color3(1, 0.88, 0.66);
    mats.led.disableLighting = true;
    mats.vidroJanela.emissiveColor = new B.Color3(0.72, 0.8, 0.86);
    mats.vidroJanela.alpha = 0.92;
    mats.espelho.emissiveColor = new B.Color3(0.25, 0.28, 0.3);
    mats.prateleiraVidro.alpha = 0.55;
    mats.agua.emissiveColor = new B.Color3(0.12, 0.3, 0.5);
    mats.gas.emissiveColor = new B.Color3(0.4, 0.28, 0.02);
    mats.selecao.emissiveColor = new B.Color3(0.76, 0.58, 0.35);
    mats.selecao.disableLighting = true;
    mats.selecao.alpha = 0.22;

    const cores = ['#6f7d8c', '#c7b9a6', '#3f4a57', '#a45c4a', '#e3ddd3'];
    const matsRoupa = cores.map((c, i) => std('roupa' + i, c, 0.02));

    // Textura procedural de madeira (arquitetura pronta para imagens reais)
    function aleatorio(seed) {
      let s = seed >>> 0;
      return () => {
        s += 0x6d2b79f5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function rgb(hex) {
      const c = B.Color3.FromHexString(hex);
      return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    }

    const cacheTexturas = {};
    function texturaMadeira(chave, base, veio) {
      if (cacheTexturas[chave]) return cacheTexturas[chave];
      const tamanho = 512;
      const tex = new B.DynamicTexture('madeira-' + chave, { width: tamanho, height: tamanho }, scene, true);
      const ctx = tex.getContext();
      const rnd = aleatorio(chave.length * 977 + 13);
      const v = rgb(veio);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, tamanho, tamanho);
      for (let i = 0; i < 16; i += 1) {
        ctx.fillStyle = `rgba(${v},${0.03 + rnd() * 0.06})`;
        ctx.fillRect(rnd() * tamanho, 0, 8 + rnd() * 60, tamanho);
      }
      ctx.lineCap = 'round';
      for (let i = 0; i < 170; i += 1) {
        const x = rnd() * tamanho;
        const amp = 1.5 + rnd() * 6;
        const freq = 0.004 + rnd() * 0.018;
        const fase = rnd() * 6.28;
        ctx.strokeStyle = `rgba(${v},${0.05 + rnd() * 0.16})`;
        ctx.lineWidth = 0.5 + rnd() * 1.8;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let y = 0; y <= tamanho; y += 12) ctx.lineTo(x + Math.sin(y * freq + fase) * amp, y);
        ctx.stroke();
      }
      tex.update();
      tex.anisotropicFilteringLevel = 8;
      cacheTexturas[chave] = tex;
      return tex;
    }

    function texturaChao() {
      const tamanho = 1024;
      const tex = new B.DynamicTexture('chao', { width: tamanho, height: tamanho }, scene, true);
      const ctx = tex.getContext();
      const rnd = aleatorio(4242);
      const filas = 8;
      const alt = tamanho / filas;
      for (let f = 0; f < filas; f += 1) {
        let x = -rnd() * 400;
        while (x < tamanho) {
          const comp = 300 + rnd() * 420;
          const tom = 205 + Math.round(rnd() * 22);
          ctx.fillStyle = `rgb(${tom},${tom - 14},${tom - 32})`;
          ctx.fillRect(x, f * alt, comp, alt);
          for (let i = 0; i < 12; i += 1) {
            ctx.strokeStyle = `rgba(120,90,60,${0.04 + rnd() * 0.07})`;
            ctx.lineWidth = 0.6 + rnd();
            const y = f * alt + rnd() * alt;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x + comp * 0.3, y + (rnd() - 0.5) * 8, x + comp * 0.7, y + (rnd() - 0.5) * 8, x + comp, y);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(80,60,40,0.35)';
          ctx.fillRect(x, f * alt, 2, alt);
          x += comp;
        }
        ctx.fillStyle = 'rgba(80,60,40,0.35)';
        ctx.fillRect(0, f * alt, tamanho, 2);
      }
      tex.update();
      tex.anisotropicFilteringLevel = 8;
      return tex;
    }

    mats.chao = std('chao', '#ffffff', 0.08);
    mats.chao.diffuseTexture = texturaChao();

    let chaveAcabamento = '';
    function aplicarAcabamento(p) {
      const chave = p.acabamento + '|' + p.estilo;
      if (chave === chaveAcabamento) return;
      chaveAcabamento = chave;
      const a = C.ACABAMENTOS[p.acabamento] || C.ACABAMENTOS.Carvalho;
      // `a.textura` (URL) poderá substituir a textura procedural no futuro
      [mats.frente, mats.corpo].forEach((m) => {
        if (a.textura) m.diffuseTexture = new B.Texture(a.textura, scene);
        else if (a.madeira) m.diffuseTexture = texturaMadeira(a.nome, a.cor, a.veio);
        else m.diffuseTexture = null;
        m.diffuseColor = a.madeira || a.textura ? B.Color3.White() : B.Color3.FromHexString(a.cor);
        m.specularColor = new B.Color3(a.brilho, a.brilho, a.brilho);
      });
      mats.corpo.diffuseColor = a.madeira ? new B.Color3(0.94, 0.94, 0.94) : B.Color3.FromHexString(a.cor).scale(0.97);
      mats.bancada.diffuseColor = B.Color3.FromHexString(a.bancada);
      mats.rodape.diffuseColor = B.Color3.FromHexString(a.cor).scale(a.madeira ? 0.55 : 0.8);
      mats.rodape.diffuseTexture = null;
    }

    // -------------------------------------------------------------
    // Ambiente (chão, paredes, aberturas, pontos técnicos)
    // -------------------------------------------------------------
    const raizSala = new B.TransformNode('sala', scene);
    const raizModulos = new B.TransformNode('modulos', scene);
    let paredes = [];
    let chaveSala = '';
    let dimSala = { W: 3.2, D: 2.4, H: 2.7 };

    function caixa(nome, w, h, d, pos, mat, pai) {
      const m = B.MeshBuilder.CreateBox(nome, { width: w, height: h, depth: d }, scene);
      m.position.copyFrom(pos);
      m.material = mat;
      m.parent = pai;
      return m;
    }

    // Nó alinhado com a face interior de uma parede:
    // x local corre da esquerda para a direita (visto de dentro), z local entra na parede.
    function noParede(parede, W, D, pai) {
      const no = new B.TransformNode('parede-' + parede, scene);
      no.parent = pai;
      if (parede === 'fundo') {
        no.position.set(-W / 2, 0, D / 2);
      } else if (parede === 'esquerda') {
        no.position.set(-W / 2, 0, -D / 2);
        no.rotation.y = -Math.PI / 2;
      } else if (parede === 'direita') {
        no.position.set(W / 2, 0, D / 2);
        no.rotation.y = Math.PI / 2;
      } else {
        no.position.set(W / 2, 0, -D / 2);
        no.rotation.y = Math.PI;
      }
      return no;
    }

    function construirSala(p) {
      raizSala.getChildren().slice().forEach((c) => c.dispose());
      paredes = [];
      const W = p.espaco.largura * CM;
      const D = p.espaco.profundidade * CM;
      const H = p.espaco.altura * CM;
      const t = 0.08;
      dimSala = { W, D, H };

      const chao = caixa('chao', W + 2 * t, 0.02, D + 2 * t, new B.Vector3(0, -0.01, 0), mats.chao, raizSala);
      mats.chao.diffuseTexture.uScale = (W + 2 * t) / 1.6;
      mats.chao.diffuseTexture.vScale = (D + 2 * t) / 1.6;
      chao.receiveShadows = true;
      chao.isPickable = false;

      const defs = [
        { id: 'fundo', w: W + 2 * t, d: t, pos: new B.Vector3(0, H / 2, D / 2 + t / 2), atras: (c) => c.z > D / 2 + t },
        { id: 'esquerda', w: t, d: D, pos: new B.Vector3(-W / 2 - t / 2, H / 2, 0), atras: (c) => c.x < -W / 2 - t },
        { id: 'direita', w: t, d: D, pos: new B.Vector3(W / 2 + t / 2, H / 2, 0), atras: (c) => c.x > W / 2 + t }
      ];
      defs.forEach((d) => {
        const mesh = caixa('parede-' + d.id, d.w, H, d.d, d.pos, mats.parede, raizSala);
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        paredes.push({ id: d.id, meshes: [mesh], atras: d.atras });
      });
      const porParede = (id) => paredes.find((w) => w.id === id);

      // janelas
      p.janelas.forEach((j) => {
        const no = noParede(j.parede, W, D, raizSala);
        const w = j.largura * CM;
        const h = j.altura * CM;
        const x = j.posicao * CM;
        const y = j.peitoril * CM + h / 2;
        const itens = [
          caixa('vidro', w - 0.08, h - 0.08, 0.01, new B.Vector3(x, y, -0.004), mats.vidroJanela, no),
          caixa('caixilho-s', w, 0.05, 0.06, new B.Vector3(x, y + h / 2 - 0.025, -0.03), mats.caixilho, no),
          caixa('caixilho-i', w + 0.06, 0.04, 0.12, new B.Vector3(x, y - h / 2 + 0.02, -0.06), mats.caixilho, no),
          caixa('caixilho-e', 0.05, h, 0.06, new B.Vector3(x - w / 2 + 0.025, y, -0.03), mats.caixilho, no),
          caixa('caixilho-d', 0.05, h, 0.06, new B.Vector3(x + w / 2 - 0.025, y, -0.03), mats.caixilho, no),
          caixa('caixilho-m', 0.03, h - 0.08, 0.04, new B.Vector3(x, y, -0.02), mats.caixilho, no)
        ];
        itens.forEach((m) => { m.isPickable = false; });
        const alvo = porParede(j.parede);
        if (alvo) alvo.meshes.push(...itens);
      });

      // porta de entrada
      p.portas.forEach((pt) => {
        if (pt.parede === 'frente') {
          const soleira = caixa('soleira', pt.largura * CM, 0.004, 0.1, new B.Vector3(W / 2 - pt.posicao * CM, 0.002, -D / 2 + 0.05), mats.portaEntrada, raizSala);
          soleira.isPickable = false;
          return;
        }
        const no = noParede(pt.parede, W, D, raizSala);
        const w = pt.largura * CM;
        const h = pt.altura * CM;
        const x = pt.posicao * CM;
        const itens = [
          caixa('porta-folha', w - 0.06, h - 0.03, 0.04, new B.Vector3(x, (h - 0.03) / 2, -0.02), mats.portaEntrada, no),
          caixa('porta-aro-e', 0.05, h, 0.07, new B.Vector3(x - w / 2, h / 2, -0.035), mats.caixilho, no),
          caixa('porta-aro-d', 0.05, h, 0.07, new B.Vector3(x + w / 2, h / 2, -0.035), mats.caixilho, no),
          caixa('porta-aro-s', w + 0.1, 0.05, 0.07, new B.Vector3(x, h, -0.035), mats.caixilho, no),
          caixa('porta-puxador', 0.12, 0.02, 0.03, new B.Vector3(x + w / 2 - 0.1, 1.05, -0.055), mats.metal, no)
        ];
        itens.forEach((m) => { m.isPickable = false; });
        const alvo = porParede(pt.parede);
        if (alvo) alvo.meshes.push(...itens);
      });

      // pontos técnicos
      const marcar = (lista, mat, forma) => {
        (lista || []).forEach((pt) => {
          const no = noParede(pt.parede || 'fundo', W, D, raizSala);
          const x = pt.posicao * CM;
          const y = pt.altura * CM;
          let itens;
          if (forma === 'tomada') {
            itens = [
              caixa('tomada', 0.08, 0.08, 0.01, new B.Vector3(x, y, -0.005), mats.eletrica, no),
              caixa('tomada-furo', 0.035, 0.035, 0.012, new B.Vector3(x, y, -0.006), mats.eletricaFuro, no)
            ];
          } else {
            const m = B.MeshBuilder.CreateCylinder('ponto', { diameter: 0.045, height: 0.04, tessellation: 16 }, scene);
            m.rotation.x = Math.PI / 2;
            m.position.set(x, y, -0.02);
            m.material = mat;
            m.parent = no;
            itens = [m];
          }
          itens.forEach((m) => { m.isPickable = false; });
          const alvo = porParede(pt.parede || 'fundo');
          if (alvo) alvo.meshes.push(...itens);
        });
      };
      marcar(p.pontos.agua, mats.agua, 'tubo');
      marcar(p.pontos.gas, mats.gas, 'tubo');
      marcar(p.pontos.eletrica, mats.eletrica, 'tomada');
    }

    // Paredes entre a câmera e o interior ficam quase transparentes
    scene.onBeforeRenderObservable.add(() => {
      const c = camera.position;
      paredes.forEach((w) => {
        const v = w.atras(c) ? 0.1 : 1;
        w.meshes.forEach((m) => { if (m.visibility !== v) m.visibility = v; });
      });
    });

    // -------------------------------------------------------------
    // Construção de módulos
    // -------------------------------------------------------------
    const registos = new Map(); // id → { root, chave }
    const aberturas = new Map(); // id → { portas:Set, gavetas:Set }

    function chaveGeometria(m, p) {
      return JSON.stringify([m.tipo, m.dimensoes, m.componentes, p.estilo, m.tipo === 'ilha' ? p.acabamento : '', p.preferencias.bancada]);
    }

    function Construtor(m, p) {
      const root = new B.TransformNode('modulo-' + m.id, scene);
      const estaticos = new Map(); // material → meshes (serão fundidos)
      const todos = [];
      const partes = { portas: [], gavetas: [] };
      const estilo = (C.ESTILOS[p.estilo] || C.ESTILOS.moderno).puxador;
      const meta = (extra) => Object.assign({ moduloId: m.id }, extra || {});

      function registar(mesh, mat, pai, extra) {
        mesh.material = mat;
        mesh.parent = pai || root;
        mesh.metadata = meta(extra);
        todos.push(mesh);
        if (!pai && !(extra && extra.movel)) {
          if (!estaticos.has(mat)) estaticos.set(mat, []);
          estaticos.get(mat).push(mesh);
        }
        return mesh;
      }

      const api = {
        root,
        partes,
        estilo,
        caixa(w, h, d, x, y, z, mat, pai, extra) {
          const mesh = B.MeshBuilder.CreateBox('p', { width: Math.max(0.001, w), height: Math.max(0.001, h), depth: Math.max(0.001, d) }, scene);
          mesh.position.set(x, y, z);
          return registar(mesh, mat, pai, extra);
        },
        cilindro(diam, alt, x, y, z, rot, mat, pai, extra) {
          const mesh = B.MeshBuilder.CreateCylinder('c', { diameter: diam, height: alt, tessellation: 18 }, scene);
          mesh.position.set(x, y, z);
          if (rot) mesh.rotation.copyFrom(rot);
          return registar(mesh, mat, pai, extra);
        },
        anel(diam, x, y, z, mat) {
          const mesh = B.MeshBuilder.CreateTorus('a', { diameter: diam, thickness: 0.006, tessellation: 28 }, scene);
          mesh.position.set(x, y, z);
          return registar(mesh, mat);
        },
        no(nome, x, y, z) {
          const n = new B.TransformNode(nome, scene);
          n.parent = root;
          n.position.set(x, y, z);
          return n;
        },
        finalizar() {
          estaticos.forEach((lista) => {
            if (lista.length < 2) return;
            const fundido = B.Mesh.MergeMeshes(lista, true, true);
            if (fundido) {
              fundido.parent = root;
              fundido.metadata = meta({ parte: 'corpo' });
              const i0 = todos.indexOf(lista[0]);
              lista.forEach((l) => { const i = todos.indexOf(l); if (i >= 0) todos.splice(i, 1); });
              todos.splice(Math.max(0, i0), 0, fundido);
            }
          });
          todos.forEach((mesh) => {
            if (mesh.isDisposed()) return;
            mesh.receiveShadows = true;
            if (mesh.material !== mats.led && mesh.material !== mats.vidroJanela) sombras.addShadowCaster(mesh, false);
            if (mesh.material === mats.led) brilho.addIncludedOnlyMesh(mesh);
          });
          root.metadata = { partes };
          return root;
        }
      };
      return api;
    }

    // ---- peças comuns --------------------------------------------------
    function puxador(k, pai, largura, altura, orient, posicao) {
      // orient: 'v' (vertical) | 'h' (horizontal); posicao em coordenadas do pai
      const estilo = k.estilo;
      if (estilo === 'gola') return;
      const mat = estilo === 'barra-preta' ? mats.metalEscuro : mats.metal;
      const z = -ESP_FRENTE / 2 - 0.012;
      if (estilo === 'botao') {
        k.cilindro(0.022, 0.024, posicao.x, posicao.y, z + 0.002, new B.Vector3(Math.PI / 2, 0, 0), mat, pai, { movel: true });
        return;
      }
      const comp = orient === 'v' ? Math.min(0.32, Math.max(0.1, altura * 0.35)) : Math.min(0.4, Math.max(0.1, largura * 0.45));
      if (orient === 'v') k.caixa(0.012, comp, 0.016, posicao.x, posicao.y, z, mat, pai, { movel: true });
      else k.caixa(comp, 0.012, 0.016, posicao.x, posicao.y, z, mat, pai, { movel: true });
    }

    // Porta de abrir: pivô na dobradiça, painel filho do pivô
    function porta(k, x0, x1, y0, y1, zFrente, dobradica, opcoes) {
      const o = opcoes || {};
      const w = x1 - x0 - FOLGA;
      const h = y1 - y0 - FOLGA;
      const yC = (y0 + y1) / 2;
      const pivX = dobradica === 'esq' ? x0 + FOLGA / 2 : x1 - FOLGA / 2;
      const pivo = k.no('porta', pivX, yC, zFrente);
      const sinal = dobradica === 'esq' ? 1 : -1;
      const idx = k.partes.portas.length;
      const alvo = 'porta:' + idx;
      const painel = k.caixa(w, h, ESP_FRENTE, (sinal * w) / 2, 0, 0, o.material || mats.frente, pivo, { parte: 'porta', indice: idx, alvo });
      if (!o.semArestas) {
        painel.enableEdgesRendering(0.95);
        painel.edgesWidth = 1.1;
        painel.edgesColor = new B.Color4(0, 0, 0, 0.22);
      }
      if (o.espelho) k.caixa(w * 0.8, h * 0.78, 0.004, (sinal * w) / 2, 0, -ESP_FRENTE / 2 - 0.003, mats.espelho, pivo, { parte: 'porta', indice: idx, alvo });
      if (!o.semPuxador) {
        const px = sinal * (w - 0.045);
        const py = o.puxadorY !== undefined ? o.puxadorY - yC : 0;
        puxador(k, pivo, w, h, 'v', { x: px, y: py });
      }
      k.partes.portas.push({ no: pivo, prop: 'rotation.y', fechado: 0, aberto: sinal * 1.75 });
    }

    // Porta basculante (máquina de loiça, forno)
    function portaBasculante(k, x0, x1, y0, y1, zFrente, mat, puxadorTopo) {
      const w = x1 - x0 - FOLGA;
      const h = y1 - y0 - FOLGA;
      const pivo = k.no('basculante', (x0 + x1) / 2, y0 + FOLGA / 2, zFrente);
      const idx = k.partes.portas.length;
      const alvo = 'porta:' + idx;
      const painel = k.caixa(w, h, ESP_FRENTE, 0, h / 2, 0, mat || mats.frente, pivo, { parte: 'porta', indice: idx, alvo });
      painel.enableEdgesRendering(0.95);
      painel.edgesWidth = 1.1;
      painel.edgesColor = new B.Color4(0, 0, 0, 0.22);
      if (puxadorTopo !== false) {
        const mat2 = k.estilo === 'barra-preta' ? mats.metalEscuro : mats.metal;
        k.caixa(Math.min(0.45, w * 0.7), 0.014, 0.018, 0, h - 0.05, -ESP_FRENTE / 2 - 0.012, mat === mats.vidroPreto ? mats.inox : mat2, pivo, { movel: true });
      }
      k.partes.portas.push({ no: pivo, prop: 'rotation.x', fechado: 0, aberto: -1.35 });
      return { pivo, w, h };
    }

    // Gaveta: frente + caixa interior, tudo num nó que desliza em z
    function gaveta(k, x0, x1, y0, y1, zFrente, profundidade, opcoes) {
      const o = opcoes || {};
      const w = x1 - x0 - FOLGA;
      const h = y1 - y0 - FOLGA;
      const no = k.no('gaveta', (x0 + x1) / 2, (y0 + y1) / 2, zFrente);
      const idx = k.partes.gavetas.length;
      const alvo = 'gaveta:' + idx;
      const extra = { parte: 'gaveta', indice: idx, alvo };
      const frente = k.caixa(w, h, ESP_FRENTE, 0, 0, 0, o.material || mats.frente, no, extra);
      frente.enableEdgesRendering(0.95);
      frente.edgesWidth = 1.1;
      frente.edgesColor = new B.Color4(0, 0, 0, 0.22);
      const prof = Math.max(0.2, profundidade - 0.08);
      const wi = Math.max(0.1, w - 0.07);
      const hi = Math.max(0.05, h - 0.05);
      const zc = ESP_FRENTE / 2 + prof / 2;
      k.caixa(wi, 0.012, prof, 0, -hi / 2, zc, mats.interior, no, extra);
      k.caixa(0.012, hi, prof, -wi / 2, 0, zc, mats.interior, no, extra);
      k.caixa(0.012, hi, prof, wi / 2, 0, zc, mats.interior, no, extra);
      k.caixa(wi, hi, 0.012, 0, 0, zc + prof / 2, mats.interior, no, extra);
      if (!o.semPuxador) puxador(k, no, w, h, 'h', { x: 0, y: k.estilo === 'botao' ? 0 : h / 2 - Math.min(0.045, h * 0.25) });
      k.partes.gavetas.push({ no, prop: 'position.z', fechado: zFrente, aberto: zFrente - Math.min(0.45, profundidade * 0.72) });
    }

    // Caixa do móvel (laterais, base, tampo, fundo) + rodapé recuado
    function carcaca(k, w, h, d, rodape, opcoes) {
      const o = opcoes || {};
      const yb = rodape;
      const hc = h - rodape;
      k.caixa(ESP, hc, d, -w / 2 + ESP / 2, yb + hc / 2, 0, mats.corpo);
      k.caixa(ESP, hc, d, w / 2 - ESP / 2, yb + hc / 2, 0, mats.corpo);
      k.caixa(w - 2 * ESP, ESP, d - 0.004, 0, yb + ESP / 2, 0.002, mats.interior);
      if (!o.semTampo) k.caixa(w - 2 * ESP, ESP, d - 0.004, 0, h - ESP / 2, 0.002, o.tampoVisivel ? mats.corpo : mats.interior);
      k.caixa(w - 2 * ESP, hc - 2 * ESP, 0.006, 0, yb + hc / 2, d / 2 - 0.003, mats.interior);
      if (rodape > 0) k.caixa(w - 0.004, rodape - 0.002, ESP, 0, rodape / 2, -d / 2 + 0.05, mats.rodape);
    }

    function prateleiras(k, n, w, d, y0, y1, mat) {
      for (let i = 1; i <= n; i += 1) {
        const y = y0 + ((y1 - y0) * i) / (n + 1);
        k.caixa(w - 2 * ESP - 0.002, ESP, d - 0.03, 0, y, 0.01, mat || mats.interior);
      }
    }

    function bancada(k, w, d, h, opcoes) {
      const o = opcoes || {};
      k.caixa(w + (o.extraX || 0), 0.04, d + 0.02 + (o.extraZ || 0), o.deslocX || 0, h + 0.02, -0.01 + (o.deslocZ || 0), mats.bancada);
    }

    // Distribui portas numa zona (1 ou 2 folhas)
    function portasZona(k, n, w, y0, y1, zF, opcoes) {
      if (n <= 0) return;
      const x0 = -w / 2;
      const x1 = w / 2;
      if (n === 1) porta(k, x0, x1, y0, y1, zF, 'esq', opcoes);
      else {
        porta(k, x0, 0, y0, y1, zF, 'esq', opcoes);
        porta(k, 0, x1, y0, y1, zF, 'dir', Object.assign({}, opcoes, { espelho: false }));
      }
    }

    function gavetasZona(k, n, w, y0, y1, zF, d, pesoTopo) {
      if (n <= 0) return;
      const pesos = Array.from({ length: n }, (_, i) => (i === n - 1 && n > 2 && pesoTopo ? 0.7 : 1));
      const total = pesos.reduce((a, b) => a + b, 0);
      let y = y0;
      pesos.forEach((pz) => {
        const h = ((y1 - y0) * pz) / total;
        gaveta(k, -w / 2, w / 2, y, y + h, zF, d);
        y += h;
      });
    }

    // ---- construtores por tipo ------------------------------------------
    function armarioBase(k, m, p, extras) {
      const w = m.dimensoes.largura * CM;
      const h = m.dimensoes.altura * CM;
      const d = m.dimensoes.profundidade * CM;
      const c = m.componentes;
      const r = 0.1;
      const zF = -d / 2 - ESP_FRENTE / 2;
      carcaca(k, w, h, d, r);
      const y0 = r + 0.002;
      const y1 = h - 0.002;

      if (m.tipo === 'forno') {
        const yF = y1 - 0.6;
        const f = portaBasculante(k, -w / 2, w / 2, yF, y1, zF, mats.vidroPreto, true);
        k.caixa(f.w, 0.06, 0.004, 0, f.h - 0.03, -ESP_FRENTE / 2 - 0.002, mats.inox, f.pivo, { movel: true });
        k.caixa(w - 2 * ESP - 0.01, 0.56, d - 0.06, 0, yF + 0.3, 0.02, mats.metalEscuro);
        gavetasZona(k, Math.max(1, c.gavetas || 1), w, y0, yF, zF, d);
      } else if (m.tipo === 'lava-loica') {
        k.caixa(w - 2 * ESP - 0.01, y1 - y0 - 0.04, d - 0.06, 0, (y0 + y1) / 2, 0.02, mats.inox);
        portaBasculante(k, -w / 2, w / 2, y0, y1, zF, mats.frente, true);
      } else {
        const nG = c.gavetas || 0;
        const nP = c.portas || 0;
        if (nG > 0 && nP > 0) {
          const hG = 0.16;
          const yCorte = y1 - nG * hG;
          gavetasZona(k, nG, w, yCorte, y1, zF, d);
          portasZona(k, nP, w, y0, yCorte, zF, { puxadorY: yCorte - 0.06 });
          prateleiras(k, Math.min(c.prateleiras || 0, 2), w, d, y0, yCorte);
        } else if (nG > 0) {
          gavetasZona(k, nG, w, y0, y1, zF, d, true);
        } else if (nP > 0) {
          portasZona(k, nP, w, y0, y1, zF, { puxadorY: y1 - 0.08 });
          prateleiras(k, c.prateleiras || 0, w, d, y0, y1);
        } else {
          prateleiras(k, c.prateleiras || 0, w, d, y0, y1);
        }
      }

      if (p.preferencias.bancada !== false && !(extras && extras.semBancada)) bancada(k, w, d, h);

      // pia: cuba + torneira
      if (c.pia) {
        const ws = Math.min(0.62, w - 0.16);
        const topo = h + 0.04;
        k.caixa(ws, 0.006, 0.44, 0, topo + 0.003, -0.02, mats.inox);
        k.caixa(ws - 0.05, 0.004, 0.38, 0, topo + 0.0065, -0.02, mats.cuba);
        k.cilindro(0.028, 0.02, 0, topo + 0.01, d / 2 - 0.09, null, mats.inox);
        k.cilindro(0.022, 0.3, 0, topo + 0.16, d / 2 - 0.09, null, mats.inox);
        k.cilindro(0.018, 0.2, 0, topo + 0.3, d / 2 - 0.19, new B.Vector3(Math.PI / 2, 0, 0), mats.inox);
      }
      // placa
      if (c.placa) {
        const topo = h + 0.04;
        const wp = Math.min(0.58, w - 0.04);
        k.caixa(wp, 0.006, 0.5, 0, topo + 0.003, -0.02, mats.vidroPreto);
        const pontos = [[-0.13, -0.12], [0.13, -0.12], [-0.13, 0.1], [0.13, 0.1]];
        pontos.forEach(([dx, dz], i) => {
          if (c.placa === 'gas') {
            k.cilindro(i === 0 ? 0.11 : 0.08, 0.02, dx * (wp / 0.58), topo + 0.016, dz - 0.02, null, mats.metalEscuro);
            k.caixa(0.16, 0.008, 0.012, dx * (wp / 0.58), topo + 0.028, dz - 0.02, mats.metalEscuro);
          } else {
            k.anel(i === 0 ? 0.2 : 0.16, dx * (wp / 0.58), topo + 0.007, dz - 0.02, mats.metal);
          }
        });
      }
    }

    function armarioSuperior(k, m) {
      const w = m.dimensoes.largura * CM;
      const h = m.dimensoes.altura * CM;
      const d = m.dimensoes.profundidade * CM;
      const c = m.componentes;
      const zF = -d / 2 - ESP_FRENTE / 2;
      carcaca(k, w, h, d, 0, { tampoVisivel: true });
      let y0 = 0.002;
      if (c.exaustor) {
        const hv = 0.07;
        k.caixa(w - 0.004, hv, d + 0.02, 0, hv / 2, -0.01, mats.inox);
        k.caixa(w * 0.6, 0.004, d * 0.6, 0, -0.001, 0, mats.metalEscuro);
        y0 = hv + 0.002;
      }
      portasZona(k, c.portas || 1, w, y0, h - 0.002, zF, { puxadorY: y0 + 0.07 });
      prateleiras(k, c.prateleiras || 0, w, d, y0, h);
      if (c.led) k.caixa(w - 0.06, 0.008, 0.02, 0, -0.004, -d / 2 + 0.05, mats.led);
    }

    function coluna(k, m, p) {
      const w = m.dimensoes.largura * CM;
      const h = m.dimensoes.altura * CM;
      const d = m.dimensoes.profundidade * CM;
      const c = m.componentes;
      const r = 0.1;
      const zF = -d / 2 - ESP_FRENTE / 2;
      const inox = p.estilo === 'industrial';
      carcaca(k, w, h, d, r, { tampoVisivel: true });
      const y0 = r + 0.002;
      const y1 = h - 0.002;

      if (m.tipo === 'frigorifico') {
        const corte = Math.min(y1 - 0.4, 0.82);
        const matF = inox ? mats.inox : mats.frente;
        k.caixa(w - 2 * ESP - 0.004, y1 - y0 - 0.02, d - 0.05, 0, (y0 + y1) / 2, 0.015, mats.interiorFrio);
        [0.35, 0.6, 0.85].forEach((f) => {
          const y = corte + (y1 - corte) * f;
          k.caixa(w - 2 * ESP - 0.02, 0.006, d - 0.12, 0, y, 0.03, mats.prateleiraVidro);
        });
        porta(k, -w / 2, w / 2, y0, corte, zF, 'dir', { material: matF, puxadorY: corte - 0.2 });
        porta(k, -w / 2, w / 2, corte, y1, zF, 'dir', { material: matF, puxadorY: corte + 0.25 });
        return;
      }
      if (m.tipo === 'coluna-forno') {
        const yG = Math.min(0.75, y0 + 0.6);
        gavetasZona(k, Math.max(1, c.gavetas || 2), w, y0, yG, zF, d);
        const yForno = yG + 0.6;
        const f = portaBasculante(k, -w / 2, w / 2, yG, yForno, zF, mats.vidroPreto, true);
        k.caixa(f.w, 0.06, 0.004, 0, f.h - 0.03, -ESP_FRENTE / 2 - 0.002, mats.inox, f.pivo, { movel: true });
        k.caixa(w - 2 * ESP - 0.01, 0.56, d - 0.06, 0, yG + 0.3, 0.02, mats.metalEscuro);
        let yM = yForno;
        if (c.microondas && y1 - yForno > 0.5) {
          yM = yForno + 0.4;
          k.caixa(w - 0.01, 0.4 - FOLGA, ESP_FRENTE, 0, yForno + 0.2, zF, mats.vidroPreto);
          k.caixa(0.08, 0.3, 0.004, w / 2 - 0.07, yForno + 0.2, zF - ESP_FRENTE / 2 - 0.002, mats.inox);
        }
        if (y1 - yM > 0.15) portasZona(k, 1, w, yM, y1, zF, { puxadorY: yM + 0.07 });
        return;
      }
      // despenseiro
      const corte = Math.min(y1 - 0.3, 1.35);
      const nP = Math.max(1, c.portas || 2);
      if (nP >= 2) {
        portasZona(k, w > 0.6 ? 2 : 1, w, y0, corte, zF, { puxadorY: corte - 0.15 });
        portasZona(k, w > 0.6 ? 2 : 1, w, corte, y1, zF, { puxadorY: corte + 0.15 });
      } else {
        portasZona(k, 1, w, y0, y1, zF, { puxadorY: 1.0 });
      }
      prateleiras(k, c.prateleiras || 0, w, d, y0, y1);
    }

    function ilha(k, m, p) {
      const w = m.dimensoes.largura * CM;
      const h = m.dimensoes.altura * CM;
      const d = m.dimensoes.profundidade * CM;
      const c = m.componentes;
      const balanco = 0.3;
      const dc = d - balanco; // corpo sob a bancada
      const r = 0.1;
      const zCorpo = -d / 2 + dc / 2;
      const zF = zCorpo - dc / 2 - ESP_FRENTE / 2;
      k.caixa(ESP, h - r, dc, -w / 2 + ESP / 2, r + (h - r) / 2, zCorpo, mats.corpo);
      k.caixa(ESP, h - r, dc, w / 2 - ESP / 2, r + (h - r) / 2, zCorpo, mats.corpo);
      k.caixa(w - 2 * ESP, ESP, dc, 0, r + ESP / 2, zCorpo, mats.interior);
      k.caixa(w, h - r, ESP, 0, r + (h - r) / 2, zCorpo + dc / 2 - ESP / 2, mats.corpo);
      k.caixa(w - 0.004, r - 0.002, ESP, 0, r / 2, zCorpo - dc / 2 + 0.05, mats.rodape);

      const seccoes = Math.max(1, Math.round(w / 0.6));
      const ws = w / seccoes;
      let gavetasRest = c.gavetas || 0;
      for (let i = 0; i < seccoes; i += 1) {
        const x0 = -w / 2 + ws * i;
        const x1 = x0 + ws;
        const n = Math.min(4, gavetasRest);
        if (n > 0) {
          let y = r + 0.002;
          const hg = (h - 0.004 - r) / n;
          for (let g = 0; g < n; g += 1) {
            gaveta(k, x0, x1, y, y + hg, zF, dc);
            y += hg;
          }
          gavetasRest -= n;
        } else {
          porta(k, x0, x1, r + 0.002, h - 0.002, zF, i % 2 ? 'dir' : 'esq', { puxadorY: h - 0.08 });
        }
      }
      // bancada com balanço para bancos; laterais em cascata no estilo moderno
      const cascata = ['moderno', 'minimalista', 'contemporaneo'].includes(p.estilo);
      k.caixa(w + (cascata ? 0.08 : 0.04), 0.04, d + 0.02, 0, h + 0.02, 0, mats.bancada);
      if (cascata) {
        k.caixa(0.04, h, d + 0.02, -w / 2 - 0.02, h / 2, 0, mats.bancada);
        k.caixa(0.04, h, d + 0.02, w / 2 + 0.02, h / 2, 0, mats.bancada);
      } else {
        k.caixa(0.06, h, 0.06, -w / 2 + 0.05, h / 2, d / 2 - 0.05, mats.corpo);
        k.caixa(0.06, h, 0.06, w / 2 - 0.05, h / 2, d / 2 - 0.05, mats.corpo);
      }
    }

    function roupeiro(k, m) {
      const w = m.dimensoes.largura * CM;
      const h = m.dimensoes.altura * CM;
      const d = m.dimensoes.profundidade * CM;
      const c = m.componentes;
      const L = C.layoutRoupeiro(m);
      const r = C.ROUPEIRO.rodape * CM;
      carcaca(k, w, h, d, r, { tampoVisivel: true });
      const wi = w - 2 * ESP;
      const zIntFrente = -d / 2 + 0.035;

      L.prateleiras.forEach((ycm) => k.caixa(wi - 0.002, ESP, d - 0.03, 0, ycm * CM + ESP / 2, 0.01, mats.interior));

      // gavetas interiores (recuadas, atrás das portas)
      L.gavetas.forEach((g) => gaveta(k, -wi / 2, wi / 2, g.y0 * CM, g.y1 * CM, zIntFrente, d - 0.05));

      // sapateira: prateleiras inclinadas com rebordo
      if (L.sapateira) {
        const n = 3;
        const hz = ((L.sapateira.y1 - L.sapateira.y0) * CM) / n;
        for (let i = 0; i < n; i += 1) {
          const y = L.sapateira.y0 * CM + hz * (i + 0.45);
          const prat = k.caixa(wi - 0.004, 0.012, d - 0.12, 0, y, 0.02, mats.interior);
          prat.rotation.x = -0.28;
          k.caixa(wi - 0.004, 0.03, 0.012, 0, y - 0.03, -d / 2 + 0.1, mats.metal);
        }
      }

      // varões + roupa pendurada (mostra a função quando as portas abrem)
      L.varoes.forEach((v, iv) => {
        const y = v.y * CM;
        k.cilindro(0.025, wi - 0.004, 0, y, 0.02, new B.Vector3(0, 0, Math.PI / 2), mats.metal);
        const queda = Math.max(0.5, Math.min(1.1, v.queda * CM));
        const n = Math.max(2, Math.min(8, Math.floor(wi / 0.1)));
        for (let i = 0; i < n; i += 1) {
          const x = -wi / 2 + 0.05 + ((wi - 0.1) * (i + 0.5)) / n;
          const alt = queda * (0.72 + ((i * 37 + iv * 11) % 5) * 0.06);
          k.caixa(0.035, alt, d * 0.7, x, y - 0.03 - alt / 2, 0.02, matsRoupa[(i + iv) % matsRoupa.length]);
        }
      });

      if (c.led) {
        const yLed = (L.varoes[0] ? L.varoes[0].y + 5 : L.maleiro || m.dimensoes.altura - 4) * CM;
        k.caixa(wi - 0.04, 0.008, 0.015, 0, yLed, -d / 2 + 0.06, mats.led);
      }

      // portas
      const zF = -d / 2 - ESP_FRENTE / 2;
      const y0 = r + 0.002;
      const y1 = h - 0.002;
      if (c.tipoPorta === 'correr') {
        const trilho = c.trilho ? -0.028 : 0;
        const no = k.no('correr', 0, (y0 + y1) / 2, zF + trilho - 0.004);
        const idx = k.partes.portas.length;
        const extra = { parte: 'porta', indice: idx, alvo: 'porta:' + idx };
        const painel = k.caixa(w + 0.01, y1 - y0, ESP_FRENTE, 0, 0, 0, mats.frente, no, extra);
        painel.enableEdgesRendering(0.95);
        painel.edgesWidth = 1.1;
        painel.edgesColor = new B.Color4(0, 0, 0, 0.22);
        if (c.espelho) k.caixa(w * 0.78, (y1 - y0) * 0.8, 0.004, 0, 0, -ESP_FRENTE / 2 - 0.003, mats.espelho, no, extra);
        k.caixa(0.012, 0.35, 0.01, w / 2 - 0.04, 0, -ESP_FRENTE / 2 - 0.006, k.estilo === 'barra-preta' ? mats.metalEscuro : mats.metal, no, { movel: true });
        k.partes.portas.push({ no, prop: 'position.x', fechado: 0, aberto: null, correr: w * 0.92 });
        // calhas
        k.caixa(w, 0.012, 0.07, 0, h - 0.006, -d / 2 - 0.035, mats.metal);
      } else if (c.tipoPorta !== 'nenhuma' && (c.portas || 0) > 0) {
        const yM = L.maleiro !== null ? L.maleiro * CM : null;
        const opc = { espelho: c.espelho, puxadorY: 1.05 };
        if (yM && y1 - yM > 0.2) {
          portasZona(k, c.portas, w, y0, yM, zF, opc);
          portasZona(k, c.portas, w, yM, y1, zF, { puxadorY: yM + 0.08 });
        } else {
          portasZona(k, c.portas, w, y0, y1, zF, opc);
        }
      }
    }

    function movelGenerico(k, m) {
      const w = m.dimensoes.largura * CM;
      const h = m.dimensoes.altura * CM;
      const d = m.dimensoes.profundidade * CM;
      const c = m.componentes;
      const zF = -d / 2 - ESP_FRENTE / 2;

      if (m.tipo === 'secretaria') {
        const tampo = 0.03;
        k.caixa(w, tampo, d, 0, h - tampo / 2, 0, mats.corpo);
        k.caixa(ESP * 1.5, h - tampo, d - 0.04, -w / 2 + ESP, (h - tampo) / 2, 0, mats.corpo);
        const wp = Math.min(0.42, w * 0.35);
        const xp = w / 2 - wp / 2;
        k.caixa(ESP, h - tampo, d - 0.04, w / 2 - ESP / 2, (h - tampo) / 2, 0, mats.corpo);
        k.caixa(ESP, h - tampo, d - 0.04, w / 2 - wp + ESP / 2, (h - tampo) / 2, 0, mats.corpo);
        k.caixa(wp, h - tampo - 0.02, 0.006, xp, (h - tampo) / 2, d / 2 - 0.02, mats.interior);
        let y = 0.04;
        const n = Math.max(1, c.gavetas || 3);
        const hg = (h - tampo - 0.05) / n;
        for (let i = 0; i < n; i += 1) {
          gaveta(k, w / 2 - wp + ESP, w / 2 - ESP, y, y + hg, zF + 0.02, d - 0.06);
          y += hg;
        }
        return;
      }

      const rodape = m.tipo === 'mesa-cabeceira' || m.tipo === 'aparador' ? 0.06 : m.tipo === 'estante' ? 0.05 : 0.08;
      carcaca(k, w, h, d, rodape, { tampoVisivel: true });
      const y0 = rodape + 0.002;
      const y1 = h - 0.002;
      if (m.tipo === 'movel-tv') {
        // gavetas à esquerda e à direita, nicho aberto ao centro
        const n = Math.max(1, c.gavetas || 2);
        const esquerda = Math.ceil(n / 2);
        const wg = w / (n + 1);
        const nicho0 = -w / 2 + esquerda * wg;
        for (let i = 0; i < n; i += 1) {
          const x0 = i < esquerda ? -w / 2 + i * wg : nicho0 + wg + (i - esquerda) * wg;
          gaveta(k, x0, x0 + wg, y0, y1, zF, d);
        }
        k.caixa(ESP, y1 - y0, d - 0.02, nicho0, (y0 + y1) / 2, 0, mats.corpo);
        k.caixa(ESP, y1 - y0, d - 0.02, nicho0 + wg, (y0 + y1) / 2, 0, mats.corpo);
        return;
      }
      if (m.tipo === 'estante') {
        prateleiras(k, c.prateleiras || 4, w, d, y0, y1);
        if (c.led) k.caixa(w - 0.06, 0.008, 0.015, 0, y1 - 0.03, -d / 2 + 0.04, mats.led);
        return;
      }
      if ((c.gavetas || 0) > 0 && !(c.portas > 0)) {
        gavetasZona(k, c.gavetas, w, y0, y1, zF, d);
        return;
      }
      if ((c.gavetas || 0) > 0) {
        const corte = y1 - c.gavetas * 0.16;
        gavetasZona(k, c.gavetas, w, corte, y1, zF, d);
        portasZona(k, c.portas, w, y0, corte, zF, { puxadorY: corte - 0.06 });
      } else {
        portasZona(k, c.portas || 1, w, y0, y1, zF, { puxadorY: y1 - 0.08 });
      }
      prateleiras(k, c.prateleiras || 0, w, d, y0, y1);
    }

    function construirModulo(m, p) {
      const k = Construtor(m, p);
      switch (m.tipo) {
        case 'inferior':
        case 'gaveteiro':
        case 'pia':
        case 'forno':
        case 'lava-loica':
          armarioBase(k, m, p);
          break;
        case 'superior':
        case 'exaustor':
          armarioSuperior(k, m);
          break;
        case 'coluna':
        case 'coluna-forno':
        case 'frigorifico':
          coluna(k, m, p);
          break;
        case 'ilha':
          ilha(k, m, p);
          break;
        case 'roupeiro':
          roupeiro(k, m);
          break;
        default:
          movelGenerico(k, m);
      }
      const root = k.finalizar();
      root.parent = raizModulos;
      return root;
    }

    // -------------------------------------------------------------
    // Seleção
    // -------------------------------------------------------------
    let selecao = null; // { id, chave, meshes }
    function limparSelecao() {
      if (selecao) selecao.meshes.forEach((m) => m.dispose());
      selecao = null;
    }

    function atualizarSelecao(p) {
      const id = p.selecionado;
      const reg = id ? registos.get(id) : null;
      if (!reg) {
        limparSelecao();
        return;
      }
      if (selecao && selecao.id === id && selecao.chave === reg.chave && selecao.root === reg.root) return;
      limparSelecao();
      const m = p.modulos.find((o) => o.id === id);
      const w = m.dimensoes.largura * CM + 0.02;
      const d = m.dimensoes.profundidade * CM + 0.04;
      const temBancada = ['inferior', 'gaveteiro', 'pia', 'forno', 'lava-loica', 'ilha'].includes(m.tipo);
      const h = m.dimensoes.altura * CM + (temBancada ? 0.05 : 0.01);
      const y0 = -0.005;
      const zc = -0.01;
      const cantos = [
        [-w / 2, y0, zc - d / 2], [w / 2, y0, zc - d / 2], [w / 2, y0, zc + d / 2], [-w / 2, y0, zc + d / 2],
        [-w / 2, y0 + h, zc - d / 2], [w / 2, y0 + h, zc - d / 2], [w / 2, y0 + h, zc + d / 2], [-w / 2, y0 + h, zc + d / 2]
      ].map((c) => new B.Vector3(c[0], c[1], c[2]));
      const arestas = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      const linhas = B.MeshBuilder.CreateLineSystem('selecao', { lines: arestas.map(([a, b]) => [cantos[a], cantos[b]]) }, scene);
      linhas.color = new B.Color3(0.76, 0.58, 0.35);
      linhas.alpha = 0.95;
      linhas.parent = reg.root;
      linhas.isPickable = false;
      linhas.renderingGroupId = 1;
      const meshes = [linhas];
      if ((m.posicao.y || 0) < 1) {
        const base = B.MeshBuilder.CreateGround('selecao-base', { width: w + 0.04, height: d + 0.04 }, scene);
        base.position.set(0, 0.003 - (m.posicao.y || 0) * CM, zc);
        base.material = mats.selecao;
        base.parent = reg.root;
        base.isPickable = false;
        meshes.push(base);
      }
      selecao = { id, chave: reg.chave, root: reg.root, meshes };
    }

    // -------------------------------------------------------------
    // Portas e gavetas (animação)
    // -------------------------------------------------------------
    const suave = new B.CubicEase();
    suave.setEasingMode(B.EasingFunction.EASINGMODE_EASEINOUT);

    function valorAberto(reg, parte) {
      if (parte.correr) {
        const x = reg.root.position.x;
        const dir = x > 0.01 ? -1 : 1;
        return parte.fechado + dir * parte.correr;
      }
      return parte.aberto;
    }

    function definirParte(reg, parte, aberta, animar) {
      const prop = parte.prop;
      const alvo = aberta ? valorAberto(reg, parte) : parte.fechado;
      const [a, b] = prop.split('.');
      const atual = parte.no[a][b];
      if (!animar) {
        parte.no[a][b] = alvo;
        return;
      }
      B.Animation.CreateAndStartAnimation('anim', parte.no, prop, 60, 24, atual, alvo, B.Animation.ANIMATIONLOOPMODE_CONSTANT, suave);
    }

    function estadoAberto(id) {
      if (!aberturas.has(id)) aberturas.set(id, { portas: new Set(), gavetas: new Set() });
      return aberturas.get(id);
    }

    function alternar(id, tipo, indice, forcar) {
      const reg = registos.get(id);
      if (!reg) return;
      const partes = reg.root.metadata.partes[tipo];
      const parte = partes[indice];
      if (!parte) return;
      const est = estadoAberto(id)[tipo];
      const abrir = forcar !== undefined ? forcar : !est.has(indice);
      if (abrir) est.add(indice); else est.delete(indice);
      definirParte(reg, parte, abrir, true);
      // num roupeiro, as gavetas interiores só abrem com as portas abertas
      if (tipo === 'gavetas' && abrir && reg.tipo === 'roupeiro') {
        reg.root.metadata.partes.portas.forEach((_, i) => {
          if (!estadoAberto(id).portas.has(i)) alternar(id, 'portas', i, true);
        });
      }
    }

    function alternarTodas(id, tipo, forcar) {
      const reg = registos.get(id);
      if (!reg) return false;
      const partes = reg.root.metadata.partes[tipo];
      if (!partes.length) return false;
      const est = estadoAberto(id)[tipo];
      const abrir = forcar !== undefined ? forcar : est.size < partes.length;
      partes.forEach((_, i) => alternar(id, tipo, i, abrir));
      return true;
    }

    function reaplicarAberturas(id) {
      const reg = registos.get(id);
      const est = aberturas.get(id);
      if (!reg || !est) return;
      ['portas', 'gavetas'].forEach((tipo) => {
        const partes = reg.root.metadata.partes[tipo];
        Array.from(est[tipo]).forEach((i) => {
          if (partes[i]) definirParte(reg, partes[i], true, false);
          else est[tipo].delete(i);
        });
      });
    }

    // -------------------------------------------------------------
    // Renderização incremental do projeto
    // -------------------------------------------------------------
    let projetoAtual = null;

    function render(p) {
      projetoAtual = p;
      const cs = JSON.stringify([p.espaco, p.janelas, p.portas, p.pontos]);
      if (cs !== chaveSala) {
        construirSala(p);
        chaveSala = cs;
      }
      aplicarAcabamento(p);

      const vivos = new Set();
      p.modulos.forEach((m) => {
        vivos.add(m.id);
        const chave = chaveGeometria(m, p);
        let reg = registos.get(m.id);
        if (!reg || reg.chave !== chave) {
          if (reg) reg.root.dispose();
          reg = { root: construirModulo(m, p), chave, tipo: m.tipo };
          registos.set(m.id, reg);
          reaplicarAberturas(m.id);
        }
        reg.root.position.set(m.posicao.x * CM, (m.posicao.y || 0) * CM, m.posicao.z * CM);
        reg.root.rotation.y = ((m.rotacao || 0) * Math.PI) / 180;
      });
      registos.forEach((reg, id) => {
        if (!vivos.has(id)) {
          reg.root.dispose();
          registos.delete(id);
          aberturas.delete(id);
        }
      });
      atualizarSelecao(p);
    }

    // -------------------------------------------------------------
    // Interação: selecionar, arrastar, duplo clique
    // -------------------------------------------------------------
    let arrasto = null;
    let cliqueVazio = null;
    let ultimoToque = { t: 0, alvo: null, id: null };
    let ultimoHover = 0;

    function pickModulo() {
      return scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh.isPickable && mesh.isEnabled() && mesh.metadata && mesh.metadata.moduloId && mesh.visibility > 0.5);
    }

    scene.onPrePointerObservable.add((info) => {
      const ev = info.event;
      const T = B.PointerEventTypes;
      if (info.type === T.POINTERDOWN) {
        if (ev.button !== 0) return;
        const pick = pickModulo();
        if (pick && pick.hit) {
          const meta = pick.pickedMesh.metadata;
          const id = meta.moduloId;
          const agora = performance.now();
          if (meta.alvo && ultimoToque.alvo === meta.alvo && ultimoToque.id === id && agora - ultimoToque.t < 380) {
            const [tipo, indice] = meta.alvo.split(':');
            alternar(id, tipo === 'porta' ? 'portas' : 'gavetas', Number(indice));
            ultimoToque = { t: 0, alvo: null, id: null };
            info.skipOnPointerObservable = true;
            return;
          }
          ultimoToque = { t: agora, alvo: meta.alvo || null, id };
          if (cb.onSelect) cb.onSelect(id);
          const m = projetoAtual && projetoAtual.modulos.find((o) => o.id === id);
          if (m) {
            arrasto = {
              id,
              planoY: pick.pickedPoint.y,
              inicio: pick.pickedPoint.clone(),
              pos0: { x: m.posicao.x, z: m.posicao.z },
              px: scene.pointerX,
              py: scene.pointerY,
              movido: false,
              ultima: null
            };
          }
          info.skipOnPointerObservable = true;
        } else {
          cliqueVazio = { x: scene.pointerX, y: scene.pointerY };
        }
      } else if (info.type === T.POINTERMOVE) {
        if (arrasto) {
          if (!arrasto.movido && Math.hypot(scene.pointerX - arrasto.px, scene.pointerY - arrasto.py) < 5) {
            info.skipOnPointerObservable = true;
            return;
          }
          arrasto.movido = true;
          canvas.style.cursor = 'grabbing';
          const raio = scene.createPickingRay(scene.pointerX, scene.pointerY, B.Matrix.Identity(), camera);
          const plano = new B.Plane(0, 1, 0, -arrasto.planoY);
          const dist = raio.intersectsPlane(plano);
          if (dist !== null && dist !== undefined && dist < 200) {
            const ponto = raio.origin.add(raio.direction.scale(dist));
            const nx = arrasto.pos0.x + (ponto.x - arrasto.inicio.x) / CM;
            const nz = arrasto.pos0.z + (ponto.z - arrasto.inicio.z) / CM;
            const r = cb.restringir ? cb.restringir(arrasto.id, nx, nz) : { x: nx, z: nz, valido: true };
            if (r.valido) {
              arrasto.ultima = r;
              const reg = registos.get(arrasto.id);
              if (reg) {
                reg.root.position.x = r.x * CM;
                reg.root.position.z = r.z * CM;
              }
            }
          }
          info.skipOnPointerObservable = true;
        } else {
          const agora = performance.now();
          if (agora - ultimoHover > 70) {
            ultimoHover = agora;
            const pick = pickModulo();
            canvas.style.cursor = pick && pick.hit ? 'grab' : '';
          }
        }
      } else if (info.type === T.POINTERUP) {
        if (arrasto) {
          const a = arrasto;
          arrasto = null;
          canvas.style.cursor = '';
          if (a.movido && a.ultima && cb.onMove) cb.onMove(a.id, a.ultima.x, a.ultima.z);
          info.skipOnPointerObservable = true;
        } else if (cliqueVazio) {
          if (Math.hypot(scene.pointerX - cliqueVazio.x, scene.pointerY - cliqueVazio.y) < 5 && cb.onSelect) cb.onSelect(null);
          cliqueVazio = null;
        }
      }
    });

    // -------------------------------------------------------------
    // Câmera
    // -------------------------------------------------------------
    function limites(p, soModulos) {
      const proj = p || projetoAtual;
      let min = new B.Vector3(-dimSala.W / 2, 0, -dimSala.D / 2);
      let max = new B.Vector3(dimSala.W / 2, dimSala.H, dimSala.D / 2);
      if (soModulos && registos.size) {
        min = new B.Vector3(Infinity, Infinity, Infinity);
        max = new B.Vector3(-Infinity, -Infinity, -Infinity);
        registos.forEach((reg) => {
          reg.root.getChildMeshes().forEach((mesh) => {
            if (!mesh.isEnabled() || mesh.name === 'selecao' || mesh.name === 'selecao-base') return;
            const bb = mesh.getBoundingInfo().boundingBox;
            min = B.Vector3.Minimize(min, bb.minimumWorld);
            max = B.Vector3.Maximize(max, bb.maximumWorld);
          });
        });
        if (!Number.isFinite(min.x)) return limites(proj, false);
      }
      return { min, max };
    }

    function raioPara(min, max, fator) {
      const tam = max.subtract(min);
      const esfera = 0.5 * Math.sqrt(tam.x * tam.x + tam.y * tam.y + tam.z * tam.z);
      const aspecto = engine.getAspectRatio(camera) || 1.5;
      const fov = camera.fov;
      const fovMin = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * aspecto));
      return Math.max(1.5, (esfera / Math.sin(fovMin / 2)) * (fator || 0.9));
    }

    // Transição da câmera: interpola alpha/beta/raio/alvo sem que o setTarget recalcule os ângulos
    let transicao = null;
    function aplicarCamera(a, b, r, alvo) {
      camera.setTarget(alvo, false, false, true);
      camera.alpha = a;
      camera.beta = b;
      camera.radius = r;
    }

    scene.onBeforeRenderObservable.add(() => {
      if (!transicao) return;
      const t = Math.min(1, (performance.now() - transicao.inicio) / transicao.duracao);
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const d = transicao.de;
      const p = transicao.para;
      aplicarCamera(
        d.a + (p.a - d.a) * k,
        d.b + (p.b - d.b) * k,
        d.r + (p.r - d.r) * k,
        B.Vector3.Lerp(d.alvo, p.alvo, k)
      );
      if (t >= 1) transicao = null;
    });

    // Interromper a transição se o utilizador mexer na câmera
    canvas.addEventListener('pointerdown', () => { transicao = null; });
    canvas.addEventListener('wheel', () => { transicao = null; }, { passive: true });

    function animarCamera(alpha, beta, radius, alvo, rapido) {
      const atual = camera.alpha;
      let diff = alpha - atual;
      diff = ((((diff + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const a = atual + diff;
      camera.upperRadiusLimit = Math.max(30, radius * 2);
      if (rapido) {
        transicao = null;
        aplicarCamera(a, beta, radius, alvo);
        return;
      }
      transicao = {
        inicio: performance.now(),
        duracao: 750,
        de: { a: camera.alpha, b: camera.beta, r: camera.radius, alvo: camera.target.clone() },
        para: { a, b: beta, r: radius, alvo: alvo.clone() }
      };
    }

    function presetCamera(nome, rapido) {
      const { min, max } = limites(projetoAtual, nome === 'fit');
      const centro = min.add(max).scale(0.5);
      const alvo = new B.Vector3(centro.x, Math.min(centro.y, 1.15), centro.z);
      const raio = raioPara(min, max);
      if (nome === 'top') animarCamera(-Math.PI / 2, 0.02, raio * 1.05, new B.Vector3(centro.x, 0, centro.z), rapido);
      else if (nome === 'front') animarCamera(-Math.PI / 2, 1.38, raio * 0.95, alvo, rapido);
      else if (nome === 'side') animarCamera(-Math.PI, 1.3, raio * 0.95, alvo, rapido);
      else if (nome === 'fit') animarCamera(-Math.PI / 2 - 0.5, 1.1, raio * 1.02, alvo, rapido);
      else animarCamera(-Math.PI / 2 - 0.45, 1.12, raio, alvo, rapido);
    }

    // Planificação 3D para o marceneiro: fotografa o projeto de vários ângulos
    // (JPEG com fundo claro, no máx. 1280 px de largura) e repõe a câmera.
    const VISTAS = [
      { nome: 'perspetiva', preset: 'initial', titulo: 'Perspetiva' },
      { nome: 'planta', preset: 'top', titulo: 'Planta (vista de cima)' },
      { nome: 'frontal', preset: 'front', titulo: 'Vista frontal' },
      { nome: 'lateral', preset: 'side', titulo: 'Vista lateral' }
    ];
    function capturarVistas(larguraMax) {
      const antes = { a: camera.alpha, b: camera.beta, r: camera.radius, alvo: camera.target.clone() };
      const escala = Math.min(1, (larguraMax || 1280) / canvas.width);
      const saida = document.createElement('canvas');
      saida.width = Math.round(canvas.width * escala);
      saida.height = Math.round(canvas.height * escala);
      const ctx = saida.getContext('2d');
      const vistas = [];
      // o contorno de seleção não faz parte do projeto
      const selecao = scene.meshes.filter((m) => (m.name === 'selecao' || m.name === 'selecao-base') && m.isEnabled());
      selecao.forEach((m) => m.setEnabled(false));
      try {
        VISTAS.forEach((v) => {
          presetCamera(v.preset, true);
          scene.render();
          ctx.fillStyle = '#f4efe8';
          ctx.fillRect(0, 0, saida.width, saida.height);
          ctx.drawImage(canvas, 0, 0, saida.width, saida.height);
          vistas.push({ nome: v.nome, titulo: v.titulo, imagem: saida.toDataURL('image/jpeg', 0.85) });
        });
      } finally {
        selecao.forEach((m) => m.setEnabled(true));
        transicao = null;
        aplicarCamera(antes.a, antes.b, antes.r, antes.alvo);
        scene.render();
      }
      return vistas;
    }

    // -------------------------------------------------------------
    // Ciclo de vida
    // -------------------------------------------------------------
    engine.runRenderLoop(() => scene.render());
    let observador = null;
    if (typeof ResizeObserver !== 'undefined') {
      observador = new ResizeObserver(() => engine.resize());
      observador.observe(container);
    } else {
      global.addEventListener('resize', () => engine.resize());
    }

    return {
      render,
      camera: presetCamera,
      enquadrar: (rapido) => presetCamera('fit', rapido),
      capturarVistas,
      alternarPortas: (id, forcar) => alternarTodas(id, 'portas', forcar),
      alternarGavetas: (id, forcar) => alternarTodas(id, 'gavetas', forcar),
      abrirTudo(forcar) {
        registos.forEach((_, id) => {
          alternarTodas(id, 'portas', forcar);
          if (forcar === false) alternarTodas(id, 'gavetas', false);
        });
      },
      abrirGavetas(forcar) {
        registos.forEach((_, id) => alternarTodas(id, 'gavetas', forcar));
      },
      estaAberto(id, tipo) {
        const est = aberturas.get(id);
        return !!est && est[tipo].size > 0;
      },
      estatisticas: () => ({ meshes: scene.meshes.length, ativos: scene.getActiveMeshes().length, materiais: scene.materials.length, modulos: registos.size }),
      pick(x, y) {
        const r = scene.pick(x, y, (mesh) => mesh.isPickable && mesh.metadata && mesh.metadata.moduloId);
        return r && r.hit ? r.pickedMesh.metadata : null;
      },
      scene,
      engine,
      dispose() {
        if (observador) observador.disconnect();
        engine.dispose();
      }
    };
  }

  global.NovariEngine3D = { criar };
  // Compatibilidade com o nome antigo
  global.FurnitureAssemblyEngine = global.NovariEngine3D;
})(typeof window !== 'undefined' ? window : globalThis);
