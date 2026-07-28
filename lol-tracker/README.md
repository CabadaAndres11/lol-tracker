# Clasificación en vivo del torneo — LoL

Web + función serverless que consulta la API de Riot Games y muestra un
leaderboard de rango en Solo/Duo Queue, con winrate incluido.

## 1. Edita la lista de participantes

Abre `players.json` y sustituye la lista de ejemplo por tus jugadores reales.
`platform` es el servidor donde juegan (no la región regional del Riot ID):

| Servidor              | platform |
|------------------------|----------|
| EU West                | `euw1`   |
| EU Nordic & East        | `eun1`   |
| North America          | `na1`    |
| LAN (Latinoamérica N.) | `la1`    |
| LAS (Latinoamérica S.) | `la2`    |
| Brasil                 | `br1`    |
| Korea                  | `kr`     |
| Turquía                | `tr1`    |

```json
[
  { "name": "NombreDelJugador", "tag": "TAG", "platform": "euw1" }
]
```

El `name` y `tag` son el Riot ID completo tal cual aparece en el cliente:
si el jugador se llama `Fulanito#2077`, pon `"name": "Fulanito", "tag": "2077"`.

## 2. Consigue tu API key

1. Entra en https://developer.riotgames.com con tu cuenta de Riot.
2. Copia la "Development API Key" del dashboard (válida 24h, se regenera
   con un clic — suficiente para un torneo puntual; si necesitas que
   funcione días seguidos sin tocarla, solicita una "Personal API Key"
   registrando el proyecto).

## 3. Despliega en Vercel

Como ya tienes cuenta en Vercel:

```bash
npm i -g vercel      # si no lo tienes instalado
cd lol-tracker
vercel               # sigue las instrucciones, crea el proyecto
```

Cuando te pregunte el framework, dile que no hay ninguno (Other/Static),
Vercel detecta solo la carpeta `api/` como funciones y `public/` como sitio
estático.

## 4. Configura la API key en Vercel (¡nunca la pongas en el código!)

En el dashboard de Vercel → tu proyecto → **Settings → Environment
Variables**, añade:

- **Name:** `RIOT_API_KEY`
- **Value:** tu clave de developer.riotgames.com

Después de guardarla, vuelve a desplegar (`vercel --prod`) para que la
función la recoja.

## 5. Listo

Tu leaderboard estará en `https://tu-proyecto.vercel.app`. Se actualiza
solo cada 2 minutos (puedes cambiar `REFRESH_MS` en `public/script.js`).

## Notas importantes

- **La clave de desarrollo caduca cada 24h.** Tendrás que volver a
  Settings → Environment Variables y actualizar el valor cada día que
  dure el torneo, o pedir la Personal API Key para no tener que hacerlo.
- **No compartas tu API key** ni la subas a un repositorio público en
  texto plano; por eso vive como variable de entorno en Vercel.
- Si algún jugador no tiene partidas de Solo/Duo esta temporada, aparecerá
  como "Sin clasificar".
