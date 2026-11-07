using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries;
using Oxide.Core.Plugins;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("HorizonCore", "RustHorizon", "2.0.0")]
    [Description("Plugin unificado Horizon: status do servidor em tempo real (players, wipe, mapa, fps) e estatísticas completas de Leaderboards (PvP, Recursos, Farming, Raid)")]
    public class HorizonCore : RustPlugin
    {
        [PluginReference]
        private Plugin ImageLibrary;

        private Configuration config;
        private StoredData data;

        // Timers de sincronização
        private Timer statusTimer;
        private Timer debounceStatusTimer;
        private Timer leaderboardTimer;

        // Cache em memória de avatares já buscados nesta sessão (steamid → url)
        private readonly Dictionary<string, string> avatarCache = new Dictionary<string, string>();

        // -------------------------------------------------------------
        // CONFIGURAÇÃO UNIFICADA
        // -------------------------------------------------------------
        public class Configuration
        {
            [JsonProperty("Status_UrlDaApiDoSite")]
            public string StatusApiUrl { get; set; } = "https://lojahorizon.vercel.app/api/status";

            [JsonProperty("Status_IntervaloSegundos")]
            public int StatusSyncIntervalSeconds { get; set; } = 30;

            [JsonProperty("Status_ApiKey")]
            public string ApiKey { get; set; } = "horizon_live_server_secret";

            [JsonProperty("Status_CronogramaWipeMapa")]
            public string MapWipeSchedule { get; set; } = "Toda Sexta às 18:00h";

            [JsonProperty("Status_CronogramaWipeFull")]
            public string FullWipeSchedule { get; set; } = "1ª Quinta-feira do mês às 15:00h";

            [JsonProperty("Status_NomeDoServidor")]
            public string ServerName { get; set; } = "[BR/LATAM] HORIZON 2X | SOLO/DUO/TRIO/QUAD";

            [JsonProperty("Status_LimitePorTime")]
            public string TeamLimit { get; set; } = "(Max 4)";

            [JsonProperty("Leaderboard_UrlDaApiDoSite")]
            public string LeaderboardApiUrl { get; set; } = "https://lojahorizon.vercel.app/api/leaderboard";

            [JsonProperty("Leaderboard_IntervaloMinutos")]
            public int LeaderboardSyncIntervalMinutes { get; set; } = 5;

            [JsonProperty("Leaderboard_LimiteJogadoresPorAba")]
            public int TopPlayersLimit { get; set; } = 100;

            [JsonProperty("LogarNoConsole")]
            public bool LogToConsole { get; set; } = false;
        }

        // -------------------------------------------------------------
        // DADOS DO LEADERBOARD (PvP, Recursos, Farming, Raid)
        // -------------------------------------------------------------
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

            // Recursos (8 itens)
            public int Stone { get; set; } = 0;          // stones
            public int Sulfur { get; set; } = 0;         // sulfur.ore
            public int Metal { get; set; } = 0;          // metal.ore
            public int HQM { get; set; } = 0;            // hq.metal.ore
            public int Wood { get; set; } = 0;           // wood
            public int Leather { get; set; } = 0;        // leather
            public int Fat { get; set; } = 0;            // fat.animal
            public int Bone { get; set; } = 0;           // bone.fragments

            // Farming (12 itens)
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

            // Raid (Explosivos usados)
            public int RocketsUsed { get; set; } = 0;
            public int C4Used { get; set; } = 0;
            public int SatchelsUsed { get; set; } = 0;
            public int StructuresDestroyed { get; set; } = 0;
            public int DoorsDestroyed { get; set; } = 0;
        }

        public class StoredData
        {
            public Dictionary<string, PlayerStats> Players { get; set; } = new Dictionary<string, PlayerStats>();
        }

        // -------------------------------------------------------------
        // CARREGAMENTO E SALVAMENTO DE CONFIGURAÇÃO
        // -------------------------------------------------------------
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

        protected override void SaveConfig()
        {
            Config.WriteObject(config, true);
        }

        private void SaveData()
        {
            // Salva sob a chave 'HorizonLeaderboards' para total compatibilidade com dados existentes
            Interface.Oxide.DataFileSystem.WriteObject("HorizonLeaderboards", data);
        }

        // -------------------------------------------------------------
        // INICIALIZAÇÃO E FINALIZAÇÃO
        // -------------------------------------------------------------
        private void Loaded()
        {
            LoadConfig();

            // Carrega dados persistidos do ranking (mantendo histórico anterior intacto)
            data = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonLeaderboards");
            if (data == null || data.Players == null)
            {
                data = new StoredData();
            }
        }

        private void OnServerInitialized()
        {
            // 1. Sincronização inicial de status após 3s do boot
            timer.Once(3f, () => SyncServerStatus("Inicialização do Servidor"));

            // 2. Loop periódico de status do servidor (padrão a cada 30 segundos)
            int statusInterval = Math.Max(15, config.StatusSyncIntervalSeconds);
            statusTimer = timer.Every(statusInterval, () => SyncServerStatus("Rotina Periódica"));

            // 3. Loop periódico de Leaderboards (padrão a cada 5 minutos)
            int lbInterval = Math.Max(1, config.LeaderboardSyncIntervalMinutes);
            leaderboardTimer = timer.Every(lbInterval * 60f, SendLeaderboardToWeb);

            Puts($"[HorizonCore v2.0.0] Ativado com sucesso!");
            Puts($"[HorizonCore] Status: '{config.StatusApiUrl}' a cada {statusInterval}s.");
            Puts($"[HorizonCore] Leaderboards: '{config.LeaderboardApiUrl}' a cada {lbInterval}m. ({data.Players.Count} jogadores registrados neste wipe)");

            // Buscar avatares pendentes de jogadores já registrados
            foreach (var kv in data.Players)
            {
                if (string.IsNullOrEmpty(kv.Value.Avatar))
                {
                    FetchSteamAvatar(kv.Key, kv.Value);
                }
            }
        }

        private void Unload()
        {
            if (statusTimer != null)
            {
                statusTimer.Destroy();
                statusTimer = null;
            }
            if (debounceStatusTimer != null)
            {
                debounceStatusTimer.Destroy();
                debounceStatusTimer = null;
            }
            if (leaderboardTimer != null)
            {
                leaderboardTimer.Destroy();
                leaderboardTimer = null;
            }

            SaveData();
            Puts("[HorizonCore] Descarregado e dados salvos com sucesso.");
        }

        // -------------------------------------------------------------
        // WIPE DETECTADO (OnNewSave)
        // -------------------------------------------------------------
        private void OnNewSave(string filename)
        {
            Puts($"[HorizonCore] Novo wipe detectado (Save: {filename})! Arquivando ranking do wipe anterior e reiniciando...");
            try
            {
                string archiveName = $"HorizonLeaderboards_Wipe_{DateTime.UtcNow:yyyyMMdd_HHmmss}";
                Interface.Oxide.DataFileSystem.WriteObject(archiveName, data);
            }
            catch (Exception ex)
            {
                PrintError($"[HorizonCore] Erro ao arquivar wipe anterior: {ex.Message}");
            }

            data = new StoredData();
            SaveData();

            // Notifica novo wipe imediatamente ao site (Status + Leaderboard limpo)
            timer.Once(5f, () =>
            {
                SyncServerStatus("Novo Wipe Detectado");
                SendLeaderboardToWeb();
            });
        }

        // -------------------------------------------------------------
        // HOOKS DE CONEXÃO DE JOGADORES
        // -------------------------------------------------------------
        private void OnPlayerConnected(BasePlayer player)
        {
            if (player == null || player.IsNpc) return;
            string id = player.UserIDString;

            // Registra jogador no Leaderboard e busca avatar Steam
            if (!data.Players.TryGetValue(id, out var stats))
            {
                stats = new PlayerStats { SteamId = id, Name = player.displayName };
                data.Players[id] = stats;
            }
            else
            {
                stats.Name = player.displayName;
            }

            FetchSteamAvatar(id, stats);

            // Sincroniza status do servidor com debounce de 4s
            ScheduleDebouncedStatusSync();
        }

        private void OnPlayerDisconnected(BasePlayer player, string reason)
        {
            ScheduleDebouncedStatusSync();
        }

        private void ScheduleDebouncedStatusSync()
        {
            if (debounceStatusTimer != null) return;
            debounceStatusTimer = timer.Once(4f, () =>
            {
                debounceStatusTimer = null;
                SyncServerStatus("Mudança de Jogadores");
            });
        }

        // -------------------------------------------------------------
        // AVATAR DO STEAM (Via miniprofile, sem expor chaves sensíveis)
        // -------------------------------------------------------------
        private void FetchSteamAvatar(string steamId, PlayerStats stats)
        {
            if (string.IsNullOrEmpty(steamId)) return;

            if (avatarCache.TryGetValue(steamId, out var cached) && !string.IsNullOrEmpty(cached))
            {
                stats.Avatar = cached;
                return;
            }

            if (!ulong.TryParse(steamId, out ulong steamId64)) return;
            ulong accountId = steamId64 - 76561197960265728UL;

            string url = $"https://steamcommunity.com/miniprofile/{accountId}/json/";

            webrequest.Enqueue(url, null, (code, response) =>
            {
                if (code != 200 || string.IsNullOrEmpty(response)) return;

                try
                {
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
                FetchSteamAvatar(id, stats);
            }
            else
            {
                stats.Name = player.displayName;
            }

            return stats;
        }

        // -------------------------------------------------------------
        // 1. SINCRONIZAÇÃO DE STATUS DO SERVIDOR (Horizonserverinfo)
        // -------------------------------------------------------------
        public void SyncServerStatus(string motivo = "Manual")
        {
            try
            {
                // Timestamp de wipe extraído diretamente do Rust SaveRestore
                DateTime wipeDateTime = SaveRestore.SaveCreatedTime.ToUniversalTime();
                long wipedAtMs = new DateTimeOffset(wipeDateTime).ToUnixTimeMilliseconds();

                int players = BasePlayer.activePlayerList != null ? BasePlayer.activePlayerList.Count : 0;
                int maxPlayers = ConVar.Server.maxplayers;
                int queue = 0;
                int joining = 0;

                try
                {
                    if (ServerMgr.Instance != null && ServerMgr.Instance.connectionQueue != null)
                    {
                        queue = ServerMgr.Instance.connectionQueue.Queued;
                        joining = ServerMgr.Instance.connectionQueue.Joining;
                    }
                }
                catch { }

                string serverName = !string.IsNullOrEmpty(config.ServerName) 
                    ? config.ServerName 
                    : (!string.IsNullOrEmpty(ConVar.Server.hostname) ? ConVar.Server.hostname : "[BR/LATAM] HORIZON 2X | SOLO/DUO/TRIO/QUAD");
                string mapName = !string.IsNullOrEmpty(ConVar.Server.level) ? ConVar.Server.level : "Procedural Map";
                int worldSize = ConVar.Server.worldsize;
                int fps = (int)Performance.current.frameRate;
                int entities = BaseNetworkable.serverEntities != null ? BaseNetworkable.serverEntities.Count : 0;

                var payload = new
                {
                    online = true,
                    serverName = serverName,
                    map = mapName,
                    worldSize = worldSize,
                    players = players,
                    maxPlayers = maxPlayers,
                    queuePlayers = queue,
                    joiningPlayers = joining,
                    fps = fps,
                    entities = entities,
                    wipedAt = wipedAtMs,
                    wipeDateTimeUtc = wipeDateTime.ToString("o"),
                    schedule = new
                    {
                        mapWipe = config.MapWipeSchedule,
                        fullWipe = config.FullWipeSchedule,
                        teamLimit = config.TeamLimit,
                        serverName = serverName,
                        type = serverName
                    },
                    syncReason = motivo,
                    updatedAt = DateTime.UtcNow.ToString("o")
                };

                string json = JsonConvert.SerializeObject(payload);

                var headers = new Dictionary<string, string>
                {
                    { "Content-Type", "application/json" },
                    { "X-API-KEY", config.ApiKey },
                    { "Bypass-Tunnel-Reminder", "true" },
                    { "User-Agent", "HorizonCore/2.0" }
                };

                webrequest.Enqueue(config.StatusApiUrl, json, (code, response) =>
                {
                    if (code == 200)
                    {
                        if (config.LogToConsole)
                        {
                            Puts($"[HorizonCore] Status sincronizado! ({players}/{maxPlayers} players, Wipe: {wipeDateTime.ToLocalTime():dd/MM HH:mm})");
                        }
                    }
                    else
                    {
                        Puts($"[HorizonCore] Erro ao sincronizar status com '{config.StatusApiUrl}' (HTTP {code}): {response}");
                    }
                }, this, RequestMethod.POST, headers);
            }
            catch (Exception ex)
            {
                Puts($"[HorizonCore] Falha ao processar status: {ex.Message}");
            }
        }

        // -------------------------------------------------------------
        // 2. HOOKS: PVP, RECURSOS, FARMING E RAID (Horizonleadbords)
        // -------------------------------------------------------------
        private void OnPlayerDeath(BasePlayer victim, HitInfo info)
        {
            if (victim == null || victim.IsNpc) return;

            bool isPvpKill = info?.InitiatorPlayer != null && !info.InitiatorPlayer.IsNpc && info.InitiatorPlayer != victim;
            if (isPvpKill)
            {
                var victimStats = GetOrCreate(victim);
                if (victimStats != null) victimStats.Deaths++;

                var killer = info.InitiatorPlayer;
                var killerStats = GetOrCreate(killer);
                if (killerStats != null)
                {
                    killerStats.Kills++;
                    if (info.isHeadshot) killerStats.Headshots++;

                    float dist = Vector3.Distance(killer.transform.position, victim.transform.position);
                    if (dist > killerStats.MaxKillDistance)
                    {
                        killerStats.MaxKillDistance = dist;
                    }
                }
            }
        }

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

                // Recursos
                if (sname == "stones" || sname.Contains("stone")) stats.Stone += amount;
                else if (sname.Contains("sulfur.ore")) stats.Sulfur += amount;
                else if (sname.Contains("metal.ore")) stats.Metal += amount;
                else if (sname.Contains("hq.metal.ore")) stats.HQM += amount;
                else if (sname == "wood" || sname.Contains("wood")) stats.Wood += amount;
                else if (sname == "leather" || sname.Contains("leather")) stats.Leather += amount;
                else if (sname == "fat.animal" || sname.Contains("fat")) stats.Fat += amount;
                else if (sname == "bone.fragments" || sname.Contains("bone")) stats.Bone += amount;

                // Farming
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

        private void OnRocketLaunched(BasePlayer player, BaseEntity entity)
        {
            if (player == null || player.IsNpc) return;
            var stats = GetOrCreate(player);
            if (stats != null) stats.RocketsUsed++;
        }

        private void OnExplosiveThrown(BasePlayer player, BaseEntity entity)
        {
            if (player == null || player.IsNpc || entity == null) return;
            var stats = GetOrCreate(player);
            if (stats == null) return;

            string sname = entity.ShortPrefabName;
            if (sname.Contains("explosive.timed") || sname.Contains("c4"))
            {
                stats.C4Used++;
            }
            else if (sname.Contains("explosive.satchel") || sname.Contains("satchel"))
            {
                stats.SatchelsUsed++;
            }
        }

        // -------------------------------------------------------------
        // ENVIO DO LEADERBOARD PARA A API DO SITE
        // -------------------------------------------------------------
        public void SendLeaderboardToWeb()
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
                        : "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

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

            // 2. RECURSOS
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
                        : "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

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

            // 3. FARMING
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
                        : "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

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

            // 4. RAID
            var raidList = data.Players.Values
                .Select(p => new {
                    Player = p,
                    TotalExplosives = p.RocketsUsed + p.C4Used + p.SatchelsUsed,
                    TotalScore = (p.C4Used * 5) + (p.RocketsUsed * 4) + (p.SatchelsUsed * 2)
                })
                .Where(x => x.TotalExplosives > 0)
                .OrderByDescending(x => x.TotalScore)
                .ThenByDescending(x => x.TotalExplosives)
                .Take(limit)
                .Select((x, idx) => {
                    var p = x.Player;
                    string avatarUrl = !string.IsNullOrEmpty(p.Avatar)
                        ? p.Avatar
                        : "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

                    return new {
                        rank = idx + 1,
                        steamid = p.SteamId,
                        name = p.Name,
                        avatar = avatarUrl,
                        total_score = x.TotalScore.ToString("N0"),
                        total_explosives = x.TotalExplosives.ToString("N0"),
                        rockets = p.RocketsUsed.ToString("N0"),
                        c4 = p.C4Used.ToString("N0"),
                        satchels = p.SatchelsUsed.ToString("N0")
                    };
                }).ToList();

            var payload = new
            {
                server = config.ServerName,
                wipe_total_players = data.Players.Count,
                updated_at = DateTime.UtcNow.ToString("o"),
                pvp = pvpList,
                recursos = recursosList,
                farming = farmingList,
                raid = raidList
            };

            string json = JsonConvert.SerializeObject(payload);

            var headers = new Dictionary<string, string>
            {
                { "Content-Type", "application/json" },
                { "Bypass-Tunnel-Reminder", "true" },
                { "User-Agent", "HorizonCore/2.0" }
            };

            webrequest.Enqueue(config.LeaderboardApiUrl, json, (code, response) =>
            {
                if (code == 200)
                {
                    if (config.LogToConsole)
                    {
                        Puts($"[HorizonCore] Leaderboards enviados com sucesso! ({data.Players.Count} jogadores sincronizados)");
                    }
                }
                else
                {
                    Puts($"[HorizonCore] Erro ao enviar leaderboards para '{config.LeaderboardApiUrl}' (HTTP {code}): {response}");
                }
            }, this, RequestMethod.POST, headers);
        }

        // -------------------------------------------------------------
        // COMANDOS DE CHAT (/rank, /ranking, /top)
        // -------------------------------------------------------------
        private readonly Dictionary<ulong, float> rankCooldowns = new Dictionary<ulong, float>();

        private string CleanPlayerName(string rawName)
        {
            if (string.IsNullOrEmpty(rawName)) return "Sobrevivente";
            string clean = rawName.Replace("<", "").Replace(">", "").Trim();
            if (string.IsNullOrEmpty(clean)) return "Sobrevivente";
            if (clean.Length > 16) clean = clean.Substring(0, 16) + "..";
            return clean;
        }

        private string GetRankBadge(int pos)
        {
            switch (pos)
            {
                case 1: return "<color=#F59E0B><b>#1</b></color>";
                case 2: return "<color=#E2E8F0><b>#2</b></color>";
                case 3: return "<color=#CD7F32><b>#3</b></color>";
                default: return $"<color=#94A3B8><b>#{pos}</b></color>";
            }
        }

        [ChatCommand("rank")]
        [ChatCommand("ranking")]
        [ChatCommand("top")]
        private void CmdChatRank(BasePlayer player, string command, string[] args)
        {
            if (player == null) return;

            ulong playerId = player.userID;
            float now = UnityEngine.Time.realtimeSinceStartup;
            float lastTime;
            if (rankCooldowns.TryGetValue(playerId, out lastTime) && (now - lastTime) < 3f)
            {
                SendReply(player, "<color=#E6A15C>[Horizon]</color> <color=#94A3B8>Aguarde alguns segundos antes de consultar o /rank novamente.</color>");
                return;
            }
            rankCooldowns[playerId] = now;

            if (data == null || data.Players == null || data.Players.Count == 0)
            {
                SendReply(player, "<color=#82ADA4><b>[HORIZON RANKING]</b></color> <color=#94A3B8>Nenhuma estatistica registrada ainda neste wipe.</color>");
                return;
            }

            if (args != null && args.Length > 0)
            {
                string sub = args[0].ToLower();
                if (sub == "pvp") { ShowPvpTop(player); return; }
                if (sub == "recursos" || sub == "rec" || sub == "farmrec") { ShowRecursosTop(player); return; }
                if (sub == "farming" || sub == "farm" || sub == "plantas") { ShowFarmingTop(player); return; }
                if (sub == "raid" || sub == "raids") { ShowRaidTop(player); return; }
            }

            ShowAllTop3(player);
        }

        private void ShowAllTop3(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#82ADA4><b>================ [ TOP 3 LEADERBOARD ] ================</b></color>");

            // 1. PVP
            sb.AppendLine("<color=#EF4444><b>[ PVP ]</b></color> <color=#71717A>(Kills & K/D)</color>");
            var topPvp = data.Players.Values
                .Where(p => p.Kills > 0 || p.Deaths > 0)
                .OrderByDescending(p => p.Kills)
                .ThenByDescending(p => p.Deaths > 0 ? (float)p.Kills / p.Deaths : p.Kills)
                .Take(3)
                .ToList();

            if (topPvp.Count == 0)
            {
                sb.AppendLine("  <color=#71717A>Nenhum dado registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topPvp.Count; i++)
                {
                    var p = topPvp[i];
                    float kd = p.Deaths > 0 ? (float)p.Kills / p.Deaths : p.Kills;
                    sb.AppendLine($"  {GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#F87171><b>{p.Kills}</b> kills</color> <color=#71717A>(K/D: {kd:0.00})</color>");
                }
            }

            // 2. RECURSOS
            sb.AppendLine("<color=#EAB308><b>[ RECURSOS ]</b></color> <color=#71717A>(Total Coletado)</color>");
            var topRec = data.Players.Values
                .Select(p => new {
                    Player = p,
                    Total = p.Stone + p.Sulfur + p.Metal + p.HQM + p.Wood + p.Leather + p.Fat + p.Bone
                })
                .Where(x => x.Total > 0)
                .OrderByDescending(x => x.Total)
                .Take(3)
                .ToList();

            if (topRec.Count == 0)
            {
                sb.AppendLine("  <color=#71717A>Nenhum recurso coletado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topRec.Count; i++)
                {
                    var x = topRec[i];
                    sb.AppendLine($"  {GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(x.Player.Name)}</color> - <color=#FDE047><b>{x.Total:N0}</b></color> <color=#71717A>recursos</color>");
                }
            }

            // 3. FARMING
            sb.AppendLine("<color=#22C55E><b>[ FARMING ]</b></color> <color=#71717A>(Plantas & Coletas)</color>");
            var topFarm = data.Players.Values
                .Select(p => new {
                    Player = p,
                    Total = p.Cloth + p.YellowBerry + p.RedBerry + p.BlueBerry + p.GreenBerry + p.WhiteBerry +
                            p.Mushroom + p.Pumpkin + p.Corn + p.Potato + p.Wheat + p.Egg
                })
                .Where(x => x.Total > 0)
                .OrderByDescending(x => x.Total)
                .Take(3)
                .ToList();

            if (topFarm.Count == 0)
            {
                sb.AppendLine("  <color=#71717A>Nenhum farm registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topFarm.Count; i++)
                {
                    var x = topFarm[i];
                    sb.AppendLine($"  {GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(x.Player.Name)}</color> - <color=#86EFAC><b>{x.Total:N0}</b></color> <color=#71717A>itens</color>");
                }
            }

            // 4. RAID
            sb.AppendLine("<color=#F97316><b>[ RAID ]</b></color> <color=#71717A>(Score & Explosivos)</color>");
            var topRaid = data.Players.Values
                .Select(p => new {
                    Player = p,
                    TotalExplosives = p.RocketsUsed + p.C4Used + p.SatchelsUsed,
                    TotalScore = (p.C4Used * 5) + (p.RocketsUsed * 4) + (p.SatchelsUsed * 2)
                })
                .Where(x => x.TotalExplosives > 0)
                .OrderByDescending(x => x.TotalScore)
                .ThenByDescending(x => x.TotalExplosives)
                .Take(3)
                .ToList();

            if (topRaid.Count == 0)
            {
                sb.AppendLine("  <color=#71717A>Nenhum raid registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topRaid.Count; i++)
                {
                    var x = topRaid[i];
                    sb.AppendLine($"  {GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(x.Player.Name)}</color> - <color=#FDBA74><b>{x.TotalScore:N0} pts</b></color> <color=#71717A>({x.TotalExplosives:N0} explosivos)</color>");
                }
            }

            sb.AppendLine("<color=#82ADA4>=======================================================</color>");
            sb.AppendLine("<color=#94A3B8>Ranking completo em: <color=#38BDF8>lojahorizon.vercel.app/leaderboard</color></color>");

            SendReply(player, sb.ToString());
        }

        private void ShowPvpTop(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#EF4444><b>==================== [ TOP 5 PVP ] ====================</b></color>");
            var topPvp = data.Players.Values
                .Where(p => p.Kills > 0 || p.Deaths > 0)
                .OrderByDescending(p => p.Kills)
                .ThenByDescending(p => p.Deaths > 0 ? (float)p.Kills / p.Deaths : p.Kills)
                .Take(5)
                .ToList();

            if (topPvp.Count == 0)
            {
                sb.AppendLine("<color=#71717A>Nenhum dado registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topPvp.Count; i++)
                {
                    var p = topPvp[i];
                    float kd = p.Deaths > 0 ? (float)p.Kills / p.Deaths : p.Kills;
                    float hsPct = p.Kills > 0 ? ((float)p.Headshots / p.Kills) * 100f : 0f;
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> | <color=#F87171><b>{p.Kills}</b> Kills</color> | <color=#94A3B8>{p.Deaths} Deaths</color> | <color=#FDE047>K/D {kd:0.00}</color> | <color=#A7F3D0>HS {hsPct:0.0}%</color>");
                }
            }
            sb.AppendLine("<color=#EF4444>=======================================================</color>");
            SendReply(player, sb.ToString());
        }

        private void ShowRecursosTop(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#EAB308><b>================== [ TOP 5 RECURSOS ] ==================</b></color>");
            var topRec = data.Players.Values
                .Select(p => new {
                    Player = p,
                    Total = p.Stone + p.Sulfur + p.Metal + p.HQM + p.Wood + p.Leather + p.Fat + p.Bone
                })
                .Where(x => x.Total > 0)
                .OrderByDescending(x => x.Total)
                .Take(5)
                .ToList();

            if (topRec.Count == 0)
            {
                sb.AppendLine("<color=#71717A>Nenhum recurso coletado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topRec.Count; i++)
                {
                    var x = topRec[i];
                    var p = x.Player;
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#FDE047><b>{x.Total:N0}</b></color> total <color=#71717A>(Madeira: {p.Wood:N0} | Pedra: {p.Stone:N0} | Metal: {p.Metal:N0} | Enxofre: {p.Sulfur:N0})</color>");
                }
            }
            sb.AppendLine("<color=#EAB308>=======================================================</color>");
            SendReply(player, sb.ToString());
        }

        private void ShowFarmingTop(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#22C55E><b>================== [ TOP 5 FARMING ] ===================</b></color>");
            var topFarm = data.Players.Values
                .Select(p => new {
                    Player = p,
                    Total = p.Cloth + p.YellowBerry + p.RedBerry + p.BlueBerry + p.GreenBerry + p.WhiteBerry +
                            p.Mushroom + p.Pumpkin + p.Corn + p.Potato + p.Wheat + p.Egg
                })
                .Where(x => x.Total > 0)
                .OrderByDescending(x => x.Total)
                .Take(5)
                .ToList();

            if (topFarm.Count == 0)
            {
                sb.AppendLine("<color=#71717A>Nenhum farm registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topFarm.Count; i++)
                {
                    var x = topFarm[i];
                    var p = x.Player;
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#86EFAC><b>{x.Total:N0}</b></color> colheitas <color=#71717A>(Tecido: {p.Cloth:N0} | Comida: {(p.Pumpkin + p.Corn + p.Potato):N0})</color>");
                }
            }
            sb.AppendLine("<color=#22C55E>=======================================================</color>");
            SendReply(player, sb.ToString());
        }

        private void ShowRaidTop(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#F97316><b>==================== [ TOP 5 RAID ] ====================</b></color>");
            var topRaid = data.Players.Values
                .Select(p => new {
                    Player = p,
                    TotalExplosives = p.RocketsUsed + p.C4Used + p.SatchelsUsed,
                    TotalScore = (p.C4Used * 5) + (p.RocketsUsed * 4) + (p.SatchelsUsed * 2)
                })
                .Where(x => x.TotalExplosives > 0)
                .OrderByDescending(x => x.TotalScore)
                .ThenByDescending(x => x.TotalExplosives)
                .Take(5)
                .ToList();

            if (topRaid.Count == 0)
            {
                sb.AppendLine("<color=#71717A>Nenhum raid registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topRaid.Count; i++)
                {
                    var x = topRaid[i];
                    var p = x.Player;
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#FDBA74><b>{x.TotalScore:N0} pts</b></color> <color=#71717A>(C4: {p.C4Used} | Foguetes: {p.RocketsUsed} | Satchels: {p.SatchelsUsed})</color>");
                }
            }
            sb.AppendLine("<color=#F97316>=======================================================</color>");
            SendReply(player, sb.ToString());
        }

        // -------------------------------------------------------------
        // COMANDOS DE CONSOLE (ADMIN)
        // -------------------------------------------------------------
        [ConsoleCommand("horizon.status")]
        private void CmdStatus(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !arg.Player().IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }

            SyncServerStatus("Comando Admin horizon.status");
            arg.ReplyWith("[HorizonCore] Status do servidor enviado para o site com sucesso!");
        }

        [ConsoleCommand("horizon.sync")]
        private void CmdSync(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !arg.Player().IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }

            SendLeaderboardToWeb();
            arg.ReplyWith("[HorizonCore] Sincronização dos Leaderboards com o site solicitada!");
        }

        [ConsoleCommand("horizon.syncall")]
        private void CmdSyncAll(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !arg.Player().IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }

            SyncServerStatus("Comando Admin horizon.syncall");
            SendLeaderboardToWeb();
            arg.ReplyWith("[HorizonCore] Sincronização total (Status + Leaderboards) solicitada!");
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
            arg.ReplyWith("[HorizonCore] Todos os dados do ranking foram reiniciados!");
        }

        [ConsoleCommand("wipe.leaderboard")]
        private void CmdWipeLb(ConsoleSystem.Arg arg)
        {
            CmdReset(arg);
        }

        [ConsoleCommand("horizon.stats")]
        private void CmdStats(ConsoleSystem.Arg arg)
        {
            arg.ReplyWith($"[HorizonCore] Jogadores no Ranking: {data.Players.Count} | Status API: {config.StatusApiUrl} | Leaderboards API: {config.LeaderboardApiUrl}");
        }
    }
}

