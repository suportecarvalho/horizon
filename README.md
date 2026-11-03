# 🎮 Rust Horizon - 2x Solo/Duo/Trio

Website oficial do servidor brasileiro de Rust **Horizon 2x Solo/Duo/Trio**.

![Banner Horizon](images/banner_horizon.jpg)

---

## ⚡ Informações do Servidor

- **IP:** `179.198.115.201:28015`
- **Console Rust (F1):** `client.connect 179.198.115.201:28015`
- **Discord:** [https://discord.gg/VTu3m2MYeX](https://discord.gg/VTu3m2MYeX)
- **Modo:** 2x Gather • Solo / Duo / Trio (Grupo Máximo: 3)
- **Wipe:** Semanal (Quintas-feiras às 19:00)

---

## 📁 Estrutura do Projeto

- `index.html`: Página inicial com vídeo de fundo cinematográfico de Rust, card de conexão e status do servidor.
- `loja/`: Loja VIP oficial e compra de pacotes.
- `leaderboards/`: Ranking em tempo real (PVP, Recursos e Farming) com busca instantânea.
- `regras/`: Regras da comunidade e diretrizes contra hacks/toxicidade.
- `noticias/`, `termos/`, `privacidade/`: Páginas de apoio institucional.
- `api/leaderboard.js`: Vercel Serverless Function que recebe e serve as estatísticas do servidor.
- `HorizonLeaderboards.cs`: Plugin C# oficial para Oxide/Carbon que envia dados do servidor Rust para o site.

---

## 🚀 Como Rodar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o servidor local
npm start
```
Acesse: [http://localhost:3000](http://localhost:3000)

---

## ☁️ Como Fazer Deploy na Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login com sua conta do GitHub.
2. Clique em **"Add New..."** > **"Project"**.
3. Selecione o repositório **`suportecarvalho/horizon`**.
4. Mantenha as configurações padrão (Framework Preset: **Other**) e clique em **Deploy**.
5. Pronto! Seu site estará online com HTTPS gratuito e CDN global.

---

## 🔌 Sincronização do Leaderboard no Servidor Rust

1. Coloque o arquivo `HorizonLeaderboards.cs` na pasta `oxide/plugins/` do seu servidor.
2. No arquivo `oxide/config/HorizonLeaderboards.json`, aponte a URL para o seu domínio na Vercel:
   ```json
   {
     "UrlDaApiDoSite": "https://seu-site-horizon.vercel.app/api/leaderboard",
     "IntervaloDeSincronizacaoMinutos": 5,
     "NomeDoServidor": "Horizon 2x Solo/Duo/Trio"
   }
   ```
3. No console do Rust: `oxide.reload HorizonLeaderboards`
