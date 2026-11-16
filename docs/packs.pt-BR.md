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
exit player text accent hud dim`), `music` (veja [Música](#música)) e `levels`. Opcionais:
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
?  placa           @  início            $  segredo
qualquer outro caractere: letra sólida
```

Cada fase guarda no máximo um segredo, e segredo é para ficar escondido. Um `$` sem ar
nenhum nas oito casas em volta (só paredes, paredes falsas ou tiles sólidos) fica
**enterrado**: aparece como parte da parede até o jogador entrar numa parede falsa ao lado
dele, e aí ele brilha. Então enterre-o atrás de um `%`, como o bolsão à esquerda do início da 1-6:

```
%%%
$%%  @
####
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

**Script** (opcional): um módulo ES que exporta `register(api)`. A API tem
`registerAction(name, fn)`, `registerTrigger(name, fn)` e `registerTile(char, def)`.
`assets/packs/base/script.js` é um exemplo real: adiciona as ações `typewrite` e `warp`
(`{ "warp": [x, y], "flip": true }`, onde `null` mantém aquele eixo), o gatilho `typed`
(uma palavra digitada no teclado, no idioma em que se está jogando:
`{ "typed": { "pt-BR": ["saída"], "en": ["exit"] } }`; como `p` pausa, uma palavra com `p`
nunca chega a ser digitada numa fase), e estes tiles: as estrelas `·` `°`, o rastro de
meteoro `´` e a boca de buraco de minhoca `¤`;
a cortina `¦`, a corda `│` e a plateia `º` (nenhum deles é sólido); a ribalta `•` e o saco de
areia `§` (os dois sólidos); e `╱ ╲ ─ ┆ ╭ ╮ ╰ ╯` para cenário pintado, onde não dá para pisar.

## Música

O `music` de um mundo é uma trilha. Os temas do próprio jogo (`assets/js/core/themes.js`) são
escritos do mesmo jeito, assim como os sete mundos, que servem de exemplo.

```json
{ "bpm": 100, "voices": [ { "wave": "triangle", "v": 0.3, "notes": "a1 . c2 - g1 ." } ] }
```

Cada entrada de `notes` é uma semicolcheia: uma nota (`a1`, `c#4`, `bb2`), `.` para pausa ou
`-` para sustentar a nota anterior. Notas unidas por `+` soam juntas (`a2+c3+e3`), `!` depois
da nota a acentua e `~` a toca baixinho. `notes` pode ser uma lista de textos, um compasso em
cada.

**Seções.** Uma música deixa de ser um laço quando tem `seq`, a ordem em que as seções tocam.
O `notes` de uma voz passa a ter um padrão para cada seção em que ela toca, e ela fica em
silêncio nas outras:

```json
{ "bpm": 100, "seq": "I A A B A", "loop": 1, "voices": [
    { "wave": "triangle", "v": 0.3,
      "notes": { "I": "a1 - - - . . . .", "A": "a1 . a1 . c2 . a1 .", "B": "f1 . . . g1 . . ." } },
    { "drums": true, "v": 0.2, "layer": 1, "notes": { "A B": "k . h . s . h ." } } ] }
```

Uma seção dura o tempo do seu padrão mais longo, e os mais curtos se repetem dentro dela. Uma
chave pode nomear várias seções (`"A B"`), e `"=A"` como padrão quer dizer "igual à A". `loop`
é a entrada de `seq` para onde a música volta quando termina, então uma introdução toca uma vez
só. Uma voz cujo `notes` é um texto simples (ou uma lista) segue em laço por baixo de todas as
seções, no tamanho que tiver: um laço de 37 passos desliza contra os compassos e nunca cai duas
vezes do mesmo jeito.

**Bateria.** Uma voz com `"drums": true` recebe batidas em vez de notas, uma letra para cada,
várias de uma vez (`kh` é bumbo e chimbal). O kit padrão tem `k` bumbo, `s` caixa, `h` chimbal,
`o` chimbal aberto, `c` palma, `t` tom, `r` aro, `x` prato, `b` um estrondo grave e longo e `m`
chocalho. `"kit"`, na trilha ou numa voz, troca os sons: `metal` (bigorna no lugar da caixa,
vapor nos chimbais, `p` um cano batido), `type` (uma máquina de escrever: teclas, barra de
espaço, carro, `d` a campainha, `z` a quebra de linha) ou `soft` (tudo arredondado). Também
pode ser uma tabela sua, `{ "k": [ ...partes ] }`, no formato dos efeitos sonoros que estão no
começo de `assets/js/core/audio.js`.

**Uma voz** pode definir:

