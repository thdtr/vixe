# Criando packs

[English](packs.md) · **Português**

Referência completa do formato dos packs. Para uma visão geral, veja o [README](../README.pt-BR.md).
O mapa de cada fase ocupa 64×18 células, e a pasta `assets/packs/base/` tem a campanha
inteira como exemplo.

## Estrutura de um pack

Crie `assets/packs/<id>/` e adicione o id em `assets/packs/manifest.json`. Um pack com
problema é ignorado com um aviso no console; ele nunca derruba o jogo base.

**`pack.json`**

```json
{
  "id": "meu-pack",
  "name": { "pt-BR": "Meu Pack", "en": "My Pack" },
  "worlds": ["mundo.json"],
  "script": "script.js",
  "strings": { "pt-BR": { "chave": "texto" }, "en": { "chave": "text" } }
}
```

`script` e `strings` são opcionais.

**Mundo**: `id`, `name`, `tagline`, `palette` (cores `bg dots wall wallDim girder hazard
exit player text accent hud dim`), `music` (veja abaixo) e `levels`. Opcionais:
`requires` (`{ "world": "w4", "secrets": 4 }`), `hidden`, `code` (rótulo no lugar do
número), `ending` (cena de final após a última fase) e `fx`, os **efeitos** que todas as fases
do mundo compartilham. A paleta também pode definir os tons que o desenho calcula a partir
dela: `wallLit`, `wallSide`, `wallUnder`, `shadow`, `glint`.

**Fase**

| campo    | o que é |
|----------|---------|
| `name`   | `{ "pt-BR": "...", "en": "..." }` |
| `map`    | 18 linhas de até 64 caracteres |
| `marks`  | camada opcional com o mesmo layout: `a-z` agrupa tiles num corpo móvel, `A-Z` marca células de uma zona de gatilho |
| `hidden` | grupos que começam invisíveis, ex. `"bc"` |
| `signs`  | textos dos `?`, em ordem de leitura |
| `words`  | texto sólido localizado: `{ "at": [x, y], "text": {...}, "group": "a" }` |
| `dark`   | raio de visão em células (0 = sem escuridão) |
| `weight` | a força da gravidade (1 por padrão; `0.6` pula como na lua) |
| `fields` | zonas que mudam como você cai enquanto está dentro delas (abaixo) |
| `events` | armadilhas (abaixo) |
| `mechs`  | opções dos **mecanismos** do mapa, ex. `{ "crumble": { "delay": 0.25 } }` |
| `fx`     | **efeitos** desta fase, somados aos do mundo |

Tiles do mapa:

```
#  parede          %  parede falsa      &  bloco invisível (aparece ao ser tocado)
=  viga sólida     -  plataforma vazada ^ v  espinhos (chão / teto)
*  serra           ~  ácido             >  saída
?  placa           @  início            qualquer outro caractere: letra sólida
```

Tiles de mecanismo agem sozinhos, sem precisar de eventos (veja **Mecanismos**):

```
░  chão que desmorona (parece parede)   ¡  espinho escondido que brota quando você chega perto
†  espinho de chão no ritmo   ‡  espinho de teto no ritmo   ↑  mola   « »  esteiras
```

**Campos** assumem a gravidade enquanto o meio do jogador está dentro da zona, e soltam
assim que ele sai. A chave é uma letra de zona de `marks`, ou o campo cobre um retângulo com
`at` (e aí o nome dele também vale como zona). Todas as chaves são opcionais.

```json
"fields": {
  "A": { "gravity": -1, "weight": 0.3 },
  "vento": { "at": [1, 2, 61, 14], "push": [12, 0], "off": true }
}
```

`gravity` e `weight` substituem os da fase enquanto você está dentro, e `push` arrasta você
em células por segundo, entrando e saindo aos poucos nas bordas. `"off": true` começa
desligado, esperando a ação `field` ligar. Um campo ligado mostra partículas que correm
para onde ele puxa.

**Eventos** são dados: todas as condições de `when` precisam valer; os passos de `do`
rodam em ordem (a primeira chave de cada passo é a ação, o resto são opções).

```json
{ "when": { "zone": "A", "deaths": 2 }, "delay": 0.1,
  "do": [ { "wobble": "a" }, { "fall": "a", "land": false }, { "wait": 0.5 }, { "show": "b" } ] }
```

- Gatilhos: `start`, `time`, `every`, `zone` (letra ou `[x, y, w, h]`), `jump`, `land`,
  `stand` (em cima de um grupo), `idle`, `deaths`, `fewerDeaths`, `collected`, `flag`,
  `near` (a menos de `r` células de um grupo ou de uma célula: `"a"`, `{ "group": "a", "r": 3 }`
  ou `[x, y, r]`), `below` (em qualquer ponto embaixo de um grupo, onde ele estiver agora),
  `past` e `before` (a coluna do jogador já passou ou ainda não chegou a uma coluna),
  `airborne` e `grounded`.
  Por padrão um evento dispara uma vez; `"repeat": true` dispara a cada nova ocorrência.
