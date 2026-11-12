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
    [Info("HorizonCore", "RustHorizon", "3.0.0")]
    [Description("Plugin Mestre Unificado: Status do Servidor em Tempo Real, Leaderboards (PvP, Recursos, Farming, Raid) e Sistema Completo de VIPs")]
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
        private Timer vipSyncTimer;
        private Timer vipExpiryTimer;

        // Cache em memória de avatares já buscados nesta sessão (steamid → url)
        private readonly Dictionary<string, string> avatarCache = new Dictionary<string, string>();

        // Rastreamento de quem derrubou (wounded) cada jogador para creditar o kill se ele sangrar ou der F1 kill
        private readonly Dictionary<ulong, ulong> lastWoundAttacker = new Dictionary<ulong, ulong>();

        // -------------------------------------------------------------
        // CONFIGURAÇÃO UNIFICADA (STATUS + LEADERBOARDS + VIPS)
        // -------------------------------------------------------------
        public class Configuration
        {
            // === MÓDULO 1: STATUS DO SERVIDOR ===
            [JsonProperty("Status_UrlDaApiDoSite")]
            public string StatusApiUrl { get; set; } = "https://www.rusthorizon.shop/api/status";

            [JsonProperty("Status_IntervaloSegundos")]
            public int StatusSyncIntervalSeconds { get; set; } = 30;

            [JsonProperty("Status_ApiKey")]
            public string ApiKey { get; set; } = "horizon_live_server_secret";

            [JsonProperty("Status_CronogramaWipeMapa")]
            public string MapWipeSchedule { get; set; } = "Quartas às 18:00h e Sábados às 12:00h";

            [JsonProperty("Status_CronogramaWipeFull")]
            public string FullWipeSchedule { get; set; } = "1ª Quinta-feira do mês às 17:00h";

            [JsonProperty("Status_NomeDoServidor")]
            public string ServerName { get; set; } = "[BR/LATAM] HORIZON 2X | SOLO/DUO/TRIO/QUAD";

            [JsonProperty("Status_LimitePorTime")]
            public string TeamLimit { get; set; } = "(Max 4)";

            // === MÓDULO 2: LEADERBOARD & ESTATÍSTICAS ===
            [JsonProperty("Leaderboard_UrlDaApiDoSite")]
            public string LeaderboardApiUrl { get; set; } = "https://www.rusthorizon.shop/api/leaderboard";

            [JsonProperty("Leaderboard_IntervaloMinutos")]
            public int LeaderboardSyncIntervalMinutes { get; set; } = 5;

            [JsonProperty("Leaderboard_LimiteJogadoresPorAba")]
            public int TopPlayersLimit { get; set; } = 100;

            // === MÓDULO 3: VIPS & LOJA AUTOMÁTICA (MERCADO PAGO) ===
            [JsonProperty("Vip_Habilitado")]
            public bool VipEnabled { get; set; } = true;

            [JsonProperty("Vip_ApiBaseUrl")]
            public string VipApiBaseUrl { get; set; } = "https://www.rusthorizon.shop";

            [JsonProperty("Vip_IntervaloSegundos")]
            public int VipSyncIntervalSeconds { get; set; } = 30;

            [JsonProperty("Vip_CriarGruposAutomaticamente")]
            public bool VipAutoCreateGroups { get; set; } = true;

            [JsonProperty("Vip_Grupos")]
            public Dictionary<string, string> VipGroups { get; set; } = new Dictionary<string, string>
            {
                { "bronze", "vip_bronze" },
                { "sobrevivente", "vip_bronze" },
                { "prata", "vip_prata" },
                { "ouro", "vip_ouro" },
                { "farmer", "kit_farmer" },
                { "airdrop", "kit_drop" },
                { "cartao", "kit_cartao" },
                { "eletrica", "kit_eletrica" }
            };

            [JsonProperty("Vip_PermissoesPorTier")]
            public Dictionary<string, List<string>> VipTierPermissions { get; set; } = new Dictionary<string, List<string>>
            {
                { "bronze", new List<string> { "kits.bronze", "kits.vipbronze", "skippriority.vip" } },
                { "sobrevivente", new List<string> { "kits.bronze", "kits.vipbronze", "skippriority.vip" } },
                { "prata", new List<string> { "kits.prata", "kits.vipprata", "skippriority.vip" } },
                { "ouro", new List<string> { "kits.ouro", "kits.vipouro", "skippriority.vip" } },
                { "farmer", new List<string> { "kits.farmer" } },
                { "airdrop", new List<string> { "kits.drop" } },
                { "cartao", new List<string> { "kits.cartao" } },
                { "eletrica", new List<string> { "kits.eletrica" } }
            };

            [JsonProperty("Vip_ComandosAoAtivar")]
            public Dictionary<string, List<string>> VipActivationCommands { get; set; } = new Dictionary<string, List<string>>
            {
                { "bronze", new List<string>() },
                { "sobrevivente", new List<string>() },
                { "prata", new List<string>() },
                { "ouro", new List<string>() },
                { "farmer", new List<string>() },
                { "airdrop", new List<string>() },
                { "cartao", new List<string>() },
                { "eletrica", new List<string>() }
            };

            [JsonProperty("Vip_ComandosAoExpirar")]
            public Dictionary<string, List<string>> VipRevocationCommands { get; set; } = new Dictionary<string, List<string>>
            {
                { "bronze", new List<string>() },
                { "sobrevivente", new List<string>() },
                { "prata", new List<string>() },
                { "ouro", new List<string>() },
                { "farmer", new List<string>() },
                { "airdrop", new List<string>() },
                { "cartao", new List<string>() },
                { "eletrica", new List<string>() }
            };

            [JsonProperty("Vip_PrefixoChat")]
            public string VipChatPrefix { get; set; } = "<color=#D7573B>[HORIZON VIP]</color>";

            // === GERAL ===
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
            public int TcsDestroyed { get; set; } = 0;
            public int StructuresDestroyed { get; set; } = 0;
            public int DoorsDestroyed { get; set; } = 0;
        }

        // -------------------------------------------------------------
        // DADOS DO SISTEMA VIP
        // -------------------------------------------------------------
        public class VipRecord
        {
            public string SteamId { get; set; } = "";
            public string PlayerName { get; set; } = "";
            public string Tier { get; set; } = "";
            public string GroupName { get; set; } = "";
            public string KitPermission { get; set; } = "";
            public string OrderId { get; set; } = "";
            public DateTime ActivatedAt { get; set; }
            public DateTime ExpiresAt { get; set; }
            public bool IsActive { get; set; } = true;
        }

        public class StoredData
        {
            public Dictionary<string, PlayerStats> Players { get; set; } = new Dictionary<string, PlayerStats>();
            public Dictionary<string, VipRecord> ActiveVips { get; set; } = new Dictionary<string, VipRecord>();
            public List<VipRecord> ExpiredHistory { get; set; } = new List<VipRecord>();
            public HashSet<string> ProcessedOrders { get; set; } = new HashSet<string>();
        }

        // Payloads de entrega da API VIP
        public class PendingDelivery
        {
            public string orderId { get; set; }
            public string paymentId { get; set; }
            public string steamId { get; set; }
            public string playerName { get; set; }
            public string vipTier { get; set; }
            public string groupName { get; set; }
            public string kitPermission { get; set; }
            public string expiresAt { get; set; }
            public int durationDays { get; set; }
        }

        public class PendingResponse
        {
            public bool success { get; set; }
            public int count { get; set; }
            public List<PendingDelivery> deliveries { get; set; }
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
            // Salva dados unificados sob HorizonCore e mantém espelho em HorizonLeaderboards / HorizonVIP
            Interface.Oxide.DataFileSystem.WriteObject("HorizonCore", data);
            Interface.Oxide.DataFileSystem.WriteObject("HorizonLeaderboards", new { Players = data.Players });
            Interface.Oxide.DataFileSystem.WriteObject("HorizonVIP", new {
                ActiveVips = data.ActiveVips,
                ExpiredHistory = data.ExpiredHistory,
                ProcessedOrders = data.ProcessedOrders
            });
        }

        // -------------------------------------------------------------
        // INICIALIZAÇÃO E FINALIZAÇÃO
        // -------------------------------------------------------------
        private void Loaded()
        {
            LoadConfig();

            // Carrega dados persistidos (tenta HorizonCore primeiro, depois migra de HorizonLeaderboards / HorizonVIP)
            data = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonCore");
            if (data == null)
            {
                data = new StoredData();
            }
            if (data.Players == null) data.Players = new Dictionary<string, PlayerStats>();
            if (data.ActiveVips == null) data.ActiveVips = new Dictionary<string, VipRecord>();
            if (data.ExpiredHistory == null) data.ExpiredHistory = new List<VipRecord>();
            if (data.ProcessedOrders == null) data.ProcessedOrders = new HashSet<string>();

            // Migração transparente de arquivos legados de dados
            try
            {
                var legacyLb = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonLeaderboards");
                if (legacyLb != null && legacyLb.Players != null && legacyLb.Players.Count > 0)
                {
                    foreach (var kv in legacyLb.Players)
                    {
                        if (!data.Players.ContainsKey(kv.Key)) data.Players[kv.Key] = kv.Value;
                    }
                }
            }
            catch {}

            try
            {
                var legacyVip = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonVIP");
                if (legacyVip != null && legacyVip.ActiveVips != null && legacyVip.ActiveVips.Count > 0)
                {
                    foreach (var kv in legacyVip.ActiveVips)
                    {
                        if (!data.ActiveVips.ContainsKey(kv.Key)) data.ActiveVips[kv.Key] = kv.Value;
                    }
                    if (legacyVip.ProcessedOrders != null)
                    {
                        foreach (var ord in legacyVip.ProcessedOrders) data.ProcessedOrders.Add(ord);
                    }
                }
            }
            catch {}

            // Comandos de Chat
            cmd.AddChatCommand("ranking", this, nameof(CmdChatRank));
            cmd.AddChatCommand("top", this, nameof(CmdChatRank));
            cmd.AddChatCommand("vip", this, nameof(CmdChatVip));
        }

        private void OnServerInitialized()
        {
            // === 1. MÓDULO STATUS ===
            timer.Once(3f, () => SyncServerStatus("Inicialização do Servidor"));
            int statusInterval = Math.Max(15, config.StatusSyncIntervalSeconds);
            statusTimer = timer.Every(statusInterval, () => SyncServerStatus("Rotina Periódica"));

            // === 2. MÓDULO LEADERBOARD ===
            int lbInterval = Math.Max(1, config.LeaderboardSyncIntervalMinutes);
            leaderboardTimer = timer.Every(lbInterval * 60f, SendLeaderboardToWeb);
            timer.Once(6f, SendLeaderboardToWeb);

            // === 3. MÓDULO VIP ===
            if (config.VipEnabled)
            {
                if (config.VipAutoCreateGroups)
                {
                    foreach (var kv in config.VipGroups)
                    {
                        if (!permission.GroupExists(kv.Value))
                        {
                            permission.CreateGroup(kv.Value, kv.Value, 0);
                            Puts($"[HorizonCore] Grupo Oxide '{kv.Value}' criado automaticamente.");
                        }
                    }
                }

                int vipInterval = Math.Max(10, config.VipSyncIntervalSeconds);
                vipSyncTimer = timer.Every(vipInterval, CheckPendingDeliveries);
                vipExpiryTimer = timer.Every(300f, CheckVipExpirations);

                // Verificação inicial
                timer.Once(5f, CheckPendingDeliveries);
                CheckVipExpirations();
            }

            Puts($"=============================================================");
            Puts($"[HorizonCore v3.0.0] Plugin MESTRE inicializado com sucesso!");
            Puts($"• Status do Servidor: '{config.StatusApiUrl}' ({statusInterval}s)");
            Puts($"• Leaderboards & PvP: '{config.LeaderboardApiUrl}' ({lbInterval}m, {data.Players.Count} players)");
            Puts($"• Sistema de VIPs:    '{config.VipApiBaseUrl}' (Ativo: {config.VipEnabled}, {data.ActiveVips.Count} VIPs)");
            Puts($"=============================================================");

            // Buscar avatares pendentes de jogadores já registrados
            foreach (var kv in data.Players)
            {
                if (string.IsNullOrEmpty(kv.Value.Avatar))
                {
                    FetchSteamAvatar(kv.Key, kv.Value);
                }
            }
        }

        private void OnServerShutdown()
        {
            statusTimer?.Destroy();
            debounceStatusTimer?.Destroy();
            leaderboardTimer?.Destroy();
            vipSyncTimer?.Destroy();
            vipExpiryTimer?.Destroy();

            SyncServerStatus("Servidor Desligando / Reiniciando");
            SendLeaderboardToWeb();
            SaveData();
        }

        private void Unload()
        {
            statusTimer?.Destroy();
            debounceStatusTimer?.Destroy();
            leaderboardTimer?.Destroy();
            vipSyncTimer?.Destroy();
            vipExpiryTimer?.Destroy();

            SaveData();
        }
        private void OnNewSave(string filename)
        {
            Puts($"[HorizonCore] Novo wipe detectado (Save: {filename})! Arquivando ranking do wipe anterior e reiniciando ranking...");
            try
            {
                string archiveName = $"HorizonLeaderboards_Wipe_{DateTime.UtcNow:yyyyMMdd_HHmmss}";
                Interface.Oxide.DataFileSystem.WriteObject(archiveName, new { Players = data.Players });
            }
            catch (Exception ex)
            {
                PrintError($"[HorizonCore] Erro ao arquivar wipe anterior: {ex.Message}");
            }

            data.Players.Clear();
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

            // Se o jogador possui VIP ativo, avisa com boas-vindas
            if (data.ActiveVips.TryGetValue(id, out var vip) && vip.IsActive && vip.ExpiresAt > DateTime.UtcNow)
            {
                timer.Once(5f, () =>
                {
                    if (player != null && player.IsConnected)
                    {
                        string tierFormatado = vip.Tier == "bronze" ? "Bronze" : (vip.Tier == "prata" ? "Prata" : (vip.Tier == "ouro" ? "Ouro" : char.ToUpper(vip.Tier[0]) + vip.Tier.Substring(1)));
                        PrintToChat(player, $"{config.VipChatPrefix} Bem-vindo de volta! Seu <color=#F59E0B>VIP {tierFormatado}</color> está ativo.\n" +
                                           $"- Use <color=#F59E0B>/kit</color> para resgatar seus itens!\n" +
                                           $"- Digite <color=#F59E0B>/vip</color> para consultar seu tempo restante.");
                    }
                });
            }

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
        private void FetchSteamAvatar(string steamId)
        {
            if (string.IsNullOrEmpty(steamId)) return;
            if (data.Players.TryGetValue(steamId, out var stats))
            {
                FetchSteamAvatar(steamId, stats);
            }
        }

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

                int players = 0;
                if (BasePlayer.activePlayerList != null)
                {
                    for (int i = 0; i < BasePlayer.activePlayerList.Count; i++)
                    {
                        var p = BasePlayer.activePlayerList[i];
                        if (p != null && p.IsConnected && !p.IsNpc && p.net != null && p.net.connection != null)
                        {
                            players++;
                        }
                    }
                }
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
        private void OnPlayerWound(BasePlayer victim, HitInfo info)
        {
            if (victim == null || victim.IsNpc) return;
            BasePlayer attacker = ResolveAttacker(victim, info);
            if (attacker != null && !attacker.IsNpc && attacker != victim)
            {
                lastWoundAttacker[victim.userID] = attacker.userID;
            }
        }

        private void OnPlayerRecovered(BasePlayer victim)
        {
            if (victim != null)
            {
                lastWoundAttacker.Remove(victim.userID);
            }
        }

        private BasePlayer ResolveAttacker(BasePlayer victim, HitInfo info)
        {
            if (victim == null) return null;

            // Ignorar suicídios, comando /kill ou console 'kill'
            if (info != null && (info.damageTypes.Has(Rust.DamageType.Suicide) || info.InitiatorPlayer == victim))
            {
                return null;
            }

            // 1. Atacante direto no HitInfo
            if (info?.InitiatorPlayer != null && !info.InitiatorPlayer.IsNpc && info.InitiatorPlayer != victim)
            {
                return info.InitiatorPlayer;
            }

            // 2. Iniciador como entidade disparada por outro jogador (foguete, C4, flecha, granada, torreta, armadilha)
            if (info?.Initiator != null)
            {
                var p = info.Initiator as BasePlayer 
                        ?? info.Initiator.ToPlayer() 
                        ?? (info.Initiator as BaseEntity)?.creatorEntity as BasePlayer;
                if (p != null && !p.IsNpc && p != victim)
                {
                    return p;
                }
            }

            // 3. Fallback para lastAttacker caso seja outro jogador
            if (victim.lastAttacker != null)
            {
                var p = victim.lastAttacker as BasePlayer 
                        ?? victim.lastAttacker.ToPlayer() 
                        ?? (victim.lastAttacker as BaseEntity)?.creatorEntity as BasePlayer;
                if (p != null && !p.IsNpc && p != victim)
                {
                    return p;
                }
            }

            return null;
        }

        private void OnEntityDeath(BaseCombatEntity entity, HitInfo info)
        {
            if (entity == null) return;

            // 1. REGISTRO DE RAID: DESTRUIÇÃO DE TOOL CUPBOARD (TC / Armário de Ferramentas)
            if (entity is BuildingPrivlidge || (entity.ShortPrefabName != null && entity.ShortPrefabName.Contains("cupboard.tool")))
            {
                BasePlayer attacker = info?.InitiatorPlayer;
                if (attacker == null && info?.Initiator != null)
                {
                    attacker = info.Initiator as BasePlayer;
                }

                if (attacker != null && !attacker.IsNpc)
                {
                    // Regra anti-exploit: não pontua se o jogador destruir seu próprio TC ou se o TC não tinha dono
                    ulong ownerId = entity.OwnerID;
                    if (ownerId != 0 && ownerId != attacker.userID)
                    {
                        var attackerStats = GetOrCreate(attacker);
                        if (attackerStats != null)
                        {
                            attackerStats.TcsDestroyed++;
                            if (config.LogToConsole)
                            {
                                Puts($"[HorizonCore RAID] TC destruído por {attacker.displayName}! Total TCs: {attackerStats.TcsDestroyed}");
                            }
                        }
                    }
                }
                return;
            }

            // 2. REGISTRO DE PVP (MORTES E KILLS ENTRE JOGADORES)
            var victim = entity as BasePlayer;
            if (victim == null || victim.IsNpc) return;

            // REGRA: Mortes por /kill, console kill ou suicídio NÃO contam no PvP
            if (info != null && (info.damageTypes.Has(Rust.DamageType.Suicide) || info.InitiatorPlayer == victim))
            {
                lastWoundAttacker.Remove(victim.userID);
                return;
            }

            BasePlayer killer = ResolveAttacker(victim, info);

            // REGRA: Apenas conta MORTE em PvP e KILL se a vítima foi FINALIZADA por outro jogador real
            if (killer != null && !killer.IsNpc && killer != victim)
            {
                var victimStats = GetOrCreate(victim);
                if (victimStats != null)
                {
                    victimStats.Deaths++;
                }

                var killerStats = GetOrCreate(killer);
                if (killerStats != null)
                {
                    killerStats.Kills++;
                    if (info != null && info.isHeadshot) killerStats.Headshots++;

                    float dist = Vector3.Distance(killer.transform.position, victim.transform.position);
                    if (dist > killerStats.MaxKillDistance)
                    {
                        killerStats.MaxKillDistance = dist;
                    }

                    if (config.LogToConsole)
                    {
                        Puts($"[HorizonCore PVP] Finalização registrada: {killer.displayName} matou {victim.displayName} (Kills: {killerStats.Kills} | Mortes da Vítima: {victimStats?.Deaths})");
                    }
                }
            }

            // Limpa registro de ferimento
            lastWoundAttacker.Remove(victim.userID);
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
                    Puts($"[HorizonCore] Leaderboards enviados com sucesso para o site! ({data.Players.Count} jogadores sincronizados)");
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

        private static readonly System.Globalization.NumberFormatInfo ptBrFormat = new System.Globalization.NumberFormatInfo
        {
            NumberGroupSeparator = ".",
            NumberDecimalSeparator = ",",
            NumberGroupSizes = new int[] { 3 }
        };

        private string FormatNumber(long num)
        {
            return num.ToString("N0", ptBrFormat);
        }

        private string CleanPlayerName(string rawName)
        {
            if (string.IsNullOrEmpty(rawName)) return "Sobrevivente";
            string clean = rawName.Replace("<", "").Replace(">", "").Trim();
            if (string.IsNullOrEmpty(clean)) return "Sobrevivente";
            if (clean.Length > 14) clean = clean.Substring(0, 14) + "..";
            return clean;
        }

        private string GetRankBadge(int pos)
        {
            switch (pos)
            {
                case 1: return "<color=#F59E0B><b>#1</b></color>";
                case 2: return "<color=#CBD5E1><b>#2</b></color>";
                case 3: return "<color=#CD7F32><b>#3</b></color>";
                default: return $"<color=#94A3B8><b>#{pos}</b></color>";
            }
        }

        [ChatCommand("rank")]
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
                if (sub == "ajuda" || sub == "help" || sub == "?")
                {
                    SendReply(player, "<color=#82ADA4><b>[HORIZON RANKING]</b></color>\n" +
                                      "<color=#EDE8E5>/rank</color> <color=#71717A>- Top 3 geral</color>\n" +
                                      "<color=#EDE8E5>/rank pvp</color> <color=#71717A>- Top 5 PVP</color>\n" +
                                      "<color=#EDE8E5>/rank recursos</color> <color=#71717A>- Top 5 Recursos</color>\n" +
                                      "<color=#EDE8E5>/rank farming</color> <color=#71717A>- Top 5 Farming</color>\n" +
                                      "<color=#EDE8E5>/rank raid</color> <color=#71717A>- Top 5 Raids</color>");
                    return;
                }
            }

            ShowAllTop3(player);
        }

        private void ShowAllTop3(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#82ADA4><b>====== [ TOP 3 HORIZON ] ======</b></color>");
            sb.AppendLine();

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
                sb.AppendLine("<color=#71717A>Nenhum dado registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topPvp.Count; i++)
                {
                    var p = topPvp[i];
                    float kd = p.Deaths > 0 ? (float)p.Kills / p.Deaths : p.Kills;
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#F87171><b>{p.Kills}</b> kills</color> <color=#71717A>(K/D: {kd:0.00})</color>");
                }
            }
            sb.AppendLine();

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
                sb.AppendLine("<color=#71717A>Nenhum recurso coletado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topRec.Count; i++)
                {
                    var x = topRec[i];
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(x.Player.Name)}</color> - <color=#FDE047><b>{FormatNumber(x.Total)}</b></color>");
                }
            }
            sb.AppendLine();

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
                sb.AppendLine("<color=#71717A>Nenhum farm registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topFarm.Count; i++)
                {
                    var x = topFarm[i];
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(x.Player.Name)}</color> - <color=#86EFAC><b>{FormatNumber(x.Total)}</b> itens</color>");
                }
            }
            sb.AppendLine();

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
                sb.AppendLine("<color=#71717A>Nenhum raid registrado neste wipe.</color>");
            }
            else
            {
                for (int i = 0; i < topRaid.Count; i++)
                {
                    var x = topRaid[i];
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(x.Player.Name)}</color> - <color=#FDBA74><b>{FormatNumber(x.TotalScore)} pts</b></color> <color=#71717A>({FormatNumber(x.TotalExplosives)} exp)</color>");
                }
            }
            sb.AppendLine();

            sb.AppendLine("<color=#82ADA4>================================</color>");
            sb.AppendLine("<color=#94A3B8>Site: <color=#38BDF8>www.rusthorizon.shop</color></color>");

            SendReply(player, sb.ToString());
        }

        private void ShowPvpTop(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#EF4444><b>======= [ TOP 5 PVP ] =======</b></color>");
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
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#F87171><b>{p.Kills}</b> K</color> / <color=#94A3B8>{p.Deaths} D</color> <color=#71717A>(K/D {kd:0.00} | HS {hsPct:0}%)</color>");
                }
            }
            sb.AppendLine("<color=#EF4444>=============================</color>");
            SendReply(player, sb.ToString());
        }

        private void ShowRecursosTop(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#EAB308><b>===== [ TOP 5 RECURSOS ] =====</b></color>");
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
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#FDE047><b>{FormatNumber(x.Total)}</b></color>\n  <color=#71717A>Mad: {FormatNumber(p.Wood)} | Ped: {FormatNumber(p.Stone)} | Met: {FormatNumber(p.Metal)} | Enx: {FormatNumber(p.Sulfur)}</color>");
                }
            }
            sb.AppendLine("<color=#EAB308>==============================</color>");
            SendReply(player, sb.ToString());
        }

        private void ShowFarmingTop(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#22C55E><b>===== [ TOP 5 FARMING ] =====</b></color>");
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
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#86EFAC><b>{FormatNumber(x.Total)} itens</b></color>\n  <color=#71717A>Tecido: {FormatNumber(p.Cloth)} | Comida: {FormatNumber(p.Pumpkin + p.Corn + p.Potato)}</color>");
                }
            }
            sb.AppendLine("<color=#22C55E>==============================</color>");
            SendReply(player, sb.ToString());
        }

        private void ShowRaidTop(BasePlayer player)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("<color=#F97316><b>====== [ TOP 5 RAID ] ======</b></color>");
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
                    sb.AppendLine($"{GetRankBadge(i + 1)} <color=#EDE8E5>{CleanPlayerName(p.Name)}</color> - <color=#FDBA74><b>{FormatNumber(x.TotalScore)} pts</b></color>\n  <color=#71717A>C4: {p.C4Used} | Foguetes: {p.RocketsUsed} | Satchel: {p.SatchelsUsed}</color>");
                }
            }
            sb.AppendLine("<color=#F97316>============================</color>");
            SendReply(player, sb.ToString());
        }

        // -------------------------------------------------------------
        // COMANDOS DE CONSOLE (ADMIN)
        // -------------------------------------------------------------
        [ConsoleCommand("horizon.status")]
        private void CmdStatus(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin)
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
            if (!arg.IsAdmin)
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
            if (!arg.IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }

            SyncServerStatus("Comando Admin horizon.syncall");
            SendLeaderboardToWeb();
            if (config.VipEnabled)
            {
                CheckPendingDeliveries();
            }
            arg.ReplyWith("[HorizonCore] Sincronização total (Status + Leaderboards + VIPs) solicitada!");
        }

        [ConsoleCommand("horizon.reset")]
        private void CmdReset(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }

            data.Players.Clear();
            SaveData();
            SendLeaderboardToWeb();
            arg.ReplyWith("[HorizonCore] Todos os dados do ranking deste wipe foram reiniciados e sincronizados com o site!");
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

        [ConsoleCommand("horizon.addkills")]
        private void CmdConsoleAddKills(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }
            if (!arg.HasArgs(2))
            {
                arg.ReplyWith("Uso: horizon.addkills <steamid ou nome> <quantidade>");
                return;
            }

            string target = arg.GetString(0);
            int amount = arg.GetInt(1, 0);

            PlayerStats stats = null;
            if (!data.Players.TryGetValue(target, out stats))
            {
                foreach (var p in data.Players.Values)
                {
                    if (p.Name != null && p.Name.IndexOf(target, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        stats = p;
                        break;
                    }
                }
            }

            if (stats == null)
            {
                arg.ReplyWith($"[HorizonCore] Jogador '{target}' não encontrado nos dados deste wipe.");
                return;
            }

            stats.Kills += amount;
            if (stats.Kills < 0) stats.Kills = 0;
            SaveData();
            SendLeaderboardToWeb();
            arg.ReplyWith($"[HorizonCore] Atualizado: {stats.Name} agora possui {stats.Kills} kills no ranking!");
        }

        [ConsoleCommand("horizon.setkills")]
        private void CmdConsoleSetKills(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }
            if (!arg.HasArgs(2))
            {
                arg.ReplyWith("Uso: horizon.setkills <steamid ou nome> <quantidade>");
                return;
            }

            string target = arg.GetString(0);
            int amount = arg.GetInt(1, 0);

            PlayerStats stats = null;
            if (!data.Players.TryGetValue(target, out stats))
            {
                foreach (var p in data.Players.Values)
                {
                    if (p.Name != null && p.Name.IndexOf(target, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        stats = p;
                        break;
                    }
                }
            }

            if (stats == null)
            {
                arg.ReplyWith($"[HorizonCore] Jogador '{target}' não encontrado nos dados deste wipe.");
                return;
            }

            stats.Kills = Math.Max(0, amount);
            SaveData();
            SendLeaderboardToWeb();
            arg.ReplyWith($"[HorizonCore] Definido: {stats.Name} agora possui {stats.Kills} kills no ranking!");
        }

        [ConsoleCommand("horizon.setdeaths")]
        private void CmdConsoleSetDeaths(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }
            if (!arg.HasArgs(2))
            {
                arg.ReplyWith("Uso: horizon.setdeaths <steamid ou nome> <quantidade>");
                return;
            }

            string target = arg.GetString(0);
            int amount = arg.GetInt(1, 0);

            PlayerStats stats = null;
            if (!data.Players.TryGetValue(target, out stats))
            {
                foreach (var p in data.Players.Values)
                {
                    if (p.Name != null && p.Name.IndexOf(target, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        stats = p;
                        break;
                    }
                }
            }

            if (stats == null)
            {
                arg.ReplyWith($"[HorizonCore] Jogador '{target}' não encontrado nos dados deste wipe.");
                return;
            }

            stats.Deaths = Math.Max(0, amount);
            SaveData();
            SendLeaderboardToWeb();
            arg.ReplyWith($"[HorizonCore] Definido: {stats.Name} agora possui {stats.Deaths} mortes em PvP no ranking!");
        }
    
        // =========================================================================
        // MÓDULO VIP: SISTEMA DE ENTREGA E EXPIRAÇÃO
        // =========================================================================

        private void CheckPendingDeliveries()
        {
            if (!config.VipEnabled) return;

            string url = $"{config.VipApiBaseUrl.TrimEnd('/')}/api/vip/pending";

            webrequest.Enqueue(url, null, (code, response) =>
            {
                if (code != 200 || string.IsNullOrEmpty(response))
                {
                    return;
                }

                try
                {
                    var result = JsonConvert.DeserializeObject<PendingResponse>(response);
                    if (result != null && result.deliveries != null && result.deliveries.Count > 0)
                    {
                        Puts($"[HorizonVIP] {result.deliveries.Count} entrega(s) pendente(s) encontrada(s). Processando...");
                        foreach (var delivery in result.deliveries)
                        {
                            GrantVip(delivery);
                        }
                    }
                }
                catch (Exception ex)
                {
                    PrintError($"[HorizonVIP] Erro ao processar entregas pendentes: {ex.Message}");
                }
            }, this, RequestMethod.GET, new Dictionary<string, string> { { "User-Agent", "HorizonCore-Rust" } });
        }

        private void GrantVip(PendingDelivery delivery)
        {
            if (delivery == null || string.IsNullOrEmpty(delivery.steamId)) return;

            if (!string.IsNullOrEmpty(delivery.orderId) && data.ProcessedOrders.Contains(delivery.orderId))
            {
                ConfirmDelivery(delivery.orderId);
                return;
            }

            string steamId = delivery.steamId;
            string tier = (delivery.vipTier ?? "bronze").ToLower().Trim();
            if (tier == "sobrevivente" || tier == "vip_sobrevivente" || tier == "vip-sobrevivente" || tier == "vip_bronze" || tier == "vip-bronze" || tier == "vipbronze") tier = "bronze";
            if (tier == "vip_prata" || tier == "vip-prata" || tier == "vipprata") tier = "prata";
            if (tier == "vip_ouro" || tier == "vip-ouro" || tier == "vipouro") tier = "ouro";
            if (tier == "kit-farmer" || tier == "kit_farmer") tier = "farmer";
            if (tier == "kit-airdrop" || tier == "kit_airdrop" || tier == "drop" || tier == "kit-drop") tier = "airdrop";
            if (tier == "kit-cartao" || tier == "kit_cartao" || tier == "cards" || tier == "cartoes") tier = "cartao";
            if (tier == "kit-eletrica" || tier == "kit_eletrica" || tier == "eletrico") tier = "eletrica";

            // Localiza jogador para obter o nome real no jogo
            BasePlayer player = null;
            if (ulong.TryParse(steamId, out ulong parsedUserId))
            {
                player = BasePlayer.FindByID(parsedUserId);
                if (player == null) player = BasePlayer.FindSleeping(parsedUserId);
            }
            if (player == null) player = BasePlayer.Find(steamId);

            string finalPlayerName = (player != null && !string.IsNullOrEmpty(player.displayName))
                ? player.displayName
                : (!string.IsNullOrEmpty(delivery.playerName) && delivery.playerName != "Jogador" ? delivery.playerName : "Jogador");

            string groupName = !string.IsNullOrEmpty(delivery.groupName)
                ? delivery.groupName
                : (config.VipGroups.ContainsKey(tier) ? config.VipGroups[tier] : $"vip_{tier}");

            if (!permission.GroupExists(groupName))
            {
                permission.CreateGroup(groupName, groupName, 0);
            }

            permission.AddUserGroup(steamId, groupName);

            if (config.VipTierPermissions.ContainsKey(tier))
            {
                foreach (var perm in config.VipTierPermissions[tier])
                {
                    if (!string.IsNullOrEmpty(perm))
                    {
                        permission.GrantUserPermission(steamId, perm, null);
                    }
                }
            }

            if (!string.IsNullOrEmpty(delivery.kitPermission))
            {
                permission.GrantUserPermission(steamId, delivery.kitPermission, null);
            }

            DateTime expiresAt;
            if (!string.IsNullOrEmpty(delivery.expiresAt) && DateTime.TryParse(delivery.expiresAt, out var parsedExpires))
            {
                expiresAt = parsedExpires.ToUniversalTime();
            }
            else
            {
                expiresAt = DateTime.UtcNow.AddDays(delivery.durationDays > 0 ? delivery.durationDays : 30);
            }

            if (data.ActiveVips.TryGetValue(steamId, out var existingVip) && existingVip.IsActive && existingVip.Tier == tier && existingVip.ExpiresAt > DateTime.UtcNow)
            {
                expiresAt = existingVip.ExpiresAt.AddDays(delivery.durationDays > 0 ? delivery.durationDays : 30);
            }

            var record = new VipRecord
            {
                SteamId = steamId,
                PlayerName = finalPlayerName,
                Tier = tier,
                GroupName = groupName,
                KitPermission = delivery.kitPermission ?? "",
                OrderId = delivery.orderId ?? "",
                ActivatedAt = DateTime.UtcNow,
                ExpiresAt = expiresAt,
                IsActive = true
            };

            data.ActiveVips[steamId] = record;
            if (!string.IsNullOrEmpty(delivery.orderId))
            {
                data.ProcessedOrders.Add(delivery.orderId);
            }
            SaveData();

            if (config.VipActivationCommands.ContainsKey(tier))
            {
                foreach (var cmd in config.VipActivationCommands[tier])
                {
                    if (!string.IsNullOrEmpty(cmd))
                    {
                        ConsoleSystem.Run(ConsoleSystem.Option.Server, cmd.Replace("{steamid}", steamId).Replace("{player}", finalPlayerName));
                    }
                }
            }

            bool isKit = tier == "farmer" || tier == "airdrop" || tier == "cartao" || tier == "eletrica";
            string nomePacote;
            if (tier == "farmer") nomePacote = "Kit Farmer";
            else if (tier == "airdrop") nomePacote = "Kit Airdrop";
            else if (tier == "cartao") nomePacote = "Kit Cartões";
            else if (tier == "eletrica") nomePacote = "Kit Elétrica";
            else if (tier == "bronze") nomePacote = "VIP Bronze";
            else if (tier == "prata") nomePacote = "VIP Prata";
            else if (tier == "ouro") nomePacote = "VIP Ouro";
            else nomePacote = $"VIP {char.ToUpper(tier[0]) + tier.Substring(1)}";

            PrintToChat($"{config.VipChatPrefix} O jogador <color=#10B981>{record.PlayerName}</color> adquiriu o pacote <color=#F59E0B>{nomePacote}</color>! Agradecemos pelo apoio!");

            if (player != null && player.IsConnected)
            {
                string beneficio = isKit ? "seus kits exclusivos" : "seus itens e aproveite a fila prioritária";
                PrintToChat(player, $"{config.VipChatPrefix} <color=#10B981>Parabéns!</color> Seu <color=#F59E0B>{nomePacote}</color> foi ativado com sucesso!\n" +
                                   $"- Validade: <color=#38BDF8>30 dias</color> (Expira em: {expiresAt.ToLocalTime():dd/MM/yyyy HH:mm})\n" +
                                   $"- Use <color=#F59E0B>/kit</color> para resgatar {beneficio}!");
            }

            Puts($"[HorizonVIP] ✔ {nomePacote} concedido com sucesso para {record.PlayerName} ({steamId}) por 30 dias (até {expiresAt:yyyy-MM-dd HH:mm}).");

            ConfirmDelivery(delivery.orderId);
        }

        private void ConfirmDelivery(string orderId)
        {
            if (string.IsNullOrEmpty(orderId)) return;

            string url = $"{config.VipApiBaseUrl.TrimEnd('/')}/api/vip/confirm";
            string body = JsonConvert.SerializeObject(new { orderId = orderId });

            webrequest.Enqueue(url, body, (code, response) =>
            {
                if (code == 200)
                {
                    Puts($"[HorizonVIP] Entrega do pedido '{orderId}' confirmada com sucesso na API.");
                }
                else
                {
                    Puts($"[HorizonVIP] Aviso: Resposta {code} ao confirmar pedido {orderId} na API.");
                }
            }, this, RequestMethod.POST, new Dictionary<string, string> { { "Content-Type", "application/json" } });
        }

        private void CheckVipExpirations()
        {
            if (!config.VipEnabled || data == null || data.ActiveVips == null || data.ActiveVips.Count == 0) return;

            var toRemove = new List<string>();
            DateTime now = DateTime.UtcNow;

            foreach (var kv in data.ActiveVips)
            {
                var record = kv.Value;
                if (record == null) continue;

                if (now >= record.ExpiresAt)
                {
                    toRemove.Add(kv.Key);
                }
            }

            foreach (var steamId in toRemove)
            {
                RevokeVip(steamId, "Prazo de 30 dias expirado");
            }
        }

        public void RevokeVip(string steamId, string motivo = "Expirado")
        {
            if (!data.ActiveVips.TryGetValue(steamId, out var record)) return;

            string groupName = !string.IsNullOrEmpty(record.GroupName)
                ? record.GroupName
                : (config.VipGroups.ContainsKey(record.Tier) ? config.VipGroups[record.Tier] : $"vip_{record.Tier}");

            if (permission.GroupExists(groupName) && permission.UserHasGroup(steamId, groupName))
            {
                permission.RemoveUserGroup(steamId, groupName);
            }

            if (config.VipTierPermissions.ContainsKey(record.Tier))
            {
                foreach (var perm in config.VipTierPermissions[record.Tier])
                {
                    if (!string.IsNullOrEmpty(perm))
                    {
                        permission.RevokeUserPermission(steamId, perm);
                    }
                }
            }

            if (!string.IsNullOrEmpty(record.KitPermission))
            {
                permission.RevokeUserPermission(steamId, record.KitPermission);
            }

            if (config.VipRevocationCommands != null && config.VipRevocationCommands.ContainsKey(record.Tier))
            {
                foreach (var cmd in config.VipRevocationCommands[record.Tier])
                {
                    if (!string.IsNullOrEmpty(cmd))
                    {
                        ConsoleSystem.Run(ConsoleSystem.Option.Server, cmd.Replace("{steamid}", steamId).Replace("{player}", record.PlayerName));
                    }
                }
            }

            record.IsActive = false;
            data.ActiveVips.Remove(steamId);
            data.ExpiredHistory.Add(record);
            SaveData();

            Puts($"[HorizonVIP] VIP de {record.PlayerName} ({steamId}) foi removido. Motivo: {motivo}");

            BasePlayer player = null;
            if (ulong.TryParse(steamId, out ulong parsedUserId))
            {
                player = BasePlayer.FindByID(parsedUserId);
                if (player == null) player = BasePlayer.FindSleeping(parsedUserId);
            }
            if (player == null) player = BasePlayer.Find(steamId);

            if (player != null && player.IsConnected)
            {
                PrintToChat(player, $"{config.VipChatPrefix} Seu plano <color=#F59E0B>VIP {record.Tier.ToUpper()}</color> expirou. Renove em: <color=#38BDF8>{config.VipApiBaseUrl}/loja</color>");
            }
        }

        // -------------------------------------------------------------
        // COMANDOS DE CHAT E CONSOLE PARA VIPS
        // -------------------------------------------------------------
        [ChatCommand("vip")]
        private void CmdChatVip(BasePlayer player, string command, string[] args)
        {
            if (player == null) return;
            string id = player.UserIDString;

            if (args.Length > 0 && args[0].ToLower() == "resgatar")
            {
                PrintToChat(player, $"{config.VipChatPrefix} Verificando pagamentos e resgates no Mercado Pago...");
                CheckPendingDeliveries();
                return;
            }

            if (data.ActiveVips.TryGetValue(id, out var vip) && vip.IsActive && vip.ExpiresAt > DateTime.UtcNow)
            {
                var remaining = vip.ExpiresAt - DateTime.UtcNow;
                string tierFormatado = char.ToUpper(vip.Tier[0]) + vip.Tier.Substring(1);

                PrintToChat(player, $"{config.VipChatPrefix} <color=#10B981>=== SEU STATUS VIP ===</color>\n" +
                                   $"- Pacote: <color=#F59E0B>VIP {tierFormatado}</color>\n" +
                                   $"- Tempo Restante: <color=#38BDF8>{remaining.Days} dias, {remaining.Hours} horas e {remaining.Minutes} minutos</color>\n" +
                                   $"- Expira em: <color=#E2E8F0>{vip.ExpiresAt.ToLocalTime():dd/MM/yyyy HH:mm}</color>\n" +
                                   $"- Resgatar itens: digite <color=#F59E0B>/kit</color>");
            }
            else
            {
                PrintToChat(player, $"{config.VipChatPrefix} Você não possui nenhum pacote VIP ativo no momento.\n" +
                                   $"Adquira seu VIP com ativação imediata via PIX em: <color=#38BDF8>{config.VipApiBaseUrl}/loja</color>\n" +
                                   $"Se você acabou de pagar, digite <color=#F59E0B>/vip resgatar</color> para forçar a verificação.");
            }
        }

        [ConsoleCommand("vip.grant")]
        private void CmdVipGrant(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin) return;
            if (arg.Args == null || arg.Args.Length < 2)
            {
                arg.ReplyWith("Uso: vip.grant <steamid> <bronze|prata|ouro> [dias]");
                return;
            }

            string steamId = arg.GetString(0);
            string tier = (arg.GetString(1) ?? "bronze").ToLower();
            int dias = arg.GetInt(2, 30);

            GrantVip(new PendingDelivery
            {
                orderId = $"MANUAL-{DateTime.UtcNow:yyyyMMddHHmmss}",
                steamId = steamId,
                playerName = "Jogador",
                vipTier = tier,
                durationDays = dias
            });

            arg.ReplyWith($"[HorizonCore] VIP {tier} concedido manualmente para {steamId} por {dias} dias.");
        }

        [ConsoleCommand("vip.revoke")]
        private void CmdVipRevoke(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin) return;
            if (arg.Args == null || arg.Args.Length < 1)
            {
                arg.ReplyWith("Uso: vip.revoke <steamid>");
                return;
            }

            string steamId = arg.GetString(0);
            RevokeVip(steamId, "Revogado por Admin no console");
            arg.ReplyWith($"[HorizonCore] VIP de {steamId} revogado com sucesso.");
        }

        [ConsoleCommand("vip.list")]
        private void CmdVipList(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin) return;
            arg.ReplyWith($"=== VIPs ATIVOS NO HORIZON ({data.ActiveVips.Count}) ===");
            foreach (var kv in data.ActiveVips)
            {
                var v = kv.Value;
                if (v == null) continue;
                var rest = v.ExpiresAt - DateTime.UtcNow;
                arg.ReplyWith($"[VIP] {v.PlayerName} ({v.SteamId}) | {v.Tier.ToUpper()} | Restam: {rest.Days}d {rest.Hours}h (Expira: {v.ExpiresAt.ToLocalTime():dd/MM/yyyy HH:mm})");
            }
        }

    }
}