| ajuste | o que faz |
|--------|-----------|
| `wave` | `sine`, `triangle`, `square`, `sawtooth`, `pulse` (com largura `width`, 0,25 por padrão) ou uma lista de harmônicos como `[1, 0.5, 0.3]` |
| `v` | o volume |
| `env` | `[ataque, decaimento, sustentação, repouso]`: segundos, com a sustentação de 0 a 1. Sem ele a nota é pinçada e morre ao longo da sua duração |
| `gate` | quanto dos seus passos a nota soa (0,95 por padrão; 0,5 é staccato) |
| `cut`, `res` | um passa-baixa em Hz, que suaviza ondas brilhantes, e a ressonância dele em dB |
| `sweep` | `[de, até, segundos]`: um filtro só da nota, que fecha (ou abre) enquanto ela soa |
| `detune` | cents entre duas cópias da onda, para um som mais largo |
| `vib` | `[cents, hz]` de vibrato |
| `glide` | segundos que a nota leva para deslizar a partir da anterior |
| `tr` | transpõe a voz, em semitons |
| `pan` | de -1 (esquerda) a 1 (direita) |
| `echo`, `space` | quanto da voz vai para o eco e para a sala da trilha, de 0 a 1 |
| `layer` | a intensidade em que ela entra (abaixo), ou `[de, até]` |

**Uma trilha** pode definir `bpm`, `div` (passos por tempo, 4 por padrão), `bar` (passos por
compasso, 16 por padrão; uma valsa tem 12), `swing` (o quanto um passo sim, um não, atrasa, de
0 a 0,5), `seq`, `loop`, `kit` e:

- `echo`: `{ "steps": 3, "feedback": 0.5, "cut": 2800 }`, repetições que saltam de um ouvido
  para o outro.
- `space`: `{ "time": 1.8, "cut": 3500, "mix": 1 }`, a sala onde a trilha toca: quanto tempo
  ela ressoa e o quanto é abafada. Os efeitos sonoros da fase ressoam na mesma sala, então um
  mundo soa como um lugar só.
- `win`: as notas que tocam quando a fase é vencida (`"a4 c5 e5 a5"`), no tom da trilha.

**Camadas.** O jogo toca a trilha de um mundo numa intensidade de 0 a 3, que sobe ao longo das
fases: as primeiras ouvem só as vozes sem `layer`, e a última ouve tudo. Deixe o esqueleto da
trilha sem camada e traga bateria, harmonias e enfeites em 1, 2 e 3. A seleção de fases e o
cartão de um mundo a tocam em 0, atrás de uma porta.

`node tools/check.mjs` lê todas as trilhas: avisa de um item que não é nota, de um compasso
com um passo a menos, de uma batida que o kit não tem e de um ajuste escrito errado.

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
node tools/solve.mjs w2.6 --via "24,13 34,11 24,9"     # mira nessas células, uma de cada vez, e depois na saída
node tools/solve.mjs w1 --naive        # jogar sem pensar (segurar direita, pular no ritmo) vence? Não deveria
node tools/solve.mjs w1 --human        # só toques que um dedo consegue: pulo segurado por 0,1 s ou mais
node tools/check.mjs                   # toda fase carrega, nenhuma armadilha, zona ou flag está morta, toda trilha é lida
node tools/format.mjs assets/packs/meu-pack/mundo.json # deixa o arquivo do mundo no formato dos outros
```

Um roteiro é uma lista de movimentos segurados por tiques de 1/20 s: `R`, `L` ou `N` (nada),
mais `J` para segurar o pulo. O solucionador mostra o caminho que achou, quanto tempo levou e o
quanto precisou procurar; `--slack` diz com que frequência esse caminho ainda vence com o tempo
levemente alterado. Efeitos que agem sobre o jogador precisam de `save()` e `load()` (veja
`assets/js/game/fx.js`) para entrar na busca.

A busca aperta o pulo por um único tique quando convém, o que nenhum dedo consegue: uma fase
pode ser vencível só assim. `--human` segura cada toque por 0,1 s ou mais, então o que ele acha
uma pessoa consegue jogar. Se ele não achar nada onde a busca comum acha, dê espaço a ele antes
de acreditar (`--patience 3` com um `--budget` maior, `--beam`, ou pontos de passagem em cada
plataforma com `--via`, que é o que mais funciona), e então olhe a fase.

Algumas fases fazem a busca se perder (uma porta que foge, um caminho que primeiro se afasta da
saída). `tools/routes.json` guarda um roteiro vencedor para cada uma delas, e testar essas fases
o repete: se uma mudança quebrar uma delas, o solucionador avisa **ROUTE BROKEN**. Ao criar uma
fase assim, ache um caminho com `--human` e `--beam` ou `--via`, confira com `--replay` e
adicione ao arquivo. Toda rota guardada ali é uma que os toques de uma pessoa conseguem jogar.
