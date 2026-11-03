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
    [Info("HorizonLeaderboards", "RustHorizon", "1.1.0")]
    [Description("Exporta estatísticas de jogadores (PvP, Recursos e Farming) para o site do Horizon")]
    public class HorizonLeaderboards : RustPlugin
    {
        [PluginReference]
        private Plugin ImageLibrary;

        private Configuration config;
        private StoredData data;

        public class Configuration
        {
            [JsonProperty("UrlDaApiDoSite")]
            public string ApiUrl { get; set; } = "https://horizon-rust-br.loca.lt/api/leaderboard";

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

            // Recursos
            public int Sulfur { get; set; } = 0;
            public int Metal { get; set; } = 0;
            public int Stone { get; set; } = 0;
            public int Wood { get; set; } = 0;
            public int Scrap { get; set; } = 0;

            // Farming
            public int Clones { get; set; } = 0;
            public int Berries { get; set; } = 0;
            public int Cloth { get; set; } = 0;
            public int Fish { get; set; } = 0;
            public int Potatoes { get; set; } = 0;
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
            Puts($"Inicializado com sucesso! Sincronizando com '{config.ApiUrl}' a cada {config.SyncIntervalMinutes} minutos. ({data.Players.Count} jogadores registrados neste wipe)");
        }

        private void Unload()
        {
            SaveData();
        }

        private void SaveData()
        {
            Interface.Oxide.DataFileSystem.WriteObject("HorizonLeaderboards", data);
        }

        // Detecta wipe do servidor e limpa ranking para o novo wipe
        private void OnNewSave(string filename)
        {
            Puts("[Wipe Detectado] Arquivando dados do wipe anterior e reiniciando ranking...");
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
            }
            else
            {
                stats.Name = player.displayName;
            }

            // Tenta obter avatar via ImageLibrary se disponível
            if (string.IsNullOrEmpty(stats.Avatar) && ImageLibrary != null && ImageLibrary.IsLoaded)
            {
                try
                {
                    string avatarUrl = ImageLibrary.Call<string>("GetImageURL", id);
                    if (!string.IsNullOrEmpty(avatarUrl))
                    {
                        stats.Avatar = avatarUrl;
                    }
                }
                catch {}
            }

            return stats;
        }

        // -------------------------------------------------------------
        // HOOKS: PVP
        // -------------------------------------------------------------
        private void OnPlayerDeath(BasePlayer victim, HitInfo info)
        {
            if (victim == null || victim.IsNpc) return;

            // Registra morte do jogador
            var victimStats = GetOrCreate(victim);
            if (victimStats != null)
            {
                victimStats.Deaths++;
            }

            // Registra kill do atacante
            if (info?.InitiatorPlayer != null && !info.InitiatorPlayer.IsNpc && info.InitiatorPlayer != victim)
            {
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
        // HOOKS: RECURSOS
        // -------------------------------------------------------------
        // Mineração e Coleta por ferramentas
        private void OnDispenserGather(ResourceDispenser dispenser, BaseEntity entity, Item item)
        {
            if (item == null || entity == null) return;
            var player = entity.ToPlayer();
            if (player == null || player.IsNpc) return;

            ProcessResourceItem(player, item);
        }

        // Bônus final da árvore ou pedra
        private void OnDispenserBonus(ResourceDispenser dispenser, BasePlayer player, Item item)
        {
            if (player == null || player.IsNpc || item == null) return;
            ProcessResourceItem(player, item);
        }

        // Coleta de minérios ou plantas soltos no chão
        private void OnCollectiblePickup(CollectibleEntity collectible, BasePlayer player)
        {
            if (player == null || player.IsNpc || collectible?.itemList == null) return;

            var stats = GetOrCreate(player);
            if (stats == null) return;

            foreach (var itemAmount in collectible.itemList)
            {
                if (itemAmount?.itemDef == null) continue;
                string sname = itemAmount.itemDef.shortname;
                int amount = (int)itemAmount.amount;

                if (sname.Contains("sulfur.ore")) stats.Sulfur += amount;
                else if (sname.Contains("metal.ore")) stats.Metal += amount;
                else if (sname.Contains("stones")) stats.Stone += amount;
                else if (sname.Contains("wood")) stats.Wood += amount;
                else if (sname == "scrap") stats.Scrap += amount;
                else if (sname.Contains("cloth")) stats.Cloth += amount;
                else if (sname.Contains("berry")) stats.Berries += amount;
                else if (sname.Contains("potato")) stats.Potatoes += amount;
            }
        }

        // Pegar item solto do chão
        private void OnItemPickup(Item item, BasePlayer player)
        {
            if (player == null || player.IsNpc || item == null) return;
            ProcessResourceItem(player, item);
        }

        private void ProcessResourceItem(BasePlayer player, Item item)
        {
            var stats = GetOrCreate(player);
            if (stats == null) return;

            string sname = item.info.shortname;
            int amount = item.amount;

            if (sname.Contains("sulfur.ore")) stats.Sulfur += amount;
            else if (sname.Contains("metal.ore")) stats.Metal += amount;
            else if (sname.Contains("stones")) stats.Stone += amount;
            else if (sname.Contains("wood")) stats.Wood += amount;
            else if (sname == "scrap") stats.Scrap += amount;
            else if (sname.Contains("cloth")) stats.Cloth += amount;
            else if (sname.Contains("berry")) stats.Berries += amount;
            else if (sname.Contains("potato")) stats.Potatoes += amount;
            else if (sname.Contains("clone.")) stats.Clones += amount;
        }

        // -------------------------------------------------------------
        // HOOKS: FARMING & PESCA
        // -------------------------------------------------------------
        // Colheita de plantações (Hemp/Cloth, Berries, Potatoes, etc.)
        private void OnGrowableGathered(GrowableEntity growable, Item item, BasePlayer player)
        {
            if (player == null || player.IsNpc || item == null) return;
            var stats = GetOrCreate(player);
            if (stats == null) return;

            string sname = item.info.shortname;
            int amount = item.amount;

            if (sname.Contains("cloth")) stats.Cloth += amount;
            else if (sname.Contains("berry")) stats.Berries += amount;
            else if (sname.Contains("potato")) stats.Potatoes += amount;
            else if (sname.Contains("clone.")) stats.Clones += amount;
        }

        // Pesca bem sucedida
        private void OnFishCatch(Item item, BasePlayer player)
        {
            if (player == null || player.IsNpc || item == null) return;
            var stats = GetOrCreate(player);
            if (stats == null) return;

            stats.Fish += item.amount > 0 ? item.amount : 1;
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
            arg.ReplyWith("[HorizonLeaderboards] Sincronização manual com o site solicitada!");
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
            arg.ReplyWith("[HorizonLeaderboards] Todos os dados do ranking foram reiniciados com sucesso!");
        }

        [ConsoleCommand("horizon.stats")]
        private void CmdStats(ConsoleSystem.Arg arg)
        {
            arg.ReplyWith($"[HorizonLeaderboards] Total de jogadores no wipe: {data.Players.Count}. URL da API: {config.ApiUrl}");
        }

        // -------------------------------------------------------------
        // ENVIO HTTP PARA O SITE
        // -------------------------------------------------------------
        private void SendLeaderboardToWeb()
        {
            SaveData();

            int limit = config.TopPlayersLimit > 0 ? config.TopPlayersLimit : 100;

            // 1. PVP (Ordenado por Kills, desempate por KD)
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

            // 2. RECURSOS (Ordenado por Total Coletado)
            var recursosList = data.Players.Values
                .Select(p => new {
                    Player = p,
                    Total = p.Sulfur + p.Metal + p.Stone + p.Wood + p.Scrap
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
                        sulfur = p.Sulfur.ToString("N0"),
                        metal = p.Metal.ToString("N0"),
                        stone = p.Stone.ToString("N0"),
                        wood = p.Wood.ToString("N0"),
                        scrap = p.Scrap.ToString("N0")
                    };
                }).ToList();

            // 3. FARMING (Ordenado por Total Farming)
            var farmingList = data.Players.Values
                .Select(p => new {
                    Player = p,
                    Total = p.Clones + p.Berries + p.Cloth + p.Fish + p.Potatoes
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
                        clones = p.Clones.ToString("N0"),
                        berries = p.Berries.ToString("N0"),
                        cloth = p.Cloth.ToString("N0"),
                        fish = p.Fish.ToString("N0"),
                        potatoes = p.Potatoes.ToString("N0")
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
