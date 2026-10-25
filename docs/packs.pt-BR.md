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
número) e `ending` (cena de final após a última fase).

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

Tiles do mapa:

```
#  parede          %  parede falsa      &  bloco invisível (aparece ao ser tocado)
=  viga sólida     -  plataforma vazada ^ v  espinhos (chão / teto)
*  serra           ~  ácido             >  saída
?  placa           @  início            qualquer outro caractere: letra sólida
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
  `stand` (em cima de um grupo), `idle`, `deaths`, `fewerDeaths`, `collected`, `flag`.
  Por padrão um evento dispara uma vez; `"repeat": true` dispara a cada nova ocorrência.
- Ações: `show`, `hide`, `wobble`, `fall` (`land`, `speed`, `dir`: `-1` cai para cima), `move`
  (`by`, `speed`, `loop`, `linear`, `wait`), `stop`, `swap` (`to`, `from`: só esses tiles),
  `fill` (`with`), `gravity`, `weight`, `field` (`on`), `controls`, `speed`, `tide`, `dark`,
  `say`, `sfx`, `shake`, `glitch`, `flash`, `flag`, `fire`, `wait`, `kill`, `win`, `ease`.
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