- Ações: `show`, `hide`, `wobble`, `fall` (`land`, `speed`, `dir`: `-1` cai para cima), `move`
  (`by`, `speed`, `loop`, `linear`, `wait`), `stop`, `swap` (`to`, `from`: só esses tiles),
  `fill` (`with`), `gravity`, `weight`, `field` (`on`), `controls`, `speed`, `tide`, `dark`,
  `say`, `sfx`, `shake`, `glitch`, `flash`, `flag`, `fire`, `wait`, `kill`, `win`, `ease`,
  `chase`, `collapse`, `spawn` (abaixo).
- Perseguir e fugir: `{ "chase": "a", "axis": "x", "speed": 6, "min": [-4, 0], "max": [10, 0] }`
  faz um grupo seguir o jogador num eixo (`"x"`, `"y"` ou `"xy"`); com `"flee": 4` ele mantém
  4 células de distância, como uma porta que não espera. Nunca sai de `min`..`max`, em células
  a partir de onde o mapa o desenhou, então uma porta fugitiva acaba encurralada.
- Desabar: `{ "collapse": "a", "from": "left", "rate": 9, "wobble": 0.15 }` derruba um grupo
  coluna por coluna, a partir de `"left"`, `"right"` ou `"player"`, `rate` colunas por segundo.
  As colunas viram grupos chamados `a:<x>`.
- Atores: `{ "spawn": "bolt", "at": [62, 15], "dir": [-1, 0], "speed": 18 }` dispara um dardo
  que voa até bater numa parede; `{ "spawn": "drop", "at": [30, 4], "warn": 0.4 }` é uma
  estalactite que treme e depois cai. Com `"from": "a"` a célula é contada a partir do grupo
  `a`, onde ele estiver agora. Junto com `every` e `"repeat": true`, um `spawn` vira uma torre.
- Em círculos: `{ "orbit": "a", "radius": [16, 6], "period": 8, "at": 0.5 }` leva um grupo
  numa volta (tamanhos em células, `period` em segundos por volta). `at` diz onde o grupo
  começa na volta (`0` direita, `0.25` embaixo, `0.5` esquerda, `0.75` em cima) e `"dir": -1`
  gira ao contrário. Mandado de novo para um grupo que já está orbitando, mantém o lugar e só
  muda o ritmo ou o sentido. `"loop": "wrap"` num `move` recomeça do início em vez de voltar,
  como um meteoro que cai de novo lá de cima.
  `show`, `fall`, `move`, `swap` e `fill` fazem som; `"quiet": true` os silencia.
- Ajuda: `ease` dá mais tempo a toda armadilha disparada depois dele (`1.6` = tremores 60%
  mais longos, movimentos e marés levam 60% mais tempo). Junto com `deaths`, ajuda quem travou sem
  desligar a armadilha: `{ "when": { "start": true, "deaths": 8 }, "do": [ { "ease": 1.6 } ] }`.
  Coloque-o primeiro na lista, para valer antes dos outros eventos de `start` da fase.

**Mecanismos** funcionam sem eventos: desenhe no mapa e ajuste por fase em `mechs`. Toda
opção é opcional.

| tile | nome | opções |
|------|------|--------|
| `░` | `crumble` | `delay` (0,32 s antes de cair, mais com `ease`), `chain` (0,06 s por célula: o resto da laje vai junto, espalhando a partir dos seus pés; 0 desliga), `respawn` (segundos, 0 = nunca) |
| `¡` | `pop` | `reach` (1,4 célula: o quão perto você chega antes de ele saltar), `hold` (segundos de pé, 0 = para sempre), `hint` (mostra uma marca discreta) |
| `†` `‡` | `pulse` | `period` (2 s), `on` (0,8 s de pé), `warn` (0,45 s piscando antes), `wave` (atraso por coluna, para ondas), `phase` |
| `↑` | `spring` | `power` (1,5 pulo) |
| `«` `»` | `belt` | `speed` (5 células/s) |

```json
"mechs": { "crumble": { "delay": 0.25, "chain": 0 }, "pulse": { "period": 1.4, "wave": 0.1 } }
```

Eles só agem no mapa fixo; dentro de um grupo mantêm a aparência e a solidez. Um script
adiciona outros com `registerMechanism(nome, { tiles, options, setup, update, hurts, draw })`
(a referência é `assets/js/game/mechanisms.js`), além de novos atores com `registerActor`
(`assets/js/game/actors.js`) e novos tipos de movimento de grupo com `registerMotion`
(`assets/js/game/motion.js`).

**Música**: `{ "bpm": 100, "voices": [ { "wave": "triangle", "v": 0.3, "notes": "a1 . c2 - g1 ." } ] }`,
uma nota por semicolcheia: `.` é pausa e `-` sustenta a nota anterior. Uma voz também
aceita `cut`, um filtro passa-baixa em Hz (por exemplo `"cut": 1200`) que suaviza ondas
brilhantes como `sawtooth` e `square`.

