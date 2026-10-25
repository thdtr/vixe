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
| `events` | armadilhas (abaixo) |

Tiles do mapa:

```
#  parede          %  parede falsa      &  bloco invisível (aparece ao ser tocado)
=  viga sólida     -  plataforma vazada ^ v  espinhos (chão / teto)
*  serra           ~  ácido             >  saída
?  placa           @  início            qualquer outro caractere: letra sólida
```

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
  `fill` (`with`), `gravity`, `controls`, `speed`, `tide`, `dark`, `say`, `sfx`, `shake`,
  `glitch`, `flash`, `flag`, `fire`, `wait`, `kill`, `win`, `ease`.
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
`assets/packs/base/script.js` é um exemplo real (a ação `typewrite`).
