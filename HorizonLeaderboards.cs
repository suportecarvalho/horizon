using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries;
using Oxide.Core.Plugins;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("HorizonLeaderboards", "RustHorizon", "1.3.0")]
    [Description("Exporta estatísticas de jogadores (PvP, 8 Recursos e 12 Farming) para o site do Horizon")]
    public class HorizonLeaderboards : RustPlugin
    {
        [PluginReference]
        private Plugin ImageLibrary;

        private Configuration config;
        private StoredData data;

        // Cache de avatares já buscados nesta sessão (steamid → url)
        private readonly Dictionary<string, string> avatarCache = new Dictionary<string, string>();

        public class Configuration
        {
            [JsonProperty("UrlDaApiDoSite")]
            public string ApiUrl { get; set; } = "https://drunk-geometry-canal-bet.trycloudflare.com/api/leaderboard";

            [JsonProperty("IntervaloDeSincronizacaoMinutos")]
            public int SyncIntervalMinutes { get; set; } = 5;

            [JsonProperty("NomeDoServidor")]
            public string ServerName { get; set; } = "Horizon 2x Solo/Duo/Trio";

            [JsonProperty("LimiteJogadoresPorAba")]
            public int TopPlayersLimit { get; set; } = 100;
        }

        public class PlayerStats
        {
            public string Name { get; set; } = "";
            public string SteamId { get; set; } = "";
            public string Avatar { get; set; } = "";

            // PvP
            public int Kills { get; set; } = 0;
            public int Deaths { get; set; } = 0;
            public int Headshots { get; set; } = 0;
            public float MaxKillDistance { get; set; } = 0f;

            // Recursos (8 itens conforme Imagem 1)
            public int Stone { get; set; } = 0;          // stones
            public int Sulfur { get; set; } = 0;         // sulfur.ore
            public int Metal { get; set; } = 0;          // metal.ore
            public int HQM { get; set; } = 0;            // hq.metal.ore
            public int Wood { get; set; } = 0;           // wood
            public int Leather { get; set; } = 0;        // leather
            public int Fat { get; set; } = 0;            // fat.animal
            public int Bone { get; set; } = 0;           // bone.fragments

            // Farming (12 itens conforme Imagem 2)
            public int Cloth { get; set; } = 0;          // cloth
            public int YellowBerry { get; set; } = 0;    // yellow.berry
            public int RedBerry { get; set; } = 0;       // red.berry
            public int BlueBerry { get; set; } = 0;      // blue.berry
            public int GreenBerry { get; set; } = 0;     // green.berry
            public int WhiteBerry { get; set; } = 0;     // white.berry
            public int Mushroom { get; set; } = 0;       // mushroom
            public int Pumpkin { get; set; } = 0;        // pumpkin
            public int Corn { get; set; } = 0;           // corn
            public int Potato { get; set; } = 0;         // potato
            public int Wheat { get; set; } = 0;          // wheat
            public int Egg { get; set; } = 0;            // egg
        }

        public class StoredData
        {
            public Dictionary<string, PlayerStats> Players { get; set; } = new Dictionary<string, PlayerStats>();
        }

        protected override void LoadDefaultConfig()
        {
            config = new Configuration();
            SaveConfig();
        }

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try
            {
                config = Config.ReadObject<Configuration>();
                if (config == null) LoadDefaultConfig();
            }
            catch
            {
                LoadDefaultConfig();
            }
        }

        private void Loaded()
        {
            data = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonLeaderboards");
            if (data == null || data.Players == null)
            {
                data = new StoredData();
            }

            timer.Every(config.SyncIntervalMinutes * 60f, SendLeaderboardToWeb);
            Puts($"[HorizonLeaderboards v1.3.0] Inicializado! Sincronizando com '{config.ApiUrl}' a cada {config.SyncIntervalMinutes} minutos. ({data.Players.Count} jogadores registrados neste wipe)");

            // Buscar avatares de todos os jogadores já registrados que ainda não têm avatar
            foreach (var kv in data.Players)
            {
                if (string.IsNullOrEmpty(kv.Value.Avatar))
                    FetchSteamAvatar(kv.Key, kv.Value);
            }
        }

        private void Unload()
        {
            SaveData();
        }

        // ---------------------------------------------------------------
        // HOOK: Jogador conecta — busca avatar real do Steam
        // ---------------------------------------------------------------
        private void OnPlayerConnected(BasePlayer player)
        {
            if (player == null || player.IsNpc) return;
            string id = player.UserIDString;

            // Garante que o jogador está registrado
            if (!data.Players.TryGetValue(id, out var stats))
            {
                stats = new PlayerStats { SteamId = id, Name = player.displayName };
                data.Players[id] = stats;
            }
            else
            {
                stats.Name = player.displayName;
            }

            // Sempre atualiza o avatar ao conectar (pode ter mudado a foto)
            FetchSteamAvatar(id, stats);
        }

        // Busca o avatar real do Steam via miniprofile (sem precisar de API Key)
        private void FetchSteamAvatar(string steamId, PlayerStats stats)
        {
            if (string.IsNullOrEmpty(steamId)) return;

            // Converte SteamID64 → AccountID (32-bit) para a URL miniprofile
            if (!ulong.TryParse(steamId, out ulong steamId64)) return;
            ulong accountId = steamId64 - 76561197960265728UL;

            string url = $"https://steamcommunity.com/miniprofile/{accountId}/json/";

            webrequest.Enqueue(url, null, (code, response) =>
            {
                if (code != 200 || string.IsNullOrEmpty(response)) return;

                try
                {
                    // Extrair avatar_url do JSON simples
                    // Formato: {"persona_name":"...","avatar_url":"https://...jpg",...}
                    var match = System.Text.RegularExpressions.Regex.Match(
                        response, "\"avatar_url\"\\s*:\\s*\"([^\"]+)\"");

                    if (match.Success)
                    {
                        string avatarUrl = match.Groups[1].Value;
                        if (!string.IsNullOrEmpty(avatarUrl) && avatarUrl.StartsWith("http"))
                        {
                            stats.Avatar = avatarUrl;
                            avatarCache[steamId] = avatarUrl;
                        }
                    }
                }
                catch { }
            }, this, RequestMethod.GET);
        }

        private void SaveData()
        {
            Interface.Oxide.DataFileSystem.WriteObject("HorizonLeaderboards", data);
        }

        private void OnNewSave(string filename)
        {
            Puts("[Wipe Detectado] Arquivando ranking do wipe anterior e reiniciando...");
            try
            {
                string archiveName = $"HorizonLeaderboards_Wipe_{DateTime.UtcNow:yyyyMMdd_HHmmss}";
                Interface.Oxide.DataFileSystem.WriteObject(archiveName, data);
            }
            catch (Exception ex)
            {
                PrintError($"Erro ao arquivar wipe anterior: {ex.Message}");
            }

            data = new StoredData();
            SaveData();
            SendLeaderboardToWeb();
        }

        private PlayerStats GetOrCreate(BasePlayer player)
        {
            if (player == null) return null;
            string id = player.UserIDString;
            
            if (!data.Players.TryGetValue(id, out var stats))
            {
                stats = new PlayerStats
                {
                    SteamId = id,
                    Name = player.displayName
                };
                data.Players[id] = stats;
                // Busca avatar ao criar novo registro
                FetchSteamAvatar(id, stats);
            }
            else
            {
                stats.Name = player.displayName;
            }

            return stats;
        }

        // -------------------------------------------------------------
        // HOOKS: PVP (Apenas mortes e abates em combate PvP entre jogadores reais)
        // -------------------------------------------------------------
        private void OnPlayerDeath(BasePlayer victim, HitInfo info)
        {
            if (victim == null || victim.IsNpc) return;

            // Identifica se foi combate PvP legítimo (vítima morta por outro jogador real, excluindo suicídio e NPCs)
            bool isPvpKill = info?.InitiatorPlayer != null && !info.InitiatorPlayer.IsNpc && info.InitiatorPlayer != victim;

            if (isPvpKill)
            {
                // Registra Morte em PvP para a vítima
                var victimStats = GetOrCreate(victim);
                if (victimStats != null)
                {
                    victimStats.Deaths++;
                }

                // Registra Kill para o atacante
                var killer = info.InitiatorPlayer;
                var killerStats = GetOrCreate(killer);
                if (killerStats != null)
                {
                    killerStats.Kills++;

                    if (info.isHeadshot)
                    {
                        killerStats.Headshots++;
                    }

                    float dist = Vector3.Distance(killer.transform.position, victim.transform.position);
                    if (dist > killerStats.MaxKillDistance)
                    {
                        killerStats.MaxKillDistance = dist;
                    }
                }
            }
        }

        // -------------------------------------------------------------
        // HOOKS: RECURSOS & FARMING
        // -------------------------------------------------------------
        private void OnDispenserGather(ResourceDispenser dispenser, BaseEntity entity, Item item)
        {
            if (item == null || entity == null) return;
            var player = entity.ToPlayer();
            if (player == null || player.IsNpc) return;

            ProcessItem(player, item);
        }

        private void OnDispenserBonus(ResourceDispenser dispenser, BasePlayer player, Item item)
        {
            if (player == null || player.IsNpc || item == null) return;
            ProcessItem(player, item);
        }

        private void OnCollectiblePickup(CollectibleEntity collectible, BasePlayer player)
        {
            if (player == null || player.IsNpc || collectible?.itemList == null) return;

            foreach (var itemAmount in collectible.itemList)
            {
                if (itemAmount?.itemDef == null) continue;
                string sname = itemAmount.itemDef.shortname;
                int amount = (int)itemAmount.amount;
                var stats = GetOrCreate(player);
                if (stats == null) continue;

                // Recursos (8)
                if (sname == "stones" || sname.Contains("stone")) stats.Stone += amount;
                else if (sname.Contains("sulfur.ore")) stats.Sulfur += amount;
                else if (sname.Contains("metal.ore")) stats.Metal += amount;
                else if (sname.Contains("hq.metal.ore")) stats.HQM += amount;
                else if (sname == "wood" || sname.Contains("wood")) stats.Wood += amount;
                else if (sname == "leather" || sname.Contains("leather")) stats.Leather += amount;
                else if (sname == "fat.animal" || sname.Contains("fat")) stats.Fat += amount;
                else if (sname == "bone.fragments" || sname.Contains("bone")) stats.Bone += amount;

                // Farming (12)
                else if (sname == "cloth" || sname.Contains("cloth")) stats.Cloth += amount;
                else if (sname.Contains("yellow.berry") || sname.Contains("berry.yellow")) stats.YellowBerry += amount;
                else if (sname.Contains("red.berry") || sname.Contains("berry.red")) stats.RedBerry += amount;
                else if (sname.Contains("blue.berry") || sname.Contains("berry.blue")) stats.BlueBerry += amount;
                else if (sname.Contains("green.berry") || sname.Contains("berry.green")) stats.GreenBerry += amount;
                else if (sname.Contains("white.berry") || sname.Contains("berry.white")) stats.WhiteBerry += amount;
                else if (sname.Contains("mushroom")) stats.Mushroom += amount;
                else if (sname.Contains("pumpkin")) stats.Pumpkin += amount;
                else if (sname.Contains("corn")) stats.Corn += amount;
                else if (sname.Contains("potato")) stats.Potato += amount;
                else if (sname.Contains("wheat")) stats.Wheat += amount;
                else if (sname.Contains("egg")) stats.Egg += amount;
            }
        }

        private void OnGrowableGathered(GrowableEntity growable, Item item, BasePlayer player)
        {
            if (player == null || player.IsNpc || item == null) return;
            ProcessItem(player, item);
        }

        private void OnItemPickup(Item item, BasePlayer player)
        {
            if (player == null || player.IsNpc || item == null) return;
            ProcessItem(player, item);
        }

        private void ProcessItem(BasePlayer player, Item item)
        {
            var stats = GetOrCreate(player);
            if (stats == null) return;

            string sname = item.info.shortname;
            int amount = item.amount;

            // Recursos (8)
            if (sname == "stones" || sname.Contains("stone")) stats.Stone += amount;
            else if (sname.Contains("sulfur.ore")) stats.Sulfur += amount;
            else if (sname.Contains("metal.ore")) stats.Metal += amount;
            else if (sname.Contains("hq.metal.ore")) stats.HQM += amount;
            else if (sname == "wood" || sname.Contains("wood")) stats.Wood += amount;
            else if (sname == "leather" || sname.Contains("leather")) stats.Leather += amount;
            else if (sname == "fat.animal" || sname.Contains("fat")) stats.Fat += amount;
            else if (sname == "bone.fragments" || sname.Contains("bone")) stats.Bone += amount;

            // Farming (12)
            else if (sname == "cloth" || sname.Contains("cloth")) stats.Cloth += amount;
            else if (sname.Contains("yellow.berry") || sname.Contains("berry.yellow")) stats.YellowBerry += amount;
            else if (sname.Contains("red.berry") || sname.Contains("berry.red")) stats.RedBerry += amount;
            else if (sname.Contains("blue.berry") || sname.Contains("berry.blue")) stats.BlueBerry += amount;
            else if (sname.Contains("green.berry") || sname.Contains("berry.green")) stats.GreenBerry += amount;
            else if (sname.Contains("white.berry") || sname.Contains("berry.white")) stats.WhiteBerry += amount;
            else if (sname.Contains("mushroom")) stats.Mushroom += amount;
            else if (sname.Contains("pumpkin")) stats.Pumpkin += amount;
            else if (sname.Contains("corn")) stats.Corn += amount;
            else if (sname.Contains("potato")) stats.Potato += amount;
            else if (sname.Contains("wheat")) stats.Wheat += amount;
            else if (sname.Contains("egg")) stats.Egg += amount;
        }

        // -------------------------------------------------------------
        // COMANDOS DE CONSOLE (ADMIN)
        // -------------------------------------------------------------
        [ConsoleCommand("horizon.sync")]
        private void CmdSync(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !arg.Player().IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }
            SendLeaderboardToWeb();
            arg.ReplyWith("[HorizonLeaderboards] Sincronização com o site solicitada!");
        }

        [ConsoleCommand("horizon.reset")]
        private void CmdReset(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !arg.Player().IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }
            data = new StoredData();
            SaveData();
            SendLeaderboardToWeb();
            arg.ReplyWith("[HorizonLeaderboards] Todos os dados do ranking foram reiniciados!");
        }

        [ConsoleCommand("horizon.stats")]
        private void CmdStats(ConsoleSystem.Arg arg)
        {
            arg.ReplyWith($"[HorizonLeaderboards] Jogadores: {data.Players.Count} | API: {config.ApiUrl}");
        }

        // -------------------------------------------------------------
        // ENVIO HTTP PARA O SITE
        // -------------------------------------------------------------
        private void SendLeaderboardToWeb()
        {
            SaveData();

            int limit = config.TopPlayersLimit > 0 ? config.TopPlayersLimit : 100;

            // 1. PVP
            var pvpList = data.Players.Values
                .Where(p => p.Kills > 0 || p.Deaths > 0)
                .OrderByDescending(p => p.Kills)
                .ThenByDescending(p => p.Deaths > 0 ? (float)p.Kills / p.Deaths : p.Kills)
                .Take(limit)
                .Select((p, idx) => {
                    float kd = p.Deaths > 0 ? (float)p.Kills / p.Deaths : p.Kills;
                    float hsPct = p.Kills > 0 ? ((float)p.Headshots / p.Kills) * 100f : 0f;
                    string avatarUrl = !string.IsNullOrEmpty(p.Avatar) 
                        ? p.Avatar 
                        : $"https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

                    return new {
                        rank = idx + 1,
                        steamid = p.SteamId,
                        name = p.Name,
                        avatar = avatarUrl,
                        kd = kd.ToString("0.00"),
                        headshot_pct = $"{hsPct:0.0}%",
                        kills = p.Kills,
                        deaths = p.Deaths,
                        headshots = p.Headshots,
                        distance = $"{(int)p.MaxKillDistance}m"
                    };
                }).ToList();

            // 2. RECURSOS (8 itens conforme Imagem 1)
            var recursosList = data.Players.Values
                .Select(p => new {
                    Player = p,
                    Total = p.Stone + p.Sulfur + p.Metal + p.HQM + p.Wood + p.Leather + p.Fat + p.Bone
                })
                .Where(x => x.Total > 0)
                .OrderByDescending(x => x.Total)
                .Take(limit)
                .Select((x, idx) => {
                    var p = x.Player;
                    string avatarUrl = !string.IsNullOrEmpty(p.Avatar) 
                        ? p.Avatar 
                        : $"https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

                    return new {
                        rank = idx + 1,
                        steamid = p.SteamId,
                        name = p.Name,
                        avatar = avatarUrl,
                        total = x.Total.ToString("N0"),
                        stones = p.Stone.ToString("N0"),
                        sulfur = p.Sulfur.ToString("N0"),
                        metal = p.Metal.ToString("N0"),
                        hqm = p.HQM.ToString("N0"),
                        wood = p.Wood.ToString("N0"),
                        leather = p.Leather.ToString("N0"),
                        fat = p.Fat.ToString("N0"),
                        bone = p.Bone.ToString("N0")
                    };
                }).ToList();

            // 3. FARMING (12 itens conforme Imagem 2)
            var farmingList = data.Players.Values
                .Select(p => new {
                    Player = p,
                    Total = p.Cloth + p.YellowBerry + p.RedBerry + p.BlueBerry + p.GreenBerry + p.WhiteBerry +
                            p.Mushroom + p.Pumpkin + p.Corn + p.Potato + p.Wheat + p.Egg
                })
                .Where(x => x.Total > 0)
                .OrderByDescending(x => x.Total)
                .Take(limit)
                .Select((x, idx) => {
                    var p = x.Player;
                    string avatarUrl = !string.IsNullOrEmpty(p.Avatar) 
                        ? p.Avatar 
                        : $"https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

                    return new {
                        rank = idx + 1,
                        steamid = p.SteamId,
                        name = p.Name,
                        avatar = avatarUrl,
                        total = x.Total.ToString("N0"),
                        cloth = p.Cloth.ToString("N0"),
                        yellow_berry = p.YellowBerry.ToString("N0"),
                        red_berry = p.RedBerry.ToString("N0"),
                        blue_berry = p.BlueBerry.ToString("N0"),
                        green_berry = p.GreenBerry.ToString("N0"),
                        white_berry = p.WhiteBerry.ToString("N0"),
                        mushroom = p.Mushroom.ToString("N0"),
                        pumpkin = p.Pumpkin.ToString("N0"),
                        corn = p.Corn.ToString("N0"),
                        potato = p.Potato.ToString("N0"),
                        wheat = p.Wheat.ToString("N0"),
                        egg = p.Egg.ToString("N0")
                    };
                }).ToList();

            var payload = new
            {
                server = config.ServerName,
                wipe_total_players = data.Players.Count,
                updated_at = DateTime.UtcNow.ToString("o"),
                pvp = pvpList,
                recursos = recursosList,
                farming = farmingList
            };

            string json = JsonConvert.SerializeObject(payload);

            var headers = new Dictionary<string, string>
            {
                { "Content-Type", "application/json" },
                { "Bypass-Tunnel-Reminder", "true" },
                { "User-Agent", "HorizonRustServer/1.0" }
            };

            webrequest.Enqueue(config.ApiUrl, json, (code, response) =>
            {
                if (code == 200)
                {
                    Puts($"Dados enviados com sucesso para o site! ({data.Players.Count} jogadores sincronizados)");
                }
                else
                {
                    Puts($"Erro ao enviar dados para '{config.ApiUrl}' (HTTP {code}): {response}");
                }
            }, this, RequestMethod.POST, headers);
        }
    }
}