**Script** (opcional): um módulo ES que exporta `register(api)`. A API tem
`registerAction(name, fn)`, `registerTrigger(name, fn)` e `registerTile(char, def)`.
`assets/packs/base/script.js` é um exemplo real: adiciona as ações `typewrite` e `warp`
(`{ "warp": [x, y], "flip": true }`, onde `null` mantém aquele eixo), o gatilho `typed`,
e estes tiles: as estrelas `·` `°`, o rastro de meteoro `´` e a boca de buraco de minhoca `¤`;
a cortina `¦`, a corda `│` e a plateia `º` (nenhum deles é sólido); a ribalta `•` e o saco de
areia `§` (os dois sólidos); e `╱ ╲ ─ ┆ ╭ ╮ ╰ ╯` para cenário pintado, onde não dá para pisar.

## Efeitos

Efeitos são camadas procedurais desenhadas atrás do mapa, na frente dele ou nos dois. Um mundo
lista em `fx` os que todas as suas fases compartilham, e cada fase soma os seus; uma entrada da
fase com o mesmo `id` de uma do mundo é mesclada sobre ela, e `{ "id": "scene", "off": true }`
a desliga naquela fase.

```json
"fx": [ { "type": "cellar", "id": "scene" }, { "type": "texture", "pattern": "brick" },
        { "type": "dust", "count": 50 }, { "type": "vignette", "strength": 0.7 } ]
```

A biblioteca do jogo (`assets/js/fx/`) está aberta a todo pack:

- Cenários: `cellar` (tijolos iluminados por lâmpadas que balançam, canos, teias), `foundry`
  (engrenagens, treliças, correntes, uma panela despejando metal, vapor, brilho da fornalha),
  `mirror` (um túnel sem fim que gira com a gravidade, sólidos em arame), `paper` (uma página de
  caderno: pautas, margem, texto apagado, mancha de café, tinta), `stage` (telão pintado,
  bambolina, canhões de luz, névoa), `cosmos` (nebulosa, galáxia, planeta com anéis, estrelas,
  estrelas cadentes). Sem posições definidas, cada fase ganha uma montagem diferente, sorteada
  pelo id dela.
- Paredes: `texture` preenche o miolo das paredes com `pattern`: `rock`, `brick`, `plate`,
  `ink`, `planks`, `hull` ou `crystal`, mais escuro quanto mais fundo, com um `shimmer`
  opcional (`caustics`, `heat`, `scan`, `lamps`).
- Atmosfera: `dust` (`kind`: `dust`, `embers`, `ash`, `snow`, `spores`, `glitter`),
  `vignette` (`strength`, `fog`: `[cor, alfa]` subindo do chão) e `light`: escuridão com luzes
  coloridas e sombras de verdade, sonar opcional, e luz de qualquer efeito que tenha o gancho
  `lights()` (as lâmpadas do porão, o metal da fundição, os canhões do palco).

Um script registra novos tipos com `registerFx(nome, (def, play) => fx)`; `assets/js/game/fx.js`
lista os ganchos que um efeito pode ter (`update`, `anim`, `back`, `front`, `lights`, `cmd`), e a
ação `{ "fx": "<id>", ... }` conversa com um deles. Os efeitos desenham com o kit de arte em glifos
de `assets/js/art/` (glifos numa grade duas vezes mais fina que o mapa, ruído, rampas de cor), e
`assets/packs/abyss/script.js` é um exemplo do lado de um pack: céu, mar, águas-vivas,
redemoinho, serpente, fendas de magma e um olho. Cenário nunca deve usar os glifos que
significam algo no jogo (`@ # * ^ v > $ ?`), para o olho sempre separar o fundo da fase.

Um campo também aceita `"swim": true` (cada toque no pulo é uma braçada, como na água) e
`"motes": false` (o campo fica invisível).

## Testando uma fase

O próprio código do jogo roda sem tela no Node, então dá para testar uma fase sem abrir o navegador.

```sh
node tools/solve.mjs w1.3            # acha um caminho pela fase (ou w1 para um mundo inteiro)
node tools/solve.mjs w1.3 --beam 600 # uma busca mais lenta que também acha esperas e desvios
node tools/solve.mjs w1.3 --replay "R20 RJ6 N10 R30"   # joga um roteiro e diz o que aconteceu
node tools/format.mjs assets/packs/meu-pack/mundo.json # deixa o arquivo do mundo no formato dos outros
```

Um roteiro é uma lista de movimentos segurados por tiques de 1/20 s: `R`, `L` ou `N` (nada),
mais `J` para segurar o pulo. O solucionador mostra o caminho que achou, quanto tempo levou e o
quanto precisou procurar. Efeitos que agem sobre o jogador (as criaturas do Abismo) não entram na busca.
