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
    [Info("HorizonLeaderboards", "RustHorizon", "1.0.0")]
    [Description("Exporta estatísticas de jogadores (PvP, Recursos e Farming) para o site do Horizon")]
    public class HorizonLeaderboards : RustPlugin
    {
        private Configuration config;
        private StoredData data;

        public class Configuration
        {
            [JsonProperty("UrlDaApiDoSite")]
            public string ApiUrl { get; set; } = "http://SEU_IP_OU_DOMINIO:3000/api/leaderboard";

            [JsonProperty("IntervaloDeSincronizacaoMinutos")]
            public int SyncIntervalMinutes { get; set; } = 5;

            [JsonProperty("NomeDoServidor")]
            public string ServerName { get; set; } = "Horizon 2x Solo/Duo/Trio";
        }

        public class PlayerStats
        {
            public string Name { get; set; } = "";
            public string SteamId { get; set; } = "";
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
            if (data == null) data = new StoredData();

            timer.Every(config.SyncIntervalMinutes * 60f, SendLeaderboardToWeb);
            Puts($"[HorizonLeaderboards] Inicializado com sucesso! Sincronizando a cada {config.SyncIntervalMinutes} minutos.");
        }

        private void Unload()
        {
            SaveData();
        }

        private void SaveData()
        {
            Interface.Oxide.DataFileSystem.WriteObject("HorizonLeaderboards", data);
        }

        private PlayerStats GetOrCreate(BasePlayer player)
        {
            string id = player.UserIDString;
            if (!data.Players.ContainsKey(id))
            {
                data.Players[id] = new PlayerStats
                {
                    SteamId = id,
                    Name = player.displayName
                };
            }
            else
            {
                data.Players[id].Name = player.displayName;
            }
            return data.Players[id];
        }

        // -------------------------------------------------------------
        // HOOKS: PVP
        // -------------------------------------------------------------
        private void OnPlayerDeath(BasePlayer victim, HitInfo info)
        {
            if (victim == null || victim.IsNpc) return;

            // Registra morte
            var victimStats = GetOrCreate(victim);
            victimStats.Deaths++;

            // Registra kill
            if (info?.InitiatorPlayer != null && !info.InitiatorPlayer.IsNpc && info.InitiatorPlayer != victim)
            {
                var killer = info.InitiatorPlayer;
                var killerStats = GetOrCreate(killer);
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

        // -------------------------------------------------------------
        // HOOKS: RECURSOS
        // -------------------------------------------------------------
        private void OnDispenserGather(ResourceDispenser dispenser, BasePlayer player, Item item)
        {
            if (player == null || item == null || player.IsNpc) return;

            var stats = GetOrCreate(player);
            string name = item.info.shortname;

            if (name.Contains("sulfur.ore")) stats.Sulfur += item.amount;
            else if (name.Contains("metal.ore")) stats.Metal += item.amount;
            else if (name.Contains("stones")) stats.Stone += item.amount;
            else if (name.Contains("wood")) stats.Wood += item.amount;
        }

        private void OnCollectiblePickup(Item item, BasePlayer player)
        {
            if (player == null || item == null || player.IsNpc) return;

            var stats = GetOrCreate(player);
            string name = item.info.shortname;

            if (name == "scrap") stats.Scrap += item.amount;
            else if (name.Contains("cloth")) stats.Cloth += item.amount;
        }

        // -------------------------------------------------------------
        // ENVIO HTTP PARA O SITE
        // -------------------------------------------------------------
        [ConsoleCommand("horizon.sync")]
        private void CmdSync(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !arg.Player().IsAdmin) return;
            SendLeaderboardToWeb();
            Puts("[HorizonLeaderboards] Forçando sincronização imediata com o site...");
        }

        private void SendLeaderboardToWeb()
        {
            SaveData();

            // Montar lista PVP
            var pvpList = data.Players.Values
                .OrderByDescending(p => p.Kills)
                .Take(50)
                .Select((p, idx) => {
                    float kd = p.Deaths > 0 ? (float)p.Kills / p.Deaths : p.Kills;
                    float hsPct = p.Kills > 0 ? ((float)p.Headshots / p.Kills) * 100f : 0f;
                    return new {
                        rank = idx + 1,
                        steamid = p.SteamId,
                        name = p.Name,
                        avatar = $"https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg",
                        kd = kd.ToString("0.00"),
                        headshot_pct = $"{hsPct:0.0}%",
                        kills = p.Kills,
                        deaths = p.Deaths,
                        headshots = p.Headshots,
                        distance = $"{(int)p.MaxKillDistance}m"
                    };
                }).ToList();

            // Montar lista Recursos
            var recursosList = data.Players.Values
                .OrderByDescending(p => p.Sulfur + p.Metal + p.Stone + p.Scrap)
                .Take(50)
                .Select((p, idx) => {
                    int total = p.Sulfur + p.Metal + p.Stone + p.Scrap;
                    return new {
                        rank = idx + 1,
                        steamid = p.SteamId,
                        name = p.Name,
                        avatar = $"https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg",
                        total = total.ToString("N0"),
                        sulfur = p.Sulfur.ToString("N0"),
                        metal = p.Metal.ToString("N0"),
                        stone = p.Stone.ToString("N0"),
                        scrap = p.Scrap.ToString("N0")
                    };
                }).ToList();

            // Montar lista Farming
            var farmingList = data.Players.Values
                .OrderByDescending(p => p.Cloth + p.Berries + p.Fish)
                .Take(50)
                .Select((p, idx) => new {
                    rank = idx + 1,
                    steamid = p.SteamId,
                    name = p.Name,
                    avatar = $"https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg",
                    clones = p.Clones.ToString("N0"),
                    berries = p.Berries.ToString("N0"),
                    cloth = p.Cloth.ToString("N0"),
                    fish = p.Fish.ToString("N0"),
                    potatoes = p.Potatoes.ToString("N0")
                }).ToList();

            var payload = new
            {
                server = config.ServerName,
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
                    Puts("[HorizonLeaderboards] Dados enviados com sucesso para o site!");
                }
                else
                {
                    Puts($"[HorizonLeaderboards] Erro ao enviar dados (HTTP {code}): {response}");
                }
            }, this, RequestMethod.POST, headers);
        }
    }
}

